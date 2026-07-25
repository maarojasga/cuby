"""Índices espectrales sobre el cubo.

Tres índices, cada uno leyendo un par de bandas de Sentinel-2:

| Índice | Bandas            | Para qué                                         |
|--------|-------------------|--------------------------------------------------|
| NDVI   | (nir - red)       | Biomasa / salud general. Historial de crédito.   |
| NDMI   | (nir - swir16)    | Agua en la canopia. Alertas de estrés hídrico.   |
| NDRE   | (nir - rededge)   | Clorofila. Detecta plagas días antes que el NDVI.|

Todos comparten la misma forma normalizada (a - b) / (a + b), así que la
lógica vive en un solo lugar y cada índice solo declara su par de bandas.
"""

from __future__ import annotations

import xarray as xr

# Nombre canónico de banda en el cubo -> par (numerador, denominador base).
# La fórmula siempre es (a - b) / (a + b) con a la primera banda.
_INDEX_BANDS: dict[str, tuple[str, str]] = {
    "ndvi": ("nir", "red"),
    "ndmi": ("nir", "swir16"),
    "ndre": ("nir", "rededge"),
}


def _normalized_difference(cube: xr.Dataset, name: str) -> xr.DataArray:
    """Índice de diferencia normalizada genérico: (a - b) / (a + b).

    Los NaN de la máscara de nubes se propagan solos; no hace falta
    re-enmascarar aguas abajo.
    """
    a_name, b_name = _INDEX_BANDS[name]
    for band in (a_name, b_name):
        if band not in cube:
            raise ValueError(
                f"El cubo no tiene la banda `{band}` que necesita {name.upper()}. "
                f"Pedila en get_cube(..., bands=[...])."
            )
    a, b = cube[a_name], cube[b_name]
    out = (a - b) / (a + b)
    out.name = name
    return out


def _series(cube: xr.Dataset, name: str) -> xr.DataArray:
    """Índice promediado sobre el polígono: una cifra por fecha.

    El promedio ignora NaN, así que las nubes parciales no arrastran la
    media hacia abajo; solo reducen la cantidad de píxeles que la soportan.
    """
    serie = _normalized_difference(cube, name).mean(dim=("y", "x"), skipna=True)
    serie.name = f"{name}_mean"
    return serie


def ndvi(cube: xr.Dataset) -> xr.DataArray:
    """NDVI por píxel y fecha: (nir - red) / (nir + red). Biomasa total."""
    return _normalized_difference(cube, "ndvi")


def ndvi_series(cube: xr.Dataset) -> xr.DataArray:
    """Serie temporal de NDVI: promedio sobre el polígono, una cifra por fecha."""
    return _series(cube, "ndvi")


def ndmi(cube: xr.Dataset) -> xr.DataArray:
    """NDMI por píxel y fecha: (nir - swir16) / (nir + swir16).

    Usa el infrarrojo de onda corta (B11) para medir el contenido de agua en
    la hoja. Cae antes de que la planta se marchite a la vista: es la señal
    para las alertas de estrés hídrico.
    """
    return _normalized_difference(cube, "ndmi")


def ndmi_series(cube: xr.Dataset) -> xr.DataArray:
    """Serie temporal de NDMI: promedio sobre el polígono, una cifra por fecha."""
    return _series(cube, "ndmi")


def ndre(cube: xr.Dataset) -> xr.DataArray:
    """NDRE por píxel y fecha: (nir - rededge) / (nir + rededge).

    La banda Red Edge (B5) reacciona a la clorofila antes que el rojo, así que
    detecta caídas por plaga o enfermedad días antes de que el NDVI se entere.
    """
    return _normalized_difference(cube, "ndre")


def ndre_series(cube: xr.Dataset) -> xr.DataArray:
    """Serie temporal de NDRE: promedio sobre el polígono, una cifra por fecha."""
    return _series(cube, "ndre")
