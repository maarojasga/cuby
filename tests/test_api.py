"""La API sirve los reportes de demo sin tocar red ni dependencias pesadas."""

import pytest

fastapi = pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

from api.main import app  # noqa: E402

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_parcels_trae_geometria_y_score():
    parcels = client.get("/parcels").json()
    assert len(parcels) >= 1
    p = parcels[0]
    assert {"id", "name", "geometry", "score", "risk_level"} <= set(p)
    assert p["geometry"]["type"] == "Polygon"


def test_reporte_demo_completo():
    r = client.get("/parcels/estres-tolima/report").json()
    assert r["credito"]["score"]["risk_level"] in ("bajo", "medio", "alto")
    assert r["alertas"]["estado"] == "alerta"
    assert len(r["series"]["ndvi"]) > 100
    assert r["meta"]["source"] == "demo"


def test_parcela_desconocida_404():
    assert client.get("/parcels/no-existe/report").status_code == 404


def test_analyze_sin_motor_responde_con_gracia():
    # Sin las deps geoespaciales instaladas, /analyze debe fallar con 503/502,
    # nunca con un 500 sin explicación.
    body = {
        "geojson": {"type": "Polygon", "coordinates": [[[0, 0], [0, 1], [1, 1], [0, 0]]]},
        "name": "Test",
    }
    r = client.post("/analyze", json=body)
    assert r.status_code in (200, 502, 503)
