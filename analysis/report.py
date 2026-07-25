"""Reporte de parcela — el objeto que consume el frontend.

Toma un cubo ya ingerido y produce el JSON completo que alimenta las dos
vistas del producto: el Score de Riesgo Verde (banco) y las Alertas Tempranas
(agricultor). Es el único lugar donde se juntan las piezas de `analysis`.

    cubo ──> series NDVI/NDMI/NDRE ──┬─> green_score      (banco)
                                     ├─> verify_crop      (banco)
                                     └─> evaluate_alerts  (agricultor)
"""

from __future__ import annotations

import numpy as np
import xarray as xr

from .alerts import evaluate_alerts
from .crop import verify_crop
from .indices import ndmi_series, ndre_series, ndvi_series
from .indices import ndvi as ndvi_pixels
from .quality import filter_valid
from .score import green_score
from .series import Series, to_series

# Bandas que hay que pedirle al cubo para poder calcular los tres índices.
REQUIRED_BANDS = ("red", "nir", "rededge", "swir16", "scl")

# La superficie 3D del frontend: cuántas lecturas recientes y a qué resolución
# máxima viaja la grilla por píxel. 12 lecturas ≈ dos meses de Sentinel-2.
SURFACE_FRAMES = 12
SURFACE_MAX_CELLS = 32


def surface_from_cube(cube: xr.Dataset) -> dict | None:
    """Grilla NDVI por píxel de las últimas lecturas, para el relieve 3D.

    Devuelve frames (lista de matrices, None fuera del polígono/nube) más las
    fechas y la orientación del eje y, para que el frontend sepa dónde está el
    norte. Se degrada a None si faltan bandas o no hay datos.
    """
    try:
        da = ndvi_pixels(cube)
    except ValueError:
        return None
    if "time" not in da.dims or da.sizes.get("time", 0) == 0:
        return None

    da = da.isel(time=slice(-SURFACE_FRAMES, None))

    ny, nx = da.sizes.get("y", 0), da.sizes.get("x", 0)
    if ny < 2 or nx < 2:
        return None
    fy = max(1, int(np.ceil(ny / SURFACE_MAX_CELLS)))
    fx = max(1, int(np.ceil(nx / SURFACE_MAX_CELLS)))
    if fy > 1 or fx > 1:
        da = da.coarsen(y=fy, x=fx, boundary="trim").mean()

    vals = np.asarray(da.values, dtype="float32")
    dates = [str(d) for d in np.asarray(da["time"].values).astype("datetime64[D]")]

    frames = [
        [
            [None if not np.isfinite(v) else round(float(v), 3) for v in row]
            for row in frame
        ]
        for frame in vals
    ]

    # En los cubos UTM el eje y suele venir descendente: la primera fila es el
    # norte. El frontend usa esta pista para orientar el relieve y la brújula.
    ys = np.asarray(da["y"].values)
    north = "first_row" if len(ys) >= 2 and ys[0] > ys[-1] else "last_row"

    return {"index": "ndvi", "dates": dates, "frames": frames, "north": north}


def _valid_fraction_array(cube: xr.Dataset) -> np.ndarray | None:
    if "valid_fraction" not in cube:
        return None
    return np.asarray(cube["valid_fraction"].values, dtype="float32")


def _safe_series(fn, cube: xr.Dataset, name: str) -> Series:
    """Calcula una serie; si falta la banda, devuelve una serie vacía.

    Así el reporte no se cae por no tener B5 o B11: simplemente ese índice
    queda sin datos y las alertas que dependen de él no se evalúan.
    """
    try:
        return to_series(fn(cube), name)
    except ValueError:
        return Series(dates=np.array([], dtype="datetime64[ns]"),
                      values=np.array([], dtype="float32"), name=name)


def report_from_series(
    ndvi: Series,
    ndmi: Series,
    ndre: Series,
    parcela: str = "Parcela",
    parcel_id: str | None = None,
    valid_fraction: np.ndarray | None = None,
    meta: dict | None = None,
    surface: dict | None = None,
) -> dict:
    """Ensambla el reporte a partir de las tres series ya calculadas.

    Es el corazón compartido: `build_report` lo alimenta desde un cubo real y
    el generador de demo lo alimenta con series sintéticas. Mismo código de
    score, verificación y alertas en ambos casos. `surface` es la grilla por
    píxel para el relieve 3D (opcional).
    """
    score = green_score(ndvi, valid_fraction=valid_fraction)
    crop = verify_crop(ndvi)
    alerts = evaluate_alerts(ndvi, ndmi, ndre, parcela=parcela)

    return {
        "parcela": parcela,
        "parcel_id": parcel_id,
        "meta": meta or {},
        "series": {
            "ndvi": ndvi.to_records(),
            "ndmi": ndmi.to_records(),
            "ndre": ndre.to_records(),
        },
        "surface": surface,
        "credito": {
            "score": score.to_dict(),
            "verificacion_cultivo": crop.to_dict(),
        },
        "alertas": alerts.to_dict(),
        "cobertura": {
            "n_fechas": len(ndvi),
            "validez_media": (
                None
                if valid_fraction is None or not np.isfinite(valid_fraction).any()
                else round(float(np.nanmean(valid_fraction)), 3)
            ),
        },
    }


def build_report(
    cube: xr.Dataset,
    parcela: str = "Parcela",
    parcel_id: str | None = None,
    min_valid: float = 0.3,
    meta: dict | None = None,
) -> dict:
    """Cubo -> reporte completo (dict serializable a JSON).

    `min_valid` descarta las fechas demasiado nubosas antes de cualquier
    cálculo: es el filtro de calidad estándar de la capa de análisis.
    """
    clean = filter_valid(cube, min_valid=min_valid)

    ndvi = _safe_series(ndvi_series, clean, "ndvi")
    ndmi = _safe_series(ndmi_series, clean, "ndmi")
    ndre = _safe_series(ndre_series, clean, "ndre")

    return report_from_series(
        ndvi, ndmi, ndre,
        parcela=parcela,
        parcel_id=parcel_id,
        valid_fraction=_valid_fraction_array(clean),
        meta=meta,
        surface=surface_from_cube(clean),
    )
