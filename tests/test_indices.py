"""NDVI, NDMI y NDRE sobre un cubo sintético, sin red ni ingest."""

import numpy as np
import pytest
import xarray as xr

from analysis import (
    ndmi,
    ndmi_series,
    ndre,
    ndre_series,
    ndvi,
    ndvi_series,
)


def _cubo() -> xr.Dataset:
    def band(val):
        return (("time", "y", "x"), np.full((2, 2, 2), val, dtype="float32"))

    return xr.Dataset(
        {
            "red": band(0.10),
            "nir": band(0.30),
            "swir16": band(0.15),
            "rededge": band(0.20),
        },
        coords={
            "time": np.array(["2024-01-01", "2024-01-06"], dtype="datetime64[ns]"),
            "y": np.arange(2.0),
            "x": np.arange(2.0),
        },
    )


def test_ndvi_valor():
    # (0.30 - 0.10) / (0.30 + 0.10) = 0.5
    assert float(ndvi(_cubo()).isel(time=0).mean()) == pytest.approx(0.5)


def test_ndmi_valor():
    # (0.30 - 0.15) / (0.30 + 0.15) = 0.3333
    assert float(ndmi(_cubo()).isel(time=0).mean()) == pytest.approx(1 / 3, abs=1e-4)


def test_ndre_valor():
    # (0.30 - 0.20) / (0.30 + 0.20) = 0.2
    assert float(ndre(_cubo()).isel(time=0).mean()) == pytest.approx(0.2)


def test_series_una_cifra_por_fecha():
    for fn in (ndvi_series, ndmi_series, ndre_series):
        serie = fn(_cubo())
        assert serie.dims == ("time",)
        assert serie.sizes["time"] == 2


def test_ndmi_exige_banda_swir16():
    cubo = _cubo().drop_vars("swir16")
    with pytest.raises(ValueError, match="swir16"):
        ndmi(cubo)


def test_ndre_exige_banda_rededge():
    cubo = _cubo().drop_vars("rededge")
    with pytest.raises(ValueError, match="rededge"):
        ndre(cubo)
