"""El contrato. Todo lo demás en el paquete existe para cumplir esta firma."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Sequence

import xarray as xr

from .aoi import AOI, normalize_aoi
from .cache import DEFAULT_CACHE_ROOT, cache_key, cache_path, read_cube, write_cube
from .catalog import search_items
from .load import load_items, to_reflectance
from .mask import mask_clouds

log = logging.getLogger(__name__)

DEFAULT_BANDS = ("red", "nir", "scl")


class NoItemsFound(RuntimeError):
    """El catálogo no devolvió escenas para ese AOI y rango."""


def get_cube(
    aoi: Any,
    start: str,
    end: str,
    collection: str = "sentinel-2-l2a",
    bands: Sequence[str] = DEFAULT_BANDS,
    resolution: int = 10,
    cache_root: Path | str = DEFAULT_CACHE_ROOT,
    refresh: bool = False,
    max_cloud_cover: float | None = None,
) -> xr.Dataset:
    """Cualquier polígono -> cubo espacio-temporal en disco, listo para leer.

    Devuelve un Dataset (time, y, x) con nubes ya enmascaradas, reflectancia
    en float32 y una serie `valid_fraction` por fecha.

    Si el cubo ya está en caché se lee y ya. Si no, se construye. Ese es el
    único condicional.
    """
    bands = list(bands)
    if "scl" not in bands:
        bands.append("scl")

    norm: AOI = normalize_aoi(aoi)
    key = cache_key(norm, collection, start, end, bands, resolution)
    path = cache_path(cache_root, norm.aoi_id, key)

    if path.exists() and not refresh:
        try:
            log.info("Cache hit: %s", path)
            return read_cube(path)
        except Exception as exc:
            # Un caché ilegible no debe tumbar la corrida: se reconstruye.
            log.warning("Caché ilegible en %s (%s); se reconstruye", path, exc)

    log.info("Cache miss: construyendo %s (%s)", norm, key)
    items = search_items(
        norm.bbox, start, end, collection=collection, max_cloud_cover=max_cloud_cover
    )
    if not items:
        raise NoItemsFound(
            f"Sin escenas de {collection} para {norm.aoi_id} entre {start} y {end}"
        )

    ds = load_items(items, norm, bands, resolution=resolution)
    ds = to_reflectance(ds, bands)
    ds = mask_clouds(ds, norm)
    ds.attrs["cache_key"] = key
    ds.attrs["query"] = f"{collection}|{start}|{end}|{resolution}m"

    write_cube(ds, path)

    # Se relee del disco a propósito: así el objeto que devolvemos en un miss
    # es idéntico al que devolvemos en un hit, chunking y dtypes incluidos.
    return read_cube(path)
