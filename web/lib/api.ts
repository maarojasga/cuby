// Cliente de la API con fallback a los datos de demo empaquetados.
//
// Si NEXT_PUBLIC_API_URL apunta a un backend vivo, se usa. Si no está o falla
// (backend frío, sin red, deploy solo-frontend), se cae a /demo/*.json, que
// viaja dentro del propio bundle de Vercel. Así el frontend nunca queda en
// blanco: en el peor caso muestra la demo.

import type { ParcelSummary, Report } from "./types";

const API = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export async function getParcels(): Promise<ParcelSummary[]> {
  if (API) {
    try {
      return await fetchJSON<ParcelSummary[]>(`${API}/parcels`);
    } catch {
      /* cae a demo */
    }
  }
  return fetchJSON<ParcelSummary[]>(`/demo/index.json`);
}

export async function getReport(id: string): Promise<Report> {
  if (API) {
    try {
      return await fetchJSON<Report>(`${API}/parcels/${id}/report`);
    } catch {
      /* cae a demo */
    }
  }
  return fetchJSON<Report>(`/demo/${id}.json`);
}

export type AnalyzeResult =
  | { ok: true; report: Report }
  | { ok: false; error: string; demo?: boolean };

export async function analyze(
  geojson: GeoJSON.Polygon | GeoJSON.Feature,
  name = "Mi parcela"
): Promise<AnalyzeResult> {
  if (!API) {
    return {
      ok: false,
      demo: true,
      error:
        "Este despliegue no tiene backend conectado. Configurá NEXT_PUBLIC_API_URL " +
        "para analizar parcelas dibujadas; mientras tanto, explorá las parcelas de demostración.",
    };
  }
  try {
    const report = await fetchJSON<Report>(`${API}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ geojson, name }),
    });
    return { ok: true, report };
  } catch (e: any) {
    return { ok: false, error: e?.message || "No se pudo analizar la parcela." };
  }
}

export const hasLiveBackend = Boolean(API);
