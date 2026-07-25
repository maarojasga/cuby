"""Capa de ingesta — polígono -> cubo en disco.

`get_cube` se importa perezoso: arrastra el stack geoespacial completo
(odc, rasterio, planetary_computer), y los módulos livianos del paquete
(aoi, cache, thin) deben poder importarse y testearse sin él.
"""

from .aoi import AOI
from .cache import PIPELINE_VERSION

__all__ = ["AOI", "PIPELINE_VERSION", "get_cube"]


def __getattr__(name: str):
    if name == "get_cube":
        from .cube import get_cube

        return get_cube
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
