"""Muestreo de escenas por intervalo, sin red ni items STAC reales."""

from datetime import datetime, timezone
from types import SimpleNamespace

from ingest.thin import thin_items


def _item(day: str, cloud: float, tile: str = "A"):
    return SimpleNamespace(
        datetime=datetime.fromisoformat(day).replace(tzinfo=timezone.utc),
        properties={"eo:cloud_cover": cloud},
        id=f"{day}-{tile}",
    )


def test_sin_intervalo_no_toca_nada():
    items = [_item("2024-01-01", 10), _item("2024-01-06", 20)]
    assert thin_items(items, None) == items
    assert thin_items(items, 5) == items


def test_elige_el_dia_menos_nublado_por_ventana():
    items = [
        _item("2024-01-01", 80),
        _item("2024-01-06", 10),  # el mejor de la primera ventana de 15 días
        _item("2024-01-11", 50),
        _item("2024-01-21", 5),   # el mejor de la segunda
        _item("2024-01-26", 90),
    ]
    out = thin_items(items, 15)
    assert [it.id for it in out] == ["2024-01-06-A", "2024-01-21-A"]


def test_conserva_los_tiles_de_un_mismo_dia():
    # Escena partida en dos tiles MGRS: si se elige ese día, van los dos.
    items = [
        _item("2024-01-03", 40, "A"),
        _item("2024-01-03", 30, "B"),
        _item("2024-01-08", 70, "A"),
    ]
    out = thin_items(items, 15)
    assert [it.id for it in out] == ["2024-01-03-A", "2024-01-03-B"]


def test_lista_vacia():
    assert thin_items([], 15) == []
