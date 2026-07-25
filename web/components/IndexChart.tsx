"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SeriesPoint } from "@/lib/types";
import { fmtDate, fmtDateShort } from "@/lib/ui";
import { chartTheme, useIsDark } from "./theme";

type Line = { key: string; label: string; color: string; data: SeriesPoint[] };

// Serie(s) temporal(es) de un índice. Una sola escala Y (regla de un eje).
// Área tenue + línea fina; tooltip con crosshair por defecto.
export default function IndexChart({
  lines,
  domain = [0, 1],
  height = 240,
}: {
  lines: Line[];
  domain?: [number, number];
  height?: number;
}) {
  const t = chartTheme(useIsDark());

  // Unir por fecha para un tooltip compartido.
  const byDate = new Map<string, any>();
  lines.forEach((ln) =>
    ln.data.forEach((p) => {
      const row = byDate.get(p.date) || { date: p.date };
      row[ln.key] = p.value;
      byDate.set(p.date, row);
    })
  );
  const rows = Array.from(byDate.values()).sort((a, b) =>
    a.date < b.date ? -1 : 1
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
        <defs>
          {lines.map((ln) => (
            <linearGradient key={ln.key} id={`g-${ln.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ln.color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={ln.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke={t.grid} vertical={false} strokeDasharray="0" />
        <XAxis
          dataKey="date"
          tickFormatter={fmtDateShort}
          minTickGap={48}
          tick={{ fill: t.axis, fontSize: 11 }}
          axisLine={{ stroke: t.axisLine }}
          tickLine={false}
        />
        <YAxis
          domain={domain}
          tick={{ fill: t.axis, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <Tooltip
          contentStyle={{
            background: t.tooltipBg,
            border: `1px solid ${t.tooltipBorder}`,
            borderRadius: 10,
            fontSize: 12,
            boxShadow: t.tooltipShadow,
            color: t.ink,
          }}
          labelStyle={{ color: t.ink2 }}
          labelFormatter={(d) => fmtDate(String(d))}
          formatter={(v: any, key: any) => {
            const ln = lines.find((l) => l.key === key);
            return [Number(v).toFixed(3), ln?.label ?? key];
          }}
        />
        {lines.map((ln) => (
          <Area
            key={ln.key}
            type="monotone"
            dataKey={ln.key}
            stroke={ln.color}
            strokeWidth={2}
            fill={`url(#g-${ln.key})`}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
