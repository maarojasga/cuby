"""La API sirve recomendaciones y responde con gracia sin el motor pesado."""

import pytest

fastapi = pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

from api.main import app  # noqa: E402

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_parcels_son_recomendaciones_sin_analisis():
    parcels = client.get("/parcels").json()
    assert len(parcels) >= 1
    p = parcels[0]
    assert {"id", "name", "crop", "region", "geometry"} <= set(p)
    assert p["geometry"]["type"] == "Polygon"
    # Sin demo: las recomendaciones no traen score ni series precalculadas.
    assert "score" not in p


def test_analyze_valida_intervalo():
    body = {
        "geojson": {"type": "Polygon", "coordinates": [[[0, 0], [0, 1], [1, 1], [0, 0]]]},
        "interval_days": 2,  # < 5 no es válido
    }
    assert client.post("/analyze", json=body).status_code == 422


def test_analyze_sin_motor_responde_con_gracia():
    # Sin las deps geoespaciales instaladas, /analyze debe responder 503/502,
    # nunca un 500 sin explicación. Con el motor instalado y red, 200 o 422.
    body = {
        "geojson": {
            "type": "Polygon",
            "coordinates": [[[-74.95, 4.40], [-74.94, 4.40], [-74.94, 4.41], [-74.95, 4.40]]],
        },
        "name": "Test",
        "start": "2024-01-01",
        "end": "2024-02-01",
        "interval_days": 15,
    }
    r = client.post("/analyze", json=body)
    assert r.status_code in (200, 422, 502, 503)
    if r.status_code != 200:
        assert r.json()["detail"]
