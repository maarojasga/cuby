"""Persistencia e idempotencia sobre Zarr local."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
from pathlib import Path

import xarray as xr

from .aoi import AOI

log = logging.getLogger(__name__)

# Subí esto cuando cambie la lógica del pipeline (máscara, escalado, groupby).
# Es lo que te deja reprocesar sin borrar nada a mano: la clave cambia sola y
# los cubos viejos quedan ahí, inertes, hasta que decidas limpiarlos.
PIPELINE_VERSION = "0.2.0"

DEFAULT_CACHE_ROOT = Path("cache")
WRITE_CHUNKS = {"time": 1, "y": 512, "x": 512}


def cache_key(
    aoi: AOI,
    collection: str,
    start: str,
    end: str,
    bands: list[str],
    resolution: int,
) -> str:
    payload = {
        "aoi_id": aoi.aoi_id,
        "collection": collection,
        "start": start,
        "end": end,
        "bands": sorted(bands),
        "resolution": resolution,
        "pipeline_version": PIPELINE_VERSION,
    }
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


def cache_path(root: Path | str, aoi_id: str, key: str) -> Path:
    return Path(root) / aoi_id / f"{key}.zarr"


def read_cube(path: Path) -> xr.Dataset:
    try:
        return xr.open_zarr(path, consolidated=True, chunks={})
    except (KeyError, FileNotFoundError):
        # Sin metadata consolidada (versión vieja o escritura parcial de otra
        # herramienta). Se puede leer igual, solo más lento.
        log.warning("Zarr sin metadata consolidada, lectura lenta: %s", path)
        return xr.open_zarr(path, consolidated=False, chunks={})


def write_cube(ds: xr.Dataset, path: Path) -> Path:
    """Escritura atómica.

    Un Zarr a medio escribir es un directorio que existe y que un
    `if path.exists()` lee felizmente como cache hit. Escribimos a un temporal
    y renombramos: el directorio final solo aparece cuando está completo.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")

    if tmp.exists():
        shutil.rmtree(tmp)

    # to_zarr rechaza chunks irregulares; hay que rechunkear explícito.
    chunks = {k: v for k, v in WRITE_CHUNKS.items() if k in ds.dims}
    ds.chunk(chunks).to_zarr(tmp, mode="w", consolidated=True)

    # os.replace no pisa un *directorio* existente (en Windows lanza error,
    # en POSIX solo si está vacío). Con --refresh el destino existe: se aparta
    # a .old, se publica el nuevo y recién entonces se borra el viejo. Si el
    # proceso muere en el medio, siempre hay un cubo completo en `path`.
    old = path.with_name(path.name + ".old")
    if old.exists():
        shutil.rmtree(old)
    if path.exists():
        os.replace(path, old)

    os.replace(tmp, path)

    if old.exists():
        shutil.rmtree(old, ignore_errors=True)

    log.info("Cubo escrito: %s", path)
    return path
