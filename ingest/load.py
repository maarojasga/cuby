"""Carga perezosa del stack y paso a reflectancia."""

from __future__ import annotations

import logging
import os

import numpy as np
import odc.stac
import xarray as xr
from odc.geo.geom import Geometry
from pystac import Item

from .aoi import AOI

log = logging.getLogger(__name__)

# Las lecturas de tiles van por HTTP a Azure y fallan de forma transitoria
# (timeouts, 503, tokens en el borde de expirar). GDAL reintenta solo si se
# lo pedís. `setdefault` respeta lo que el usuario ya tenga configurado.
os.environ.setdefault("GDAL_HTTP_MAX_RETRY", "5")
os.environ.setdefault("GDAL_HTTP_RETRY_DELAY", "1")
# Evita un LIST por cada apertura de COG: menos requests, menos fallos.
os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")

DEFAULT_CHUNKS = {"time": 1, "y": 1024, "x": 1024}

# SCL es una máscara de clases: interpolarla inventa códigos que no existen
# (un píxel entre clase 4 y clase 8 sale clase 6). Siempre nearest.
DEFAULT_RESAMPLING = {"scl": "nearest", "SCL": "nearest", "*": "bilinear"}

# Nombre canónico en el cubo -> asset STAC en MPC.
#   red/nir resuelven por common_name y se dejan pasar tal cual.
#   rededge (B5) y swir16 (B11) se piden por asset key: sus common_names son
#   ambiguos (hay tres red-edge) o inconsistentes entre proveedores, así que
#   el asset directo es lo único robusto.
#   SCL en MPC va en mayúsculas; odc.stac no acepta el alias en minúsculas.
STAC_BAND_ALIASES = {
    "scl": "SCL",
    "rededge": "B05",
    "swir16": "B11",
}


def _stac_bands(bands: list[str]) -> list[str]:
    return [STAC_BAND_ALIASES.get(b, b) for b in bands]


def _canonicalize_band_names(ds: xr.Dataset) -> xr.Dataset:
    renames = {stac: canon for canon, stac in STAC_BAND_ALIASES.items() if stac in ds}
    return ds.rename(renames) if renames else ds

# Sentinel-2 baseline 04.00: desde esta fecha los productos L2A traen un
# offset de -1000 en los DN. Sin corregirlo, una serie 2021-2026 tiene un
# salto artificial a mitad de camino y el NDVI se rompe en silencio.
BASELINE_SHIFT = np.datetime64("2022-01-25")
BOA_OFFSET = -1000.0
BOA_SCALE = 1e-4


def load_items(
    items: list[Item],
    aoi: AOI,
    bands: list[str],
    resolution: int = 10,
    crs: str = "utm",
    chunks: dict | None = None,
) -> xr.Dataset:
    """Stack (time, y, x) perezoso, recortado al bbox del polígono.

    `groupby="solar_day"` no es opcional: sin él, una escena partida entre dos
    tiles MGRS o entre dos órbitas genera dos timestamps casi idénticos, cada
    uno con medio AOI en nodata. La serie temporal sale con dientes que no son
    fenología sino artefactos de mosaico.
    """
    if not items:
        raise ValueError("No hay items que cargar")

    geopolygon = Geometry(aoi.geometry, "EPSG:4326")

    ds = odc.stac.load(
        items,
        bands=_stac_bands(bands),
        crs=crs,
        resolution=resolution,
        groupby="solar_day",
        resampling=DEFAULT_RESAMPLING,
        chunks=chunks or DEFAULT_CHUNKS,
        geopolygon=geopolygon,
    )
    ds = _canonicalize_band_names(ds)

    # Trazabilidad: qué escenas exactas entraron en este cubo. MPC reprocesa y
    # agrega items, así que sin esto dos corridas con la misma clave de caché
    # pueden diferir sin forma de auditar por qué.
    ds.attrs["stac_item_ids"] = [it.id for it in items]
    ds.attrs["stac_collection"] = items[0].collection_id or ""
    ds.attrs["aoi_id"] = aoi.aoi_id
    ds.attrs["aoi_wkt"] = aoi.geometry.wkt
    ds.attrs["aoi_area_ha"] = round(aoi.area_ha, 2)

    log.info("Cubo perezoso: %s", dict(ds.sizes))
    return ds


def to_reflectance(ds: xr.Dataset, bands: list[str]) -> xr.Dataset:
    """DN enteros -> reflectancia float32, con el offset del baseline aplicado.

    Ojo: verificá contra la colección que estés usando si el offset ya viene
    armonizado del proveedor. Aplicarlo dos veces es tan malo como no aplicarlo.
    """
    offset = xr.where(ds["time"] >= BASELINE_SHIFT, BOA_OFFSET, 0.0)
    out = ds.copy()
    for band in bands:
        if band == "scl":
            continue
        out[band] = ((out[band].astype("float32") + offset) * BOA_SCALE).astype(
            "float32"
        )
        out[band].attrs["units"] = "reflectance"
    return out
