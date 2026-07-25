"use client";

import type { Alert, Report } from "@/lib/types";
import {
  INDEX_COLOR,
  INDEX_HELP,
  INDEX_LABEL,
  fmtDate,
  severityColor,
} from "@/lib/ui";
import IndexChart from "./IndexChart";
import { Card, LegendItem, SectionTitle, Stat } from "./primitives";

const ALERT_ICON: Record<Alert["tipo"], string> = {
  estres_hidrico: "💧",
  estres_clorofila: "🍂",
  estres_vegetal: "🌾",
};

// Vista para el agricultor: estado de la parcela + alertas + índices recientes.
export default function FarmerView({ report }: { report: Report }) {
  const a = report.alertas;
  const last = a.ultimos_valores || {};
  const ok = a.estado === "ok";

  // Últimos ~4 meses para el panel de monitoreo reciente.
  const recent = (arr: Report["series"]["ndvi"]) => arr.slice(-24);

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      {/* Estado y alertas */}
      <div className="flex flex-col gap-5 xl:col-span-1">
        <Card>
          <SectionTitle
            eyebrow="Módulo agricultor"
            hint={`Evaluado hasta ${a.evaluado_hasta ? fmtDate(a.evaluado_hasta) : "—"} · cada ~5 días`}
          >
            Estado de la parcela
          </SectionTitle>
          <div
            className="flex items-center gap-3.5 rounded-xl px-4 py-3.5"
            style={{
              background: ok ? "#68914912" : "#DC262612",
              color: ok ? "#689149" : "#DC2626",
            }}
          >
            <span
              className="flex h-10 w-10 items-center justify-center rounded-full text-lg text-white"
              style={{ background: ok ? "#689149" : "#DC2626" }}
            >
              {ok ? "✓" : "!"}
            </span>
            <div>
              <div className="text-base font-extrabold">
                {ok
                  ? "Sin alertas"
                  : `${a.alertas.length} alerta${a.alertas.length > 1 ? "s" : ""} activa${a.alertas.length > 1 ? "s" : ""}`}
              </div>
              <div className="text-xs opacity-80">
                {ok
                  ? "El cultivo se comporta dentro de lo normal."
                  : "Cambios bruscos en las últimas pasadas del satélite."}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <Stat label="NDVI" value={last.NDVI?.toFixed(2) ?? "—"} sub="biomasa" />
            <Stat label="NDMI" value={last.NDMI?.toFixed(2) ?? "—"} sub="humedad" />
            <Stat label="NDRE" value={last.NDRE?.toFixed(2) ?? "—"} sub="clorofila" />
          </div>
        </Card>

        {a.alertas.map((al, i) => (
          <Card
            key={i}
            className="border-l-4"
            style={{ borderLeftColor: severityColor(al.severidad) }}
          >
            <div className="flex items-start gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
                style={{ background: `${severityColor(al.severidad)}14` }}
              >
                {ALERT_ICON[al.tipo]}
              </span>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide"
                    style={{
                      background: `${severityColor(al.severidad)}16`,
                      color: severityColor(al.severidad),
                    }}
                  >
                    {al.severidad === "alta" ? "Alerta alta" : "Aviso"}
                  </span>
                  <span className="text-xs font-semibold text-ink-muted">
                    {al.indice}
                    {al.caida_pct != null ? ` · −${al.caida_pct}%` : ""}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
                  {al.mensaje}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Índices recientes */}
      <div className="flex flex-col gap-5 xl:col-span-2">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <SectionTitle
              eyebrow="Monitoreo continuo"
              hint="Las tres señales que anticipan estrés, en cada pasada de Sentinel-2 (~5 días)"
            >
              Señales recientes
            </SectionTitle>
            <div className="flex gap-3">
              <LegendItem color={INDEX_COLOR.ndvi} label="NDVI" />
              <LegendItem color={INDEX_COLOR.ndmi} label="NDMI" />
              <LegendItem color={INDEX_COLOR.ndre} label="NDRE" />
            </div>
          </div>
          <IndexChart
            lines={[
              {
                key: "ndvi",
                label: "NDVI",
                color: INDEX_COLOR.ndvi,
                data: recent(report.series.ndvi),
              },
              {
                key: "ndmi",
                label: "NDMI",
                color: INDEX_COLOR.ndmi,
                data: recent(report.series.ndmi),
              },
              {
                key: "ndre",
                label: "NDRE",
                color: INDEX_COLOR.ndre,
                data: recent(report.series.ndre),
              },
            ]}
            domain={[-0.2, 1]}
            height={280}
          />
        </Card>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {(["ndvi", "ndmi", "ndre"] as const).map((k) => (
            <Card
              key={k}
              className="border-t-4"
              style={{ borderTopColor: INDEX_COLOR[k] }}
            >
              <div className="mb-1.5 text-sm font-bold text-ink-primary">
                {INDEX_LABEL[k]}
              </div>
              <p className="text-xs leading-relaxed text-ink-muted">
                {INDEX_HELP[k]}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
