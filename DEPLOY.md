# Despliegue

Dos piezas independientes: el **backend** (procesamiento pesado de Sentinel-2)
va a un host que corre Docker; el **frontend** va a Vercel. El producto es
100% en vivo: el frontend necesita la URL del backend para recopilar imágenes,
así que desplegá el backend primero.

```
Vercel (Next.js)  ──HTTPS──▶  Render/Railway/HF Spaces (FastAPI + GDAL)
   web/                            Dockerfile
```

---

## 1. Backend → Render (recomendado)

El backend necesita el stack geoespacial (rasterio, odc, GDAL), que **no corre en
Vercel**. El `Dockerfile` y el `render.yaml` ya están listos.

1. Subí el repo a GitHub.
2. En [Render](https://render.com): **New → Blueprint** y apuntá al repo. Render
   lee `render.yaml`, construye el `Dockerfile` y expone una URL pública
   (ej. `https://cuby-api.onrender.com`).
3. Verificá: `https://cuby-api.onrender.com/health` → `{"status":"ok"}`.

Variables de entorno (ya declaradas en `render.yaml`, ajustables en el panel):

| Variable | Default | Qué hace |
|---|---|---|
| `CUBY_CORS_ORIGINS` | `*` | Restringí al dominio de Vercel en producción. |
| `CUBY_DEFAULT_YEARS` | `3` | Años de histórico para el score. |
| `CUBY_LIVE` | `1` | `1` habilita /analyze; `0` lo apaga (mantenimiento). |
| `GEMINI_API_KEY` | _(vacío)_ | Key de Google Gemini para el asistente "Pregúntale a Cuby". Sin ella, el chat responde que no está configurado. La key vive solo en el servidor. |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Modelo de Gemini a usar. |

> El plan `starter` mantiene el motor caliente. El free tier se duerme y la
> primera recopilación tras el reposo puede tardar bastante más.

**Alternativas:** cualquier host con Docker sirve — Railway (detecta el
Dockerfile solo), Fly.io, o Hugging Face Spaces (SDK: Docker, puerto 8000).

### Probar la imagen en local

```bash
docker build -t cuby-api .
docker run -p 8000:8000 cuby-api
curl localhost:8000/parcels
```

---

## 2. Frontend → Vercel

1. En [Vercel](https://vercel.com): **New Project** → importá el repo.
2. **Root Directory: `web`** ← importante, el Next.js vive en `web/`.
   Vercel detecta Next.js y configura build (`next build`) y output solos.
3. Environment variable:

   | Variable | Valor |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | la URL del backend (ej. `https://cuby-api.onrender.com`) |

   Sin esta variable el sitio carga (home, mapa y recomendaciones) pero la
   recopilación de imágenes no puede ejecutarse.
4. **Deploy.** Vercel da la URL pública del frontend.

### Cerrar el círculo de CORS

En producción, poné `CUBY_CORS_ORIGINS` (en Render) al dominio exacto de Vercel
(ej. `https://cuby.vercel.app`) en vez de `*`.

---

## Checklist

- [ ] `GET /health` del backend responde `ok`.
- [ ] `GET /parcels` devuelve las 5 parcelas.
- [ ] El frontend en Vercel carga el mapa con los lugares recomendados.
- [ ] Con `NEXT_PUBLIC_API_URL` seteada, dibujar una parcela dispara `/analyze`.
- [ ] `CUBY_CORS_ORIGINS` restringido al dominio de Vercel.

## Sin backend, solo Vercel

El home, el mapa gigante y la selección de parcela funcionan (las
recomendaciones van empaquetadas en el bundle), pero **recopilar imágenes
requiere el backend**: el botón lo explica si `NEXT_PUBLIC_API_URL` no está
configurada.
