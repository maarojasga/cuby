"""API del Score de Riesgo Verde y las Alertas Tempranas.

    GET  /health                      ping
    GET  /parcels                     parcelas de demo (con score y geometría)
    GET  /parcels/{id}/report         reporte de una parcela (demo o en vivo)
    POST /analyze                     analiza un polígono GeoJSON arbitrario

El procesamiento pesado de Sentinel-2 (ingesta + cubo) se hace en vivo cuando
se puede; si las dependencias geoespaciales no están o el catálogo falla, la
API cae con elegancia a los reportes de demo precalculados.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import demo_store
from .settings import CORS_ORIGINS, DEFAULT_YEARS, LIVE_ENABLED, RESOLUTION

log = logging.getLogger("api")

app = FastAPI(
    title="Cuby — Score de Riesgo Verde & Alertas Tempranas",
    description="Análisis de parcelas con Sentinel-2 (NDVI/NDMI/NDRE).",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    geojson: dict = Field(..., description="Feature, FeatureCollection (1) o Geometry")
    name: str = Field("Parcela", description="Nombre legible de la parcela")
    start: str | None = Field(None, description="YYYY-MM-DD; por defecto 3 años atrás")
    end: str | None = Field(None, description="YYYY-MM-DD; por defecto hoy")


def _default_range() -> tuple[str, str]:
    end = date.today()
    start = end - timedelta(days=int(DEFAULT_YEARS * 365.25))
    return start.isoformat(), end.isoformat()


def _analyze_live(geojson: dict, name: str, start: str, end: str,
                  parcel_id: str | None = None) -> dict:
    """Corre la tubería real: GeoJSON -> cubo -> reporte. Import perezoso.

    Las dependencias geoespaciales (odc, rasterio, ...) se importan acá adentro
    para que la API arranque y sirva demo incluso donde no estén instaladas.
    """
    from analysis import REQUIRED_BANDS, build_report
    from ingest import get_cube
    from ingest.aoi import AOITooLarge

    try:
        cube = get_cube(
            geojson, start, end,
            bands=REQUIRED_BANDS,
            resolution=RESOLUTION,
        )
    except AOITooLarge as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    report = build_report(cube, parcela=name, parcel_id=parcel_id,
                          meta={"source": "sentinel-2", "start": start, "end": end})
    return report


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "live_enabled": LIVE_ENABLED, "parcels": len(demo_store.index())}


@app.get("/parcels")
def parcels() -> list[dict]:
    """Parcelas de demostración con su geometría y resumen de score."""
    return demo_store.index()


@app.get("/parcels/{parcel_id}/report")
def parcel_report(
    parcel_id: str,
    live: bool = Query(False, description="Forzar procesamiento en vivo"),
) -> dict:
    """Reporte de una parcela de demo.

    Por defecto devuelve el reporte precalculado (instantáneo). Con `?live=true`
    reprocesa el polígono real contra Sentinel-2.
    """
    demo = demo_store.report(parcel_id)
    if demo is None:
        raise HTTPException(status_code=404, detail=f"Parcela desconocida: {parcel_id}")

    if not live:
        return demo

    if not LIVE_ENABLED:
        raise HTTPException(status_code=503, detail="El procesamiento en vivo está deshabilitado")

    geometry = (demo.get("meta") or {}).get("geometry")
    if not geometry:
        raise HTTPException(status_code=422, detail="La parcela de demo no trae geometría para reprocesar")

    start, end = _default_range()
    try:
        return _analyze_live(geometry, demo.get("parcela", parcel_id), start, end, parcel_id)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        log.exception("Fallo el análisis en vivo de %s", parcel_id)
        raise HTTPException(status_code=502, detail=f"No se pudo procesar en vivo: {exc}") from exc


@app.post("/analyze")
def analyze(req: AnalyzeRequest) -> dict:
    """Analiza un polígono GeoJSON arbitrario contra Sentinel-2."""
    if not LIVE_ENABLED:
        raise HTTPException(
            status_code=503,
            detail="El procesamiento en vivo está deshabilitado en este despliegue. "
                   "Probá las parcelas de demostración en /parcels.",
        )

    start = req.start or _default_range()[0]
    end = req.end or _default_range()[1]
    try:
        return _analyze_live(req.geojson, req.name, start, end)
    except HTTPException:
        raise
    except ImportError as exc:
        log.exception("Faltan dependencias geoespaciales")
        raise HTTPException(
            status_code=503,
            detail="Este despliegue no tiene el motor geoespacial instalado; "
                   "usá las parcelas de demostración.",
        ) from exc
    except Exception as exc:  # noqa: BLE001
        log.exception("Fallo el análisis de un polígono")
        raise HTTPException(status_code=502, detail=f"No se pudo procesar: {exc}") from exc
