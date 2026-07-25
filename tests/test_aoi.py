"""La garantía que importa: mismo polígono -> mismo id, sin importar la fuente."""

import pytest
from shapely.geometry import Polygon, mapping

from ingest.aoi import AOITooLarge, normalize_aoi

# ~490 ha cerca de Tolima, el mismo AOI del smoke test.
COORDS = [(-74.95, 4.40), (-74.93, 4.40), (-74.93, 4.42), (-74.95, 4.42)]


def test_mismo_poligono_mismo_id():
    a = normalize_aoi(Polygon(COORDS))
    b = normalize_aoi(mapping(Polygon(COORDS)))
    assert a.aoi_id == b.aoi_id


def test_winding_no_cambia_el_id():
    horario = Polygon(COORDS[::-1])
    antihorario = Polygon(COORDS)
    assert normalize_aoi(horario).aoi_id == normalize_aoi(antihorario).aoi_id


def test_vertice_inicial_no_cambia_el_id():
    rotado = Polygon(COORDS[2:] + COORDS[:2])  # mismo anillo, empieza en otra esquina
    assert normalize_aoi(rotado).aoi_id == normalize_aoi(Polygon(COORDS)).aoi_id


def test_ruido_decimal_no_cambia_el_id():
    con_ruido = [(x + 1e-9, y - 1e-9) for x, y in COORDS]
    assert (
        normalize_aoi(Polygon(COORDS)).aoi_id
        == normalize_aoi(Polygon(con_ruido)).aoi_id
    )


def test_feature_geojson():
    feature = {
        "type": "Feature",
        "properties": {"name": "x"},
        "geometry": mapping(Polygon(COORDS)),
    }
    assert normalize_aoi(feature).aoi_id == normalize_aoi(Polygon(COORDS)).aoi_id


def test_featurecollection_multiple_rechazada():
    geom = mapping(Polygon(COORDS))
    fc = {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "properties": {}, "geometry": geom},
            {"type": "Feature", "properties": {}, "geometry": geom},
        ],
    }
    with pytest.raises(ValueError, match="FeatureCollection"):
        normalize_aoi(fc)


def test_area_maxima():
    # ~1 grado cuadrado: decenas de miles de ha, muy por encima del tope.
    gigante = Polygon([(-75.0, 4.0), (-74.0, 4.0), (-74.0, 5.0), (-75.0, 5.0)])
    with pytest.raises(AOITooLarge):
        normalize_aoi(gigante)


def test_tipo_invalido():
    with pytest.raises(TypeError):
        normalize_aoi("no soy una geometría")
