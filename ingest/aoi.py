"""Normalización de AOI.

Entra un GeoJSON o una geometría shapely, sale una geometría canónica en
EPSG:4326 con un id estable. El id es un hash del WKT redondeado a 6 decimales
sobre la geometría ya orientada y validada, de modo que el mismo polígono
resuelve al mismo caché aunque venga de otra fuente con otro winding o con
ruido en el decimal 12.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any

from pyproj import CRS, Transformer
from shapely import normalize as shapely_normalize
from shapely import wkt as shapely_wkt
from shapely.geometry import MultiPolygon, shape
from shapely.geometry.base import BaseGeometry
from shapely.geometry.polygon import orient
from shapely.ops import transform as shapely_transform
from shapely.validation import make_valid

MAX_AREA_HA = 500.0
WKT_PRECISION = 6


class AOITooLarge(ValueError):
    """El polígono excede el área máxima permitida."""


@dataclass(frozen=True)
class AOI:
    geometry: BaseGeometry
    aoi_id: str
    bbox: tuple[float, float, float, float]
    area_ha: float

    def __repr__(self) -> str:  # pragma: no cover - cosmético
        return f"AOI(id={self.aoi_id}, area={self.area_ha:.1f} ha)"


def _to_geometry(aoi: Any) -> BaseGeometry:
    if isinstance(aoi, BaseGeometry):
        return aoi
    if isinstance(aoi, dict):
        kind = aoi.get("type")
        if kind == "Feature":
            return shape(aoi["geometry"])
        if kind == "FeatureCollection":
            feats = aoi.get("features", [])
            if len(feats) != 1:
                raise ValueError(
                    "Una FeatureCollection con varios features no es un AOI. "
                    "Usá el CLI `hydrate` para procesarlos uno por uno."
                )
            return shape(feats[0]["geometry"])
        return shape(aoi)
    raise TypeError(f"No sé convertir {type(aoi)!r} en geometría")


def _orient(geom: BaseGeometry) -> BaseGeometry:
    """Winding canónico: exterior antihorario, interiores horarios."""
    if geom.geom_type == "Polygon":
        return orient(geom, sign=1.0)
    if geom.geom_type == "MultiPolygon":
        return MultiPolygon([orient(p, sign=1.0) for p in geom.geoms])
    raise ValueError(f"El AOI debe ser Polygon o MultiPolygon, llegó {geom.geom_type}")


def _area_ha(geom: BaseGeometry) -> float:
    """Área en hectáreas usando una LAEA centrada en el propio polígono.

    Calcular área sobre grados cuadrados en EPSG:4326 da números sin sentido,
    y una proyección global fija distorsiona según la latitud. Una LAEA local
    es exacta a efectos prácticos para polígonos de este tamaño.
    """
    lon, lat = geom.centroid.x, geom.centroid.y
    laea = CRS.from_proj4(
        f"+proj=laea +lat_0={lat} +lon_0={lon} +datum=WGS84 +units=m +no_defs"
    )
    tr = Transformer.from_crs(CRS.from_epsg(4326), laea, always_xy=True)
    return shapely_transform(tr.transform, geom).area / 10_000.0


def normalize_aoi(aoi: Any, max_area_ha: float = MAX_AREA_HA) -> AOI:
    """GeoJSON/shapely -> AOI canónico. Lanza AOITooLarge si se pasa de área."""
    geom = make_valid(_to_geometry(aoi))

    # Redondeamos de verdad la geometría, no solo el texto que hasheamos:
    # así el id y el dato que se carga siempre corresponden. Se redondea
    # ANTES de canonicalizar: el ruido decimal puede cambiar cuál es el
    # vértice mínimo con el que `normalize` elige dónde empieza el anillo.
    geom = shapely_wkt.loads(
        shapely_wkt.dumps(geom, rounding_precision=WKT_PRECISION)
    )

    # `orient` solo fija el sentido de giro; el mismo anillo empezando en
    # otro vértice seguiría dando otro WKT y otro id. `normalize` fija
    # también el vértice inicial y el orden de partes en un MultiPolygon.
    geom = _orient(shapely_normalize(geom))

    canonical_wkt = shapely_wkt.dumps(geom, rounding_precision=WKT_PRECISION)

    aoi_id = hashlib.sha256(canonical_wkt.encode("utf-8")).hexdigest()[:16]
    area_ha = _area_ha(geom)
    if area_ha > max_area_ha:
        raise AOITooLarge(
            f"AOI de {area_ha:.1f} ha excede el límite de {max_area_ha:.0f} ha"
        )

    minx, miny, maxx, maxy = geom.bounds
    return AOI(
        geometry=geom,
        aoi_id=aoi_id,
        bbox=(round(minx, 6), round(miny, 6), round(maxx, 6), round(maxy, 6)),
        area_ha=area_ha,
    )
