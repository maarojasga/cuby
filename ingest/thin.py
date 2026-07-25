"""Muestreo temporal de escenas ANTES de descargar.

Para análisis de cultivos, lecturas a menos de ~2 semanas no aportan: la
fenología se mueve lento y las pasadas de Sentinel-2 cada 5 días solo agregan
volumen. Elegir una escena por ventana *antes* de cargar el cubo ahorra la
mayor parte de la descarga.

Dentro de cada ventana se queda el día con menor `eo:cloud_cover`. Ese campo
es del tile completo y es mala señal *fina* (por eso no filtramos con él en el
catálogo), pero como criterio *relativo* entre días de la misma ventana es
suficiente: el día menos nublado del tile suele ser el menos nublado del lote.

Sin dependencias pesadas: se puede testear sin red ni GDAL.
"""

from __future__ import annotations

from collections import defaultdict

# A la cadencia nativa de Sentinel-2 (~5 días) no hay nada que muestrear.
NATIVE_CADENCE_DAYS = 5


def thin_items(items: list, interval_days: int | None) -> list:
    """Se queda con las escenas de un día por ventana de `interval_days`.

    Los items de un mismo día solar se conservan juntos (una escena partida en
    dos tiles MGRS necesita ambos para cubrir el AOI). `items` debe venir
    ordenado por fecha, como lo devuelve `search_items`.
    """
    if not items or not interval_days or interval_days <= NATIVE_CADENCE_DAYS:
        return items

    by_day: dict = defaultdict(list)
    for it in items:
        by_day[it.datetime.date()].append(it)

    days = sorted(by_day)
    d0 = days[0]

    buckets: dict[int, list] = defaultdict(list)
    for d in days:
        buckets[(d - d0).days // interval_days].append(d)

    def day_cloud(d) -> float:
        return min(
            float(it.properties.get("eo:cloud_cover", 100.0)) for it in by_day[d]
        )

    keep: list = []
    for _, bucket_days in sorted(buckets.items()):
        best = min(bucket_days, key=day_cloud)
        keep.extend(by_day[best])
    return keep
