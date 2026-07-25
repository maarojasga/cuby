"""Enmascaramiento por SCL, recorte real por geometría y métrica de calidad."""

from __future__ import annotations

import logging

import numpy as np
import odc.geo.xr  # noqa: F401  (registra el accessor .odc en xarray)
import xarray as xr
from pyproj import CRS, Transformer
from rasterio.features import geometry_mask as rio_geometry_mask
from shapely.ops import transform as shapely_transform

from .aoi import AOI

log = logging.getLogger(__name__)

SCL_CLASSES = {
    0: "nodata",
    1: "saturado_defectuoso",
    2: "casted_shadows",
    3: "sombra_de_nube",
    4: "vegetacion",
    5: "suelo_desnudo",
    6: "agua",
    7: "no_clasificado",
    8: "nube_probabilidad_media",
    9: "nube_probabilidad_alta",
    10: "cirros",
    11: "nieve_hielo",
}

# Clase 2 queda fuera del descarte por defecto: sobre suelo desnudo brillante
# y lotes de arroz recién cosechados SCL la dispara con frecuencia y te come
# escenas buenas. Clase 7 tampoco se descarta por lo mismo.
DEFAULT_DROP = frozenset({0, 1, 3, 8, 9, 10})


def _inside_mask(ds: xr.Dataset, aoi: AOI) -> xr.DataArray:
    """Máscara booleana: True dentro del polígono.

    `geopolygon` en odc.stac.load recorta al *bbox* del polígono, no enmascara
    lo de afuera. Si el AOI no es rectangular, todo lo que caiga en el bbox
    pero fuera del lote entra a las estadísticas sin este paso.
    """
    gbox = ds.odc.geobox
    target = CRS.from_user_input(str(gbox.crs))
    tr = Transformer.from_crs(CRS.from_epsg(4326), target, always_xy=True)
    geom = shapely_transform(tr.transform, aoi.geometry)

    inside = rio_geometry_mask(
        [geom],
        out_shape=tuple(gbox.shape),
        transform=gbox.transform,
        invert=True,  # invert=True -> True dentro de la geometría
        all_touched=False,
    )
    return xr.DataArray(
        inside,
        dims=("y", "x"),
        coords={"y": ds["y"], "x": ds["x"]},
        name="inside_aoi",
    )


def mask_clouds(
    ds: xr.Dataset,
    aoi: AOI,
    drop_classes: frozenset[int] = DEFAULT_DROP,
    keep_scl: bool = True,
) -> xr.Dataset:
    """Escribe NaN en píxeles nubosos y fuera del polígono.

    Agrega `valid_fraction` (una serie por fecha): la proporción de píxeles
    útiles dentro del AOI. Esa es la métrica de calidad real del cubo — sirve
    para descartar escenas basura aguas abajo y para saber dónde falla el
    propio dato antes de que lo pregunte alguien más.
    """
    if "scl" not in ds:
        raise ValueError("Necesito la banda `scl` para enmascarar")

    scl = ds["scl"]
    clear = ~scl.isin(list(drop_classes))
    inside = _inside_mask(ds, aoi)
    valid = clear & inside

    out = ds.copy()
    for name in ds.data_vars:
        if name == "scl":
            continue
        out[name] = ds[name].astype("float32").where(valid)

    n_inside = int(inside.sum().item())
    if n_inside == 0:
        raise ValueError("El polígono no cubre ningún píxel a esta resolución")

    out["valid_fraction"] = (valid.sum(dim=("y", "x")) / n_inside).astype("float32")
    out["valid_fraction"].attrs.update(
        long_name="fraccion de pixeles validos dentro del AOI",
        n_pixels_aoi=n_inside,
    )

    if keep_scl:
        out["scl"] = scl.where(inside, np.uint8(0)).astype("uint8")
    else:
        out = out.drop_vars("scl")

    out.attrs["scl_dropped_classes"] = sorted(drop_classes)
    out.attrs["n_pixels_aoi"] = n_inside
    return out
