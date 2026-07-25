// Cliente de la API — todo el análisis es en vivo contra el backend.
//
// Las recomendaciones de lugares se intentan del backend y caen a la copia
// empaquetada (mismas coordenadas reales). El análisis no tiene fallback:
// sin backend configurado (NEXT_PUBLIC_API_URL), se explica claro.

import { RECOMMENDED } from "./recommended";
import type { Recommended, Report } from "./types";

const API = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
export const hasLiveBackend = Boolean(API);

// Recopilar 3 años de imágenes puede tardar varios minutos la primera vez.
const ANALYZE_TIMEOUT_MS = 15 * 60 * 1000;

export async function getRecommendations(): Promise<Recommended[]> {
  if (API) {
    try {
      const res = await fetch(`${API}/parcels`);
      if (res.ok) {
        const data = (await res.json()) as Recommended[];
        if (data.length) return data;
      }
    } catch {
      /* cae a la copia empaquetada */
    }
  }
  return RECOMMENDED;
}

export type AnalyzeOpts = {
  name: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  intervalDays: number;
  crop?: string;
  region?: string;
};

export type AnalyzeResult =
  | { ok: true; report: Report }
  | { ok: false; error: string; noBackend?: boolean };

export async function analyze(
  geojson: GeoJSON.Polygon | GeoJSON.Feature,
  opts: AnalyzeOpts
): Promise<AnalyzeResult> {
  if (!API) {
    return {
      ok: false,
      noBackend: true,
      error:
        "No hay backend conectado: configurá NEXT_PUBLIC_API_URL con la URL " +
        "de la API (ver DEPLOY.md) para recopilar imágenes de Sentinel-2.",
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);
  try {
    const res = await fetch(`${API}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        geojson,
        name: opts.name,
        start: opts.start,
        end: opts.end,
        interval_days: opts.intervalDays,
        crop: opts.crop,
        region: opts.region,
      }),
    });
    if (!res.ok) {
      let detail = `${res.status} ${res.statusText}`;
      try {
        const body = await res.json();
        if (body?.detail) detail = String(body.detail);
      } catch {
        /* sin cuerpo JSON */
      }
      return { ok: false, error: detail };
    }
    return { ok: true, report: (await res.json()) as Report };
  } catch (e: any) {
    const aborted = e?.name === "AbortError";
    return {
      ok: false,
      error: aborted
        ? "La recopilación tardó demasiado y se canceló. Probá un rango más corto o un intervalo mayor."
        : e?.message || "No se pudo conectar con el backend.",
    };
  } finally {
    clearTimeout(timer);
  }
}
