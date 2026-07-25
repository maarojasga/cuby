// Helpers de presentación compartidos.

import type { GreenScore } from "./types";

export const INDEX_COLOR = {
  ndvi: "#1baf7a", // biomasa
  ndmi: "#3987e5", // humedad
  ndre: "#eb6834", // clorofila
} as const;

export const INDEX_LABEL = {
  ndvi: "NDVI · Biomasa",
  ndmi: "NDMI · Humedad",
  ndre: "NDRE · Clorofila",
} as const;

export const INDEX_HELP = {
  ndvi: "Vigor y biomasa total del cultivo. La base del historial de crédito.",
  ndmi: "Agua en la hoja (infrarrojo de onda corta B11). Cae con el estrés hídrico.",
  ndre: "Clorofila vía Red Edge (B5). Detecta plagas días antes que el NDVI.",
} as const;

export type RiskLevel = GreenScore["risk_level"];

export function riskColor(level: RiskLevel): string {
  switch (level) {
    case "bajo":
      return "#0ca30c";
    case "medio":
      return "#fab219";
    case "alto":
      return "#d03b3b";
    default:
      return "#6f7a72";
  }
}

export function riskIcon(level: RiskLevel): string {
  switch (level) {
    case "bajo":
      return "✓";
    case "medio":
      return "!";
    case "alto":
      return "✕";
    default:
      return "?";
  }
}

export function severityColor(sev: "media" | "alta"): string {
  return sev === "alta" ? "#d03b3b" : "#fab219";
}

export function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function fmtDateShort(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-CO", { month: "short", year: "2-digit" });
}

export function pct(x: number | null | undefined, digits = 0): string {
  if (x == null || Number.isNaN(x)) return "—";
  return `${(x * 100).toFixed(digits)}%`;
}
