"use client";

import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`rounded-2xl border border-line bg-card p-5 shadow-card ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

// Rótulo pequeño en mayúsculas sobre los títulos: da jerarquía editorial.
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-forest-600">
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  hint,
  eyebrow,
}: {
  children: ReactNode;
  hint?: string;
  eyebrow?: string;
}) {
  return (
    <div className="mb-3">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h3 className="text-base font-bold tracking-tight text-ink-primary">
        {children}
      </h3>
      {hint && <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{hint}</p>}
    </div>
  );
}

export function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-ink-secondary">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ background: color }}
      />
      {label}
    </div>
  );
}

// Barra horizontal 0..1 para desglosar componentes del score.
export function MeterBar({
  label,
  value,
  color = "#689149",
}: {
  label: string;
  value: number;
  color?: string;
}) {
  const w = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-ink-secondary">{label}</span>
        <span className="tabular-nums font-semibold text-ink-primary">
          {Math.round(w)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-track">
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{ width: `${w}%`, background: color }}
        />
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-line-soft bg-cream/60 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-ink-muted">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-bold tabular-nums tracking-tight text-ink-primary">
        {value}
      </div>
      {sub && <div className="text-[11px] text-ink-muted">{sub}</div>}
    </div>
  );
}

export function Pill({
  children,
  color,
}: {
  children: ReactNode;
  color: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: `${color}16`, color }}
    >
      {children}
    </span>
  );
}

// Mini serie NDVI para las filas de parcela: forma del último par de meses.
export function Sparkline({
  data,
  color = "#689149",
  width = 72,
  height = 26,
}: {
  data?: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - 3 - ((v - min) / span) * (height - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} className="shrink-0" aria-hidden>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.85}
      />
    </svg>
  );
}
