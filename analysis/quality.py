"""Filtrado por calidad usando `valid_fraction`, la métrica real del cubo."""

from __future__ import annotations

import logging

import xarray as xr

log = logging.getLogger(__name__)

# 30%: por debajo de esto la media espacial queda dominada por los bordes de
# nube que SCL no atrapó, y la serie mete ruido que parece señal.
DEFAULT_MIN_VALID = 0.3


def filter_valid(cube: xr.Dataset, min_valid: float = DEFAULT_MIN_VALID) -> xr.Dataset:
    """Descarta las fechas con menos de `min_valid` de píxeles útiles."""
    if "valid_fraction" not in cube:
        raise ValueError("El cubo no tiene `valid_fraction`; ¿salió de get_cube?")

    keep = cube["valid_fraction"] >= min_valid
    n_total = int(cube.sizes.get("time", 0))
    out = cube.where(keep.compute(), drop=True)
    n_kept = int(out.sizes.get("time", 0))
    log.info("filter_valid: %d/%d fechas con validez >= %.0f%%", n_kept, n_total, min_valid * 100)
    return out
