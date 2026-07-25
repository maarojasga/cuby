"""Clave de caché determinista y escritura atómica, incluido el caso refresh."""

import numpy as np
import pytest
import xarray as xr
from shapely.geometry import Polygon

from ingest.aoi import normalize_aoi
from ingest.cache import cache_key, cache_path, read_cube, write_cube

AOI = normalize_aoi(
    Polygon([(-74.95, 4.40), (-74.93, 4.40), (-74.93, 4.42), (-74.95, 4.42)])
)


def _cubo(valor: float) -> xr.Dataset:
    data = np.full((2, 4, 4), valor, dtype="float32")
    return xr.Dataset(
        {"red": (("time", "y", "x"), data)},
        coords={
            "time": np.array(["2024-01-01", "2024-01-06"], dtype="datetime64[ns]"),
            "y": np.arange(4.0),
            "x": np.arange(4.0),
        },
    )


def test_cache_key_determinista():
    k1 = cache_key(AOI, "sentinel-2-l2a", "2024-01-01", "2024-02-01", ["red", "nir"], 10)
    k2 = cache_key(AOI, "sentinel-2-l2a", "2024-01-01", "2024-02-01", ["red", "nir"], 10)
    assert k1 == k2


def test_cache_key_ignora_orden_de_bandas():
    k1 = cache_key(AOI, "s2", "2024-01-01", "2024-02-01", ["red", "nir", "scl"], 10)
    k2 = cache_key(AOI, "s2", "2024-01-01", "2024-02-01", ["scl", "nir", "red"], 10)
    assert k1 == k2


@pytest.mark.parametrize(
    "cambio",
    [
        {"resolution": 20},
        {"start": "2023-01-01"},
        {"collection": "otra"},
        {"bands": ["red"]},
    ],
)
def test_cache_key_cambia_con_los_parametros(cambio):
    base = dict(
        collection="s2", start="2024-01-01", end="2024-02-01",
        bands=["red", "nir"], resolution=10,
    )
    k_base = cache_key(AOI, **base)
    k_mod = cache_key(AOI, **{**base, **cambio})
    assert k_base != k_mod


def test_roundtrip(tmp_path):
    path = cache_path(tmp_path, AOI.aoi_id, "clave")
    write_cube(_cubo(1.0), path)
    ds = read_cube(path)
    assert float(ds["red"].mean()) == 1.0


def test_sobrescribir_cache_existente(tmp_path):
    """Regresión: os.replace no pisa directorios; --refresh debe funcionar."""
    path = cache_path(tmp_path, AOI.aoi_id, "clave")
    write_cube(_cubo(1.0), path)
    write_cube(_cubo(2.0), path)
    assert float(read_cube(path)["red"].mean()) == 2.0


def test_no_quedan_temporales(tmp_path):
    path = cache_path(tmp_path, AOI.aoi_id, "clave")
    write_cube(_cubo(1.0), path)
    write_cube(_cubo(2.0), path)
    restos = [p.name for p in path.parent.iterdir() if p.name != path.name]
    assert restos == []
