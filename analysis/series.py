"""Extracción de series limpias desde el cubo.

Frontera entre lo espacial (xarray) y lo temporal (numpy). Aguas abajo,
`score` y `alerts` trabajan sobre arrays planos de fechas y valores: más
fáciles de testear, de serializar a JSON y de mandar al frontend.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import xarray as xr


@dataclass(frozen=True)
class Series:
    """Una serie temporal de un índice, ya sin NaN."""

    dates: np.ndarray  # datetime64[ns], ordenada
    values: np.ndarray  # float32
    name: str

    def __len__(self) -> int:
        return int(self.values.size)

    def to_records(self) -> list[dict]:
        """Formato JSON para el frontend: [{"date": "2024-01-05", "value": 0.72}]."""
        iso = self.dates.astype("datetime64[D]").astype(str)
        return [
            {"date": d, "value": round(float(v), 4)}
            for d, v in zip(iso, self.values)
        ]


def to_series(da: xr.DataArray, name: str | None = None) -> Series:
    """DataArray (time,) -> Series sin NaN, ordenada por fecha.

    Las fechas cuya media espacial salió NaN (escena totalmente nubosa dentro
    del AOI) se descartan: no aportan y ensucian cualquier estadística.
    """
    if "time" not in da.dims:
        raise ValueError(f"`{da.name}` no es una serie temporal (no tiene dim time)")

    values = np.asarray(da.values, dtype="float32")
    dates = np.asarray(da["time"].values, dtype="datetime64[ns]")

    finite = np.isfinite(values)
    dates, values = dates[finite], values[finite]

    order = np.argsort(dates)
    return Series(dates=dates[order], values=values[order], name=name or str(da.name))
