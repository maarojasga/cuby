# 🛰️ Cuby — Score de Riesgo Verde & Alertas Tempranas

Inteligencia agrícola sobre imágenes **Sentinel-2**, para dos audiencias:

- **Bancos y financieras** — un **Score de Riesgo Verde** (0-100) que dice qué
  tan productiva y confiable es una parcela como garantía de un crédito de
  siembra, a partir de su histórico de vegetación. Reduce visitas de perito.
- **Agricultores** — **alertas tempranas** que monitorean la parcela en cada
  pasada del satélite (~5 días) y avisan de estrés hídrico o plagas *antes* de
  que el daño sea visible a ojo.

Todo se apoya en tres índices espectrales, cada uno leyendo bandas específicas:

| Índice | Bandas Sentinel-2 | Para qué |
|---|---|---|
| **NDVI** | (B8 − B4) / (B8 + B4) | Biomasa y vigor. Base del historial de crédito. |
| **NDMI** | (B8 − B11) / (B8 + B11) | Agua en la hoja (SWIR). Alertas de estrés hídrico. |
| **NDRE** | (B8 − B5) / (B8 + B5) | Clorofila (Red Edge). Detecta plagas días antes que el NDVI. |

## Arquitectura

```
┌──────────────┐   polígono   ┌──────────────┐   cubo Zarr   ┌──────────────┐
│   Frontend   │ ───────────▶ │   Backend    │ ────────────▶ │   ingest     │
│  Next.js     │ ◀─────────── │  FastAPI     │ ◀──────────── │  (Sentinel-2)│
│  (Vercel)    │   reporte    │ (Render/HF)  │    reporte    └──────────────┘
└──────────────┘    JSON      └──────┬───────┘
                                     │ lee el cubo, nunca STAC
                                     ▼
                              ┌──────────────┐
                              │   analysis   │  índices · score · alertas
                              └──────────────┘
```

Cuatro capas, cada una detrás de una frontera clara:

| Capa | Carpeta | Qué hace | Depende de |
|---|---|---|---|
| Ingesta | `ingest/` | polígono → cubo espacio-temporal en disco | STAC / Planetary Computer |
| Análisis | `analysis/` | índices, score, verificación, alertas | solo lee el cubo |
| API | `api/` | expone el análisis por HTTP | ingest + analysis |
| Frontend | `web/` | mapa, dashboards, dibujo de parcelas | la API (o datos demo) |

La frontera entre ingesta y análisis es **el cubo en disco**: `ingest` lo
escribe, `analysis` lo lee. Nada aguas abajo de `get_cube` vuelve a hablar con
el catálogo.

## Módulo 1 — Score de Riesgo Verde (banco)

`analysis/score.py` toma 2-3 años de NDVI y produce un número 0-100 con desglose
y razones. Cuatro componentes, todos defendibles ante un comité de crédito:

- **Productividad** — vigor en la mejor parte del ciclo (NDVI pico).
- **Estabilidad** — consistencia de las cosechas año a año (variación de picos).
- **Regularidad** — ¿hay ciclos de siembra limpios o la señal es errática?
- **Cobertura** — cuántas observaciones útiles respaldan todo lo anterior.

`analysis/crop.py` agrega la **verificación del cultivo**: confirma que el lote
está realmente sembrado y no es suelo desnudo, bosque o potrero disfrazado de
parcela de siembra.

## Módulo 2 — Alertas Tempranas (agricultor)

`analysis/alerts.py` compara la última pasada contra la referencia reciente. Una
caída brusca (~15-20%) dispara la alerta, y cada índice se adelanta un poco más:

- **NDRE** cae primero → señal temprana de plaga o enfermedad.
- **NDMI** cae con el estrés hídrico antes del marchitamiento.
- **NDVI** confirma cuando el daño ya afectó la biomasa.

Salida: mensajes como *"Atención Parcela #2: caída de 22% en humedad de la
canopia (NDMI). Posible estrés hídrico — considerar riego antes de que la planta
se marchite."*

## Correr en local

### Backend

```bash
pip install -r requirements.txt -r api/requirements.txt
uvicorn api.main:app --reload
# http://localhost:8000/parcels   ·   http://localhost:8000/docs
```

Sin las dependencias geoespaciales pesadas, la API igual arranca y sirve los
reportes de demostración (`api/demo/`). El procesamiento en vivo de Sentinel-2
requiere el stack completo de `requirements.txt`.

### Frontend

```bash
cd web
npm install
cp .env.example .env.local        # opcional: apuntar NEXT_PUBLIC_API_URL al backend
npm run dev                        # http://localhost:3000
```

Sin `NEXT_PUBLIC_API_URL`, el frontend corre en **modo demo** con los datos
empaquetados en `web/public/demo/` — funciona solo, sin backend.

### Regenerar parcelas y datos de demo

```bash
python scripts/make_parcels.py            # data/parcels/*.geojson
PYTHONPATH=. python scripts/build_demo_reports.py   # api/demo/*.json
cd web && npm run sync-demo                # copia api/demo -> web/public/demo
```

## Desplegar

Ver **[DEPLOY.md](DEPLOY.md)** para el paso a paso. En resumen:

1. **Backend → Render** (Docker, `render.yaml` incluido). Da una URL pública.
2. **Frontend → Vercel** (root directory `web/`, `NEXT_PUBLIC_API_URL` = la URL
   del backend). Si se deja sin backend, Vercel muestra la demo igual.

## Tests

```bash
pip install -r requirements-dev.txt
python -m pytest tests -q
```

Sin red: cubren la canonicalización del AOI, el caché, los tres índices, el
score, la verificación de cultivo, las alertas y la API (contra datos demo).

## Parcelas de demostración

Coordenadas reales sobre zonas agrícolas de Colombia (`data/parcels/`):

| Parcela | Cultivo | Región | Relato |
|---|---|---|---|
| Pivote Central | Maíz/Soya | Meta (Altillanura) | Sano y estable → bajo riesgo |
| Lote de Arroz | Arroz | Tolima (Saldaña) | Campañas dispares → riesgo medio |
| Caña de Azúcar | Caña | Valle del Cauca | Productivo → bajo riesgo |
| Palma de Aceite | Palma | Meta | Vegetación permanente (la verificación lo marca) |
| Lote con Estrés | Arroz | Tolima (Espinal) | Alerta activa (clorofila + hídrico) |

## Detalles de la receta técnica de Sentinel-2

Las decisiones no obvias de la capa de ingesta (groupby por día solar, máscara
por SCL, offset del baseline 04.00, escritura atómica del Zarr, trampas del
proveedor MPC) están documentadas en **[docs/INGEST.md](docs/INGEST.md)**.

## Estructura

```
cuby/
├── ingest/     polígono -> cubo en disco (Sentinel-2)
├── analysis/   índices (NDVI/NDMI/NDRE) · score · crop · alerts · report
├── api/        FastAPI: /parcels, /analyze, /health  (+ api/demo/ precalculado)
├── web/        Next.js: mapa, dashboards, dibujo de parcelas (Vercel)
├── data/       GeoJSON de parcelas
├── scripts/    generadores de parcelas y datos de demo
├── tests/      sin red: aoi, cache, indices, score, alerts, api
├── Dockerfile  backend
└── render.yaml despliegue del backend
```
