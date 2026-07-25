"use client";

import type { GreenScore } from "@/lib/types";
import { riskColor, riskIcon } from "@/lib/ui";
import { chartTheme, useIsDark } from "./theme";

// Gauge semicircular con las tres bandas de riesgo pintadas en la pista
// (alto < 55 ≤ medio < 75 ≤ bajo) y el arco del valor encima. Ícono +
// etiqueta acompañan siempre al color (regla de estado).
export default function ScoreGauge({ score }: { score: GreenScore }) {
  const value = Math.max(0, Math.min(100, score.score));
  const color = riskColor(score.risk_level);
  const ct = chartTheme(useIsDark());

  const R = 82;
  const CX = 100;
  const CY = 102;
  const TRACK = 7;
  const STROKE = 13;

  const polar = (frac: number, radius = R) => {
    const angle = Math.PI * (1 - frac);
    return [CX + radius * Math.cos(angle), CY - radius * Math.sin(angle)];
  };
  const arcPath = (from: number, to: number, radius = R) => {
    const [x1, y1] = polar(from, radius);
    const [x2, y2] = polar(to, radius);
    const large = to - from > 0.5 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
  };

  const bands: [number, number, string][] = [
    [0, 0.55, "#DC2626"],
    [0.55, 0.75, "#D97706"],
    [0.75, 1, "#689149"],
  ];

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="-10 0 220 126" className="w-full max-w-[300px]">
        {/* bandas de riesgo, tenues */}
        {bands.map(([a, b, c]) => (
          <path
            key={c}
            d={arcPath(a + 0.004, b - 0.004)}
            fill="none"
            stroke={c}
            strokeOpacity={0.18}
            strokeWidth={TRACK}
            strokeLinecap="butt"
          />
        ))}
        {/* arco del valor */}
        <path
          d={arcPath(0, Math.max(value / 100, 0.02))}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
        />
        {/* marcas en los cortes */}
        {[0.55, 0.75].map((f) => {
          const [x1, y1] = polar(f, R - 11);
          const [x2, y2] = polar(f, R + 9);
          return (
            <line
              key={f}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={ct.tooltipBg}
              strokeWidth={2}
            />
          );
        })}
        {/* etiquetas de escala */}
        {(
          [
            [0, "0"],
            [0.55, "55"],
            [0.75, "75"],
            [1, "100"],
          ] as [number, string][]
        ).map(([f, t]) => {
          const [x, y] = polar(f, R + 16);
          return (
            <text
              key={t}
              x={x}
              y={y + 3}
              textAnchor="middle"
              fill={ct.axis}
              style={{ fontSize: 9 }}
            >
              {t}
            </text>
          );
        })}

        <text
          x={CX}
          y={CY - 12}
          textAnchor="middle"
          fill={ct.ink}
          style={{ fontSize: 42, fontWeight: 800, letterSpacing: "-0.02em" }}
        >
          {value}
        </text>
        <text
          x={CX}
          y={CY + 8}
          textAnchor="middle"
          fill={ct.axis}
          style={{ fontSize: 11 }}
        >
          de 100
        </text>
      </svg>

      <div
        className="mt-2 flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold"
        style={{ background: `${color}16`, color }}
      >
        <span
          className="flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ background: color }}
        >
          {riskIcon(score.risk_level)}
        </span>
        {score.risk_band}
      </div>
    </div>
  );
}
