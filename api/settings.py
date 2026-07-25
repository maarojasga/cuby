"""Configuración del backend, toda por variables de entorno."""

from __future__ import annotations

import os
from pathlib import Path

# Raíz del repo, para encontrar data/ sin depender del cwd.
ROOT = Path(__file__).resolve().parent.parent

PARCELS_DIR = ROOT / "data" / "parcels"

# Caché de cubos Zarr (lo comparte con la capa de ingesta).
CACHE_ROOT = Path(os.environ.get("CUBY_CACHE_ROOT", ROOT / "cache"))

# Ventana histórica por defecto para el score (años hacia atrás).
DEFAULT_YEARS = int(os.environ.get("CUBY_DEFAULT_YEARS", "3"))

# Resolución de trabajo en metros.
RESOLUTION = int(os.environ.get("CUBY_RESOLUTION", "10"))

# Orígenes permitidos para CORS. Coma-separados; "*" por defecto (demo).
CORS_ORIGINS = os.environ.get("CUBY_CORS_ORIGINS", "*").split(",")

# Si es "1", /analyze intenta procesar en vivo contra Sentinel-2. Si es "0"
# (o faltan las dependencias pesadas), la API sirve solo datos de demo.
LIVE_ENABLED = os.environ.get("CUBY_LIVE", "1") == "1"

# Asistente IA (Gemini). La API key la pone el operador por variable de entorno;
# nunca viaja al navegador. Sin key, /chat responde que no está configurado.
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
