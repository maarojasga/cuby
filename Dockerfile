# Backend del Score de Riesgo Verde + Alertas Tempranas.
#
# python:3.11-slim alcanza: rasterio, pyproj y shapely traen sus binarios
# GDAL/PROJ/GEOS en las ruedas manylinux, y odc-stac / odc-geo / xarray / dask
# son Python puro. No hace falta compilar GDAL a mano.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    CUBY_CACHE_ROOT=/data/cache

WORKDIR /app

# Curl para el healthcheck; build-essential por si alguna dep menor necesita
# compilar. Se limpia el índice de apt para no engordar la imagen.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl build-essential \
    && rm -rf /var/lib/apt/lists/*

# Primero las dependencias, para aprovechar la caché de capas de Docker.
COPY requirements.txt ./requirements.txt
COPY api/requirements.txt ./api-requirements.txt
RUN pip install -r requirements.txt -r api-requirements.txt

# El código.
COPY ingest ./ingest
COPY analysis ./analysis
COPY api ./api
COPY data ./data

RUN mkdir -p /data/cache

EXPOSE 8000

# Render/Railway inyectan $PORT; localmente cae a 8000.
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
