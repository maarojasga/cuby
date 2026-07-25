"""API del Score de Riesgo Verde y las Alertas Tempranas — 100% Sentinel-2.

    GET  /health     ping
    GET  /parcels    lugares recomendados (solo coordenadas, sin análisis)
    POST /analyze    recopila imágenes y analiza un polígono GeoJSON

El flujo del producto: el usuario elige o dibuja una parcela, define el rango
de fechas y el intervalo entre imágenes, y /analyze construye el cubo real
(catálogo STAC -> descarga -> máscara de nubes -> índices -> score + alertas).
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from datetime import date, timedelta
from functools import lru_cache
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .settings import (
    CACHE_ROOT,
    CORS_ORIGINS,
    DEFAULT_YEARS,
    GEMINI_API_KEY,
    GEMINI_MODEL,
    LIVE_ENABLED,
    PARCELS_DIR,
    RESOLUTION,
)

log = logging.getLogger("api")

# Para cultivos, lecturas a menos de ~2 semanas no aportan; 15 días es un buen
# equilibrio entre detalle fenológico y volumen de descarga.
DEFAULT_INTERVAL_DAYS = 15

app = FastAPI(
    title="Cuby — Score de Riesgo Verde & Alertas Tempranas",
    description="Análisis de parcelas con Sentinel-2 (NDVI/NDMI/NDRE).",
    version="2.0.0",
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
    interval_days: int = Field(
        DEFAULT_INTERVAL_DAYS,
        ge=5,
        le=60,
        description="Días entre imágenes; 5 = todas las pasadas de Sentinel-2",
    )
    crop: str | None = Field(None, description="Cultivo declarado (informativo)")
    region: str | None = Field(None, description="Región (informativo)")


def _default_range() -> tuple[str, str]:
    end = date.today()
    start = end - timedelta(days=int(DEFAULT_YEARS * 365.25))
    return start.isoformat(), end.isoformat()


@lru_cache(maxsize=1)
def _recommendations() -> list[dict]:
    """Lugares recomendados: parcelas reales sobre zonas agrícolas conocidas.

    Solo coordenadas y contexto — el análisis siempre se hace en vivo.
    """
    path = PARCELS_DIR / "parcels.json"
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    out = []
    for feat in data.get("features", []):
        p = feat.get("properties", {})
        out.append({
            "id": p.get("id"),
            "name": p.get("name"),
            "crop": p.get("crop"),
            "region": p.get("region"),
            "geometry": feat.get("geometry"),
        })
    return out


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "live_enabled": LIVE_ENABLED,
        "recomendaciones": len(_recommendations()),
    }


@app.get("/parcels")
def parcels() -> list[dict]:
    """Lugares recomendados para empezar (geometría + contexto, sin análisis)."""
    return _recommendations()


@app.post("/analyze")
def analyze(req: AnalyzeRequest) -> dict:
    """Recopila las imágenes del rango pedido y analiza el polígono."""
    if not LIVE_ENABLED:
        raise HTTPException(
            status_code=503,
            detail="El procesamiento está deshabilitado en este despliegue (CUBY_LIVE=0).",
        )

    start = req.start or _default_range()[0]
    end = req.end or _default_range()[1]

    try:
        # Import perezoso: si el motor geoespacial no está instalado, la API
        # arranca igual y este endpoint lo dice claro.
        from analysis import REQUIRED_BANDS, build_report
        from ingest import get_cube
        from ingest.aoi import AOITooLarge
        from ingest.cube import NoItemsFound
    except ImportError as exc:
        log.exception("Faltan dependencias geoespaciales")
        raise HTTPException(
            status_code=503,
            detail="Este despliegue no tiene el motor geoespacial instalado.",
        ) from exc

    try:
        cube = get_cube(
            req.geojson,
            start,
            end,
            bands=REQUIRED_BANDS,
            resolution=RESOLUTION,
            interval_days=req.interval_days,
            cache_root=CACHE_ROOT,  # respeta CUBY_CACHE_ROOT (volumen persistente)
        )
    except AOITooLarge as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except NoItemsFound as exc:
        raise HTTPException(
            status_code=422,
            detail=f"No hay escenas de Sentinel-2 para esa zona y rango: {exc}",
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        log.exception("Fallo la recopilación de imágenes")
        raise HTTPException(
            status_code=502,
            detail=f"No se pudieron recopilar las imágenes: {exc}",
        ) from exc

    try:
        geometry = req.geojson.get("geometry", req.geojson) if isinstance(req.geojson, dict) else None
        return build_report(
            cube,
            parcela=req.name,
            meta={
                "source": "sentinel-2",
                "start": start,
                "end": end,
                "interval_days": req.interval_days,
                "crop": req.crop,
                "region": req.region,
                "geometry": geometry,
            },
        )
    except Exception as exc:  # noqa: BLE001
        log.exception("Fallo el análisis del cubo")
        raise HTTPException(
            status_code=502, detail=f"No se pudo analizar el cubo: {exc}"
        ) from exc


# ─────────────────────────── Asistente IA (Gemini) ───────────────────────────

SYSTEM_PROMPT = (
    "Sos Cuby, un asistente de inteligencia agrícola satelital. Explicás, en "
    "español claro y conciso, los resultados de un análisis de parcela hecho con "
    "imágenes Sentinel-2: el Score de Riesgo Verde (aptitud de la tierra como "
    "garantía de un crédito de siembra, de 0 a 100), la verificación del cultivo, "
    "y las alertas tempranas de estrés (NDVI biomasa, NDMI humedad, NDRE "
    "clorofila). Hablás tanto para un agricultor como para un analista de crédito. "
    "Usá SOLO la información del contexto entregado; si algo no está, decilo con "
    "honestidad en vez de inventarlo. No repitas todo el contexto: respondé la "
    "pregunta. Evitá tecnicismos innecesarios y andá al grano."
)


class ChatMessage(BaseModel):
    role: str = Field(..., description="'user' o 'assistant'")
    content: str


class ChatRequest(BaseModel):
    context: str = Field("", description="Resumen del reporte analizado")
    messages: list[ChatMessage] = Field(default_factory=list)


def _gemini(system_text: str, messages: list[ChatMessage]) -> str:
    contents = [
        {
            "role": "user" if m.role == "user" else "model",
            "parts": [{"text": m.content}],
        }
        for m in messages
        if m.content.strip()
    ]
    body = {
        "systemInstruction": {"parts": [{"text": system_text}]},
        "contents": contents,
        "generationConfig": {"temperature": 0.4, "maxOutputTokens": 900},
    }
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    )
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        out = json.loads(resp.read().decode("utf-8"))

    candidates = out.get("candidates") or []
    if not candidates:
        # Puede venir vacío por filtros de seguridad o prompt bloqueado.
        return "No pude generar una respuesta para eso. Probá reformular la pregunta."
    parts = candidates[0].get("content", {}).get("parts", [])
    text = "".join(p.get("text", "") for p in parts).strip()
    return text or "No pude generar una respuesta para eso."


@app.post("/chat")
def chat(req: ChatRequest) -> dict:
    """Pregúntale a Cuby: resume el análisis y responde preguntas vía Gemini.

    La API key vive en el servidor (GEMINI_API_KEY); nunca viaja al navegador.
    """
    if not GEMINI_API_KEY:
        return {
            "ok": False,
            "reply": "El asistente todavía no está configurado en el servidor "
            "(falta la API key de Gemini). Pedile al administrador que defina "
            "GEMINI_API_KEY.",
        }
    if not req.messages:
        return {"ok": False, "reply": "No recibí ninguna pregunta."}

    system_text = SYSTEM_PROMPT
    if req.context.strip():
        system_text += "\n\n=== CONTEXTO DEL ANÁLISIS ACTUAL ===\n" + req.context.strip()

    try:
        return {"ok": True, "reply": _gemini(system_text, req.messages)}
    except urllib.error.HTTPError as exc:  # noqa: PERF203
        detail = exc.read().decode("utf-8", "ignore")[:300]
        log.error("Gemini HTTP %s: %s", exc.code, detail)
        msg = "No pude responder ahora (error del modelo)."
        if exc.code in (400, 403):
            msg = "La API key de Gemini parece inválida o sin permisos."
        elif exc.code == 429:
            msg = "El asistente está saturado (límite de cuota). Probá en un momento."
        return {"ok": False, "reply": msg}
    except Exception as exc:  # noqa: BLE001
        log.exception("Fallo el chat")
        return {"ok": False, "reply": "No pude conectar con el asistente."}
