# Backend del Score de Riesgo Verde + Alertas Tempranas.
#
# python:3.11-slim + un puñado de libs de sistema alcanza: rasterio, pyproj y
# shapely traen sus binarios GDAL/PROJ/GEOS en las ruedas manylinux, y
# odc-stac / odc-geo / xarray / dask son Python puro. Las ruedas de rasterio
# igual enlazan contra libs de sistema muy comunes (libexpat, zlib) que la
# imagen slim NO trae por defecto — de ahí que haya que instalarlas.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    CUBY_CACHE_ROOT=/data/cache

WORKDIR /app

# Librerías de sistema en tiempo de EJECUCIÓN que necesitan las ruedas del
# stack geoespacial (rasterio enlaza libexpat/zlib; libgomp lo usan numpy y
# GDAL para OpenMP). Sin libexpat1, `import rasterio` falla con
# "libexpat.so.1: cannot open shared object file". curl es para el healthcheck.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl build-essential \
        libexpat1 zlib1g libgomp1 \
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
