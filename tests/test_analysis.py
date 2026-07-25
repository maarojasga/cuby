"""La capa de análisis opera sobre un cubo sintético, sin red ni ingest."""

import numpy as np
import pytest
import xarray as xr

from analysis import filter_valid, ndvi, ndvi_series


def _cubo(valid_fraction=(0.9, 0.1, 0.5)) -> xr.Dataset:
    n_t = len(valid_fraction)
    red = np.full((n_t, 2, 2), 0.1, dtype="float32")
    nir = np.full((n_t, 2, 2), 0.3, dtype="float32")
    return xr.Dataset(
        {
            "red": (("time", "y", "x"), red),
            "nir": (("time", "y", "x"), nir),
            "valid_fraction": (("time",), np.array(valid_fraction, dtype="float32")),
        },
        coords={
            "time": np.arange(n_t).astype("datetime64[D]").astype("datetime64[ns]"),
            "y": np.arange(2.0),
            "x": np.arange(2.0),
        },
    )


def test_ndvi_valor():
    # (0.3 - 0.1) / (0.3 + 0.1) = 0.5
    assert float(ndvi(_cubo()).isel(time=0).mean()) == pytest.approx(0.5)


def test_ndvi_series_una_cifra_por_fecha():
    serie = ndvi_series(_cubo())
    assert serie.dims == ("time",)
    assert serie.sizes["time"] == 3


def test_ndvi_ignora_nan():
    cubo = _cubo()
    cubo["red"][0, 0, 0] = np.nan
    cubo["nir"][0, 0, 0] = np.nan
    assert float(ndvi_series(cubo).isel(time=0)) == pytest.approx(0.5)


def test_filter_valid_descarta_fechas():
    out = filter_valid(_cubo(valid_fraction=(0.9, 0.1, 0.5)), min_valid=0.3)
    assert out.sizes["time"] == 2


def test_filter_valid_exige_valid_fraction():
    cubo = _cubo().drop_vars("valid_fraction")
    with pytest.raises(ValueError, match="valid_fraction"):
        filter_valid(cubo)


def test_ndvi_exige_bandas():
    cubo = _cubo().drop_vars("nir")
    with pytest.raises(ValueError, match="nir"):
        ndvi(cubo)
