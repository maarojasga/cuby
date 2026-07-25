# Capa de ingesta

Un solo objetivo: que cualquier polígono se convierta en un cubo espacio-temporal
en disco, listo para leer. Sin detectores, sin score, sin eventos.

**La frontera:** nada aguas abajo vuelve a hablar con STAC. Todo lee el cubo.

## Contrato

```python
from ingest import get_cube

cube = get_cube(
    aoi,                       # GeoJSON dict o shapely
    "2021-01-01", "2026-07-01",
    collection="sentinel-2-l2a",
    bands=["red", "nir", "rededge", "swir16", "scl"],
    resolution=10,
)                              # -> xr.Dataset (time, y, x), nubes enmascaradas
```

Devuelve además `valid_fraction`: la proporción de píxeles útiles dentro del
polígono, por fecha. Esa es la métrica de calidad del cubo.

## Bandas

| Nombre en el cubo | Asset MPC | Resolución | Para |
|---|---|---|---|
| `red` | B04 | 10 m | NDVI |
| `nir` | B08 | 10 m | NDVI, NDMI, NDRE |
| `rededge` | B05 | 20 m | NDRE (clorofila) |
| `swir16` | B11 | 20 m | NDMI (humedad) |
| `scl` | SCL | 20 m | máscara de nubes |

`rededge` y `swir16` se piden por asset key (B05/B11): sus common_names STAC son
ambiguos entre proveedores. `red`/`nir` resuelven por common_name y se dejan
pasar tal cual. Ver `ingest/load.py`.

## Orden de ataque

```bash
pip install -r requirements.txt
python -m ingest smoke                 # 1. red, firma de URLs, credenciales
python -m ingest hydrate data/parcels/pivote-meta.geojson --start 2024-01-01 --end 2024-02-01 -v
```

El `smoke` primero, siempre. Valida lo que falla más seguido antes de que
haya lógica encima.

## Semáforo verde

```python
from ingest import get_cube
from analysis import filter_valid, ndvi_series

cube = filter_valid(get_cube(mi_poligono, "2021-01-01", "2026-07-01"))
ndvi_series(cube).plot()
```

Si sale una curva en sierra, la base está terminada.

Si sale plana: revisá que el polígono no tenga varios lotes desfasados en
siembra — el promedio espacial los cancela entre sí. Probá con un solo lote
antes de concluir que la base falló.

## Decisiones que no son obvias

| Decisión | Por qué |
|---|---|
| `groupby="solar_day"` | Sin esto, una escena partida entre tiles o entre órbitas genera dos timestamps con medio AOI en nodata cada uno. Dientes falsos en la serie. |
| `resampling={"scl": "nearest"}` | SCL viene a 20 m. Interpolarla a 10 m inventa códigos de clase que no existen. |
| Sin filtro `eo:cloud_cover` | Es una propiedad del tile de 110x110 km. Para un AOI de 5 km² no informa nada. El filtro real es `valid_fraction`. |
| Máscara por geometría aparte | `geopolygon` en odc.stac.load recorta al bbox, no enmascara lo de afuera. |
| Offset de baseline 04.00 | Desde 2022-01-25 los DN traen -1000. Sin corregir, la serie tiene un salto artificial a mitad de camino. **Verificá si tu colección ya viene armonizada: aplicarlo dos veces es igual de malo.** |
| Escritura a `.tmp` + `os.replace` | Un Zarr a medio escribir es un directorio que existe y que un `path.exists()` lee como cache hit. |
| `stac_item_ids` en los attrs | MPC reprocesa y agrega escenas. Misma clave, distinto contenido, sin forma de auditar por qué. |
| `PIPELINE_VERSION` en la clave | Reprocesar sin borrar nada a mano cuando cambie la lógica. |

## Trampas del proveedor

- Los nombres de banda en MPC son `red`, `nir` — no `B04`, `B08`. Y `nir`
  es B08 a 10 m, distinto de `nir08`/B8A a 20 m. El asset STAC de la máscara
  es `SCL`; `load.py` lo mapea a `scl` en el cubo.
- `sentinel-1-grd` está abierta en MPC; verificá el acceso a `sentinel-1-rtc`
  antes de contar con ella.
- No cargues más de dos o tres bandas mientras explorás: la diferencia en tiempo
  de descarga mata la iteración.
