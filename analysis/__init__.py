"""Capa de análisis — consume cubos, nunca habla con STAC.

Todo lo que entra acá es un Dataset que ya salió de `ingest.get_cube`:
reflectancia float32, nubes en NaN, `valid_fraction` por fecha.

    indices   NDVI / NDMI / NDRE, por píxel y como serie temporal
    quality   filtro por valid_fraction
    series    puente xarray -> arrays planos (fechas, valores)
    score     Score de Riesgo Verde (banco)
    crop      verificación del cultivo (banco)
    alerts    alertas tempranas (agricultor)
    report    ensambla todo en el JSON que consume el frontend
"""

from .alerts import AlertReport, evaluate_alerts
from .crop import CropCheck, verify_crop
from .indices import (
    ndmi,
    ndmi_series,
    ndre,
    ndre_series,
    ndvi,
    ndvi_series,
)
from .quality import filter_valid
from .report import REQUIRED_BANDS, build_report, report_from_series
from .score import GreenScore, green_score
from .series import Series, to_series

__all__ = [
    "filter_valid",
    "ndvi", "ndvi_series",
    "ndmi", "ndmi_series",
    "ndre", "ndre_series",
    "Series", "to_series",
    "green_score", "GreenScore",
    "verify_crop", "CropCheck",
    "evaluate_alerts", "AlertReport",
    "build_report", "report_from_series", "REQUIRED_BANDS",
]
