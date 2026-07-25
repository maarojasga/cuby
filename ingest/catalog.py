"""Consulta al catálogo STAC.

Este es el único módulo del sistema que sabe que STAC existe. Todo lo que
está aguas abajo de `get_cube` lee el cubo en disco, nunca el catálogo.
"""

from __future__ import annotations

import logging
import time

import planetary_computer
import pystac_client
import requests
from pystac import Item
from pystac_client.exceptions import APIError

log = logging.getLogger(__name__)

MPC_STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"

# El catálogo de MPC devuelve 5xx y timeouts con cierta regularidad. Tres
# intentos con backoff cubren el 99% de eso sin esconder un caído de verdad.
MAX_RETRIES = 3
RETRY_BASE_DELAY_S = 2.0

_RETRYABLE = (APIError, requests.exceptions.ConnectionError, requests.exceptions.Timeout)


def open_catalog(url: str = MPC_STAC) -> pystac_client.Client:
    """Cliente con firma automática de assets.

    `sign_inplace` como modifier hace que las URLs de los assets salgan ya
    firmadas de la búsqueda. Sin esto, odc.stac.load falla con 404 y es el
    error donde se pierde la primera hora de cualquier arranque.
    """
    return pystac_client.Client.open(url, modifier=planetary_computer.sign_inplace)


def search_items(
    bbox: tuple[float, float, float, float],
    start: str,
    end: str,
    collection: str = "sentinel-2-l2a",
    max_cloud_cover: float | None = None,
    client: pystac_client.Client | None = None,
) -> list[Item]:
    """Busca escenas por bbox y rango de fechas.

    `max_cloud_cover` viene en None a propósito. `eo:cloud_cover` es una
    propiedad del tile MGRS completo (110x110 km); para un AOI de unos pocos
    km² no dice casi nada: un tile al 70% puede tener el polígono despejado y
    uno al 20% puede tenerlo tapado. El filtro real es la fracción de píxeles
    válidos que calcula `mask.py`, ya a nivel de polígono. Se deja el
    parámetro por si hace falta cortar volumen en una exploración.
    """
    query = None
    if max_cloud_cover is not None:
        query = {"eo:cloud_cover": {"lt": max_cloud_cover}}

    last_exc: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            c = client or open_catalog()
            search = c.search(
                collections=[collection],
                bbox=list(bbox),
                datetime=f"{start}/{end}",
                query=query,
            )
            items = sorted(search.items(), key=lambda it: it.datetime)
            log.info(
                "STAC: %d items en %s [%s .. %s]", len(items), collection, start, end
            )
            return items
        except _RETRYABLE as exc:
            last_exc = exc
            if attempt == MAX_RETRIES:
                break
            delay = RETRY_BASE_DELAY_S * attempt
            log.warning(
                "STAC falló (intento %d/%d): %s — reintento en %.0fs",
                attempt, MAX_RETRIES, exc, delay,
            )
            time.sleep(delay)

    raise RuntimeError(
        f"El catálogo STAC no respondió tras {MAX_RETRIES} intentos"
    ) from last_exc
