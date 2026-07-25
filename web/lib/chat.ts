// Cliente del asistente IA + armado del contexto que se le pasa a Cuby.
//
// buildContext() comprime el reporte a un texto rico pero acotado: todo lo
// que importa (score, métricas, verificación, alertas, series muestreadas)
// sin los arreglos gigantes (grilla 3D, cientos de puntos). askCuby() lo manda
// al backend /chat, que llama a Gemini con la key del servidor.

import type { Report } from "./types";

const API = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

export type ChatMessage = { role: "user" | "assistant"; content: string };

function sample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const step = (arr.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => arr[Math.round(i * step)]);
}

export function buildContext(report: Report): string {
  const s = report.credito.score;
  const c = report.credito.verificacion_cultivo;
  const al = report.alertas;
  const m = s.metrics || {};
  const meta = report.meta || {};
  const L: string[] = [];

  L.push(`PARCELA: ${report.parcela}`);
  if (meta.crop || meta.region)
    L.push(`Cultivo/Región: ${meta.crop ?? "?"} · ${meta.region ?? "?"}`);
  L.push(
    `Fuente: Sentinel-2 (${report.cobertura?.n_fechas ?? "?"} lecturas` +
      (report.cobertura?.validez_media != null
        ? `, validez media ${Math.round(report.cobertura.validez_media * 100)}%`
        : "") +
      `). Rango ${meta.start ?? "?"} a ${meta.end ?? "?"}, cada ${meta.interval_days ?? "?"} días.`
  );

  L.push("");
  L.push(`SCORE DE RIESGO VERDE: ${s.score}/100 — ${s.risk_band}.`);
  L.push(
    `Componentes (0-1): productividad ${s.components.productividad}, ` +
      `estabilidad ${s.components.estabilidad}, regularidad ${s.components.regularidad}, ` +
      `cobertura ${s.components.cobertura}.`
  );
  L.push(
    `Métricas: NDVI pico ${m.ndvi_pico ?? "?"}, medio ${m.ndvi_medio ?? "?"}, ` +
      `mínimo ${m.ndvi_minimo ?? "?"}; variación interanual de picos ${
        m.cv_picos_anuales != null ? Math.round(m.cv_picos_anuales * 100) + "%" : "n/d"
      }; años de histórico ${m.anios_cubiertos ?? "?"}.`
  );
  if (m.picos_por_anio)
    L.push(
      "Picos por año: " +
        Object.entries(m.picos_por_anio)
          .map(([y, v]) => `${y}=${v}`)
          .join(", ")
    );
  if (s.rationale?.length) {
    L.push("Dictamen:");
    s.rationale.forEach((r) => L.push(`- ${r}`));
  }

  L.push("");
  L.push(
    `VERIFICACIÓN DE CULTIVO: ${c.label} (sembrado=${c.is_cultivated}, ` +
      `patrón=${c.pattern}, confianza=${c.confidence}). ${c.detail}`
  );

  L.push("");
  L.push(`ALERTAS: estado ${al.estado}, evaluado hasta ${al.evaluado_hasta ?? "?"}.`);
  if (al.alertas?.length) {
    al.alertas.forEach((a) =>
      L.push(
        `- [${a.severidad}] ${a.tipo} (${a.indice}` +
          (a.caida_pct != null ? `, caída ${a.caida_pct}%` : "") +
          `): ${a.mensaje}`
      )
    );
  } else {
    L.push("- Sin alertas activas.");
  }
  if (al.ultimos_valores)
    L.push(
      `Últimos valores: ` +
        Object.entries(al.ultimos_valores)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ")
    );

  // Series muestreadas para que "vea" la forma sin abrumar.
  const fmt = (pts?: { date: string; value: number }[]) =>
    pts && pts.length
      ? sample(pts, 16)
          .map((p) => `${p.date}:${p.value}`)
          .join(", ")
      : "n/d";
  L.push("");
  L.push(`SERIE NDVI (muestreada): ${fmt(report.series?.ndvi)}`);
  L.push(`SERIE NDMI (muestreada): ${fmt(report.series?.ndmi)}`);
  L.push(`SERIE NDRE (muestreada): ${fmt(report.series?.ndre)}`);

  return L.join("\n");
}

export async function askCuby(
  context: string,
  messages: ChatMessage[]
): Promise<string> {
  if (!API) {
    return "La IA necesita el backend conectado (NEXT_PUBLIC_API_URL) para responder.";
  }
  try {
    const res = await fetch(`${API}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context, messages }),
    });
    const data = await res.json();
    return data?.reply || "No recibí respuesta del asistente.";
  } catch {
    return "No pude conectar con el asistente. Revisá tu conexión.";
  }
}

export const SUMMARY_PROMPT =
  "Generá un resumen breve (3-4 frases) de estos resultados para alguien que " +
  "recién los abre: qué dice el Score de Riesgo Verde, la verificación del " +
  "cultivo y si hay alertas. Terminá invitando a preguntar. No uses viñetas.";
