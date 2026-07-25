"""Índices espectrales sobre el cubo."""

from __future__ import annotations

import xarray as xr


def ndvi(cube: xr.Dataset) -> xr.DataArray:
    """NDVI por píxel y fecha: (nir - red) / (nir + red).

    Los NaN de la máscara se propagan solos; no hace falta re-enmascarar.
    """
    for band in ("nir", "red"):
        if band not in cube:
            raise ValueError(f"El cubo no tiene la banda `{band}`")
    out = (cube["nir"] - cube["red"]) / (cube["nir"] + cube["red"])
    out.name = "ndvi"
    return out


def ndvi_series(cube: xr.Dataset) -> xr.DataArray:
    """Serie temporal: NDVI promediado sobre el polígono, una cifra por fecha.

    El promedio ignora NaN, así que las nubes parciales no arrastran la
    media hacia abajo; solo reducen la cantidad de píxeles que la soportan.
    """
    serie = ndvi(cube).mean(dim=("y", "x"), skipna=True)
    serie.name = "ndvi_mean"
    return serie
