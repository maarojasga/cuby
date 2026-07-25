# Frontend — Cuby

Next.js (App Router) + Tailwind + Leaflet + Recharts. Dos vistas sobre las
mismas parcelas: **Entidad financiera** (Score de Riesgo Verde) y **Agricultor**
(Alertas Tempranas).

```bash
npm install
npm run dev        # http://localhost:3000
```

## Configuración

| Variable | Qué hace |
|---|---|
| `NEXT_PUBLIC_API_URL` | URL del backend FastAPI. Vacía = modo demo con datos empaquetados. |

Copiá `.env.example` a `.env.local` para desarrollo.

## Modo demo vs. en vivo

`lib/api.ts` intenta el backend y **cae a `public/demo/*.json`** si no hay URL o
falla. Así el sitio nunca queda en blanco. Lo único que exige backend es
analizar un polígono nuevo dibujado en el mapa (`POST /analyze`).

Para actualizar los datos de demo tras regenerarlos en el backend:

```bash
npm run sync-demo   # copia ../api/demo -> public/demo
```

## Mapa

Leaflet directo (sin react-leaflet) con teselas satelitales de Esri World
Imagery — **sin token**. El dibujo de polígonos usa leaflet-draw. Ver
`components/ParcelMap.tsx`.

## Estructura

```
web/
├── app/            layout, página, estilos globales
├── components/     ParcelMap, ScoreGauge, IndexChart, CreditView, FarmerView, Dashboard
├── lib/            api (con fallback), types, helpers de UI
├── public/demo/    reportes precalculados (fallback sin backend)
└── scripts/        sync-demo
```

Desplegar: ver [../DEPLOY.md](../DEPLOY.md). Root Directory en Vercel = `web`.
