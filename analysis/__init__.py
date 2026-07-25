"""Capa de análisis — consume cubos, nunca habla con STAC.

Todo lo que entra acá es un Dataset que ya salió de `ingest.get_cube`:
reflectancia float32, nubes en NaN, `valid_fraction` por fecha.
"""

from .indices import ndvi, ndvi_series
from .quality import filter_valid

__all__ = ["filter_valid", "ndvi", "ndvi_series"]
