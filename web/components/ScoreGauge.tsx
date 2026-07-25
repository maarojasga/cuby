"use client";

import type { GreenScore } from "@/lib/types";
import { riskColor, riskIcon } from "@/lib/ui";

// Gauge semicircular. El arco va de 0 a 100; el color y el ícono comunican la
// banda de riesgo sin depender solo del matiz (regla de estado: ícono+etiqueta).
export default function ScoreGauge({ score }: { score: GreenScore }) {
  const value = Math.max(0, Math.min(100, score.score));
  const color = riskColor(score.risk_level);

  const R = 80;
  const CX = 100;
  const CY = 100;
  const STROKE = 14;

  // Semicírculo: 180° (izq) -> 0° (der).
  const polar = (frac: number) => {
    const angle = Math.PI * (1 - frac); // frac 0 -> π, frac 1 -> 0
    return [CX + R * Math.cos(angle), CY - R * Math.sin(angle)];
  };
  const arcPath = (from: number, to: number) => {
    const [x1, y1] = polar(from);
    const [x2, y2] = polar(to);
    const large = to - from > 0.5 ? 1 : 0;
    return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`;
  };

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 120" className="w-full max-w-[280px]">
        {/* pista */}
        <path
          d={arcPath(0, 1)}
          fill="none"
          stroke="#2a332e"
          strokeWidth={STROKE}
          strokeLinecap="round"
        />
        {/* valor */}
        <path
          d={arcPath(0, value / 100)}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
        />
        <text
          x={CX}
          y={CY - 6}
          textAnchor="middle"
          className="fill-ink-primary"
          style={{ fontSize: 34, fontWeight: 700 }}
        >
          {value}
        </text>
        <text
          x={CX}
          y={CY + 14}
          textAnchor="middle"
          className="fill-ink-muted"
          style={{ fontSize: 11 }}
        >
          / 100
        </text>
      </svg>

      <div
        className="mt-1 flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold"
        style={{ background: `${color}22`, color }}
      >
        <span
          className="flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-black"
          style={{ background: color }}
        >
          {riskIcon(score.risk_level)}
        </span>
        {score.risk_band}
      </div>
    </div>
  );
}
