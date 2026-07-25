"""Genera los GeoJSON de las parcelas de demostración.

Coordenadas reales sobre zonas agrícolas de Colombia. Los polígonos son
aproximados (el usuario puede reajustarlos en el mapa); lo que importa es que
caen sobre suelo agrícola verificable en cualquier imagen satelital.

    python scripts/make_parcels.py

Escribe un archivo por parcela en data/parcels/ y un índice parcels.json.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "parcels"

# metros -> grados, aproximado a la latitud dada
def _circle(lon: float, lat: float, radius_m: float, n: int = 48) -> list[list[float]]:
    dlat = radius_m / 111_320.0
    dlon = radius_m / (111_320.0 * math.cos(math.radians(lat)))
    ring = []
    for i in range(n + 1):
        a = 2 * math.pi * i / n
        ring.append([round(lon + dlon * math.cos(a), 6), round(lat + dlat * math.sin(a), 6)])
    return ring


def _rect(lon: float, lat: float, w_m: float, h_m: float) -> list[list[float]]:
    dlat = h_m / 2 / 111_320.0
    dlon = w_m / 2 / (111_320.0 * math.cos(math.radians(lat)))
    return [
        [round(lon - dlon, 6), round(lat - dlat, 6)],
        [round(lon + dlon, 6), round(lat - dlat, 6)],
        [round(lon + dlon, 6), round(lat + dlat, 6)],
        [round(lon - dlon, 6), round(lat + dlat, 6)],
        [round(lon - dlon, 6), round(lat - dlat, 6)],
    ]


# id, nombre, cultivo, región, historia para la demo, geometría
PARCELS = [
    {
        "id": "pivote-meta",
        "name": "Pivote Central — Puerto Gaitán",
        "crop": "Maíz / Soya",
        "region": "Meta, Colombia (Altillanura)",
        "story": "healthy",  # cultivo sano y estable -> bajo riesgo
        "ring": _circle(-71.7500, 4.0500, 400),
    },
    {
        "id": "arroz-tolima",
        "name": "Lote de Arroz — Saldaña",
        "crop": "Arroz",
        "region": "Tolima, Colombia (Distrito de riego)",
        "story": "variable",  # ciclos irregulares -> riesgo medio
        "ring": _rect(-75.0200, 3.9300, 700, 500),
    },
    {
        "id": "cana-valle",
        "name": "Caña de Azúcar — Valle del Cauca",
        "crop": "Caña de azúcar",
        "region": "Valle del Cauca, Colombia",
        "story": "healthy",
        "ring": _rect(-76.3000, 3.5500, 650, 600),
    },
    {
        "id": "palma-meta",
        "name": "Palma de Aceite — San Carlos de Guaroa",
        "crop": "Palma de aceite",
        "region": "Meta, Colombia",
        "story": "permanent",  # vegetación permanente -> verificación lo marca
        "ring": _rect(-73.2400, 3.7200, 600, 600),
    },
    {
        "id": "estres-tolima",
        "name": "Lote con Estrés — Espinal",
        "crop": "Arroz",
        "region": "Tolima, Colombia",
        "story": "stressed",  # alerta activa reciente
        "ring": _rect(-74.8800, 4.1500, 600, 450),
    },
]


def _feature(p: dict) -> dict:
    return {
        "type": "Feature",
        "properties": {
            "id": p["id"],
            "name": p["name"],
            "crop": p["crop"],
            "region": p["region"],
            "story": p["story"],
        },
        "geometry": {"type": "Polygon", "coordinates": [p["ring"]]},
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    index = {"type": "FeatureCollection", "features": []}
    for p in PARCELS:
        feat = _feature(p)
        (OUT / f"{p['id']}.geojson").write_text(
            json.dumps(feat, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        index["features"].append(feat)
    (OUT / "parcels.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"{len(PARCELS)} parcelas escritas en {OUT}")


if __name__ == "__main__":
    main()
