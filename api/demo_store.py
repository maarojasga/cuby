"""Acceso a los reportes de demo precalculados (api/demo/).

Son el camino rápido y el fallback: la demo del frontend funciona al instante
y sigue viva aunque el procesamiento en vivo esté apagado o sin red. Cada
reporte trae `meta.source = "demo"`, así el frontend puede rotularlo honesto.
"""

from __future__ import annotations

import json
from functools import lru_cache

from .settings import DEMO_DIR


@lru_cache(maxsize=1)
def index() -> list[dict]:
    path = DEMO_DIR / "index.json"
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def report(parcel_id: str) -> dict | None:
    path = DEMO_DIR / f"{parcel_id}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))
