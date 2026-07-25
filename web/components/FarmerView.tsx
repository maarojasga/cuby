"use client";

import type { Alert, Report } from "@/lib/types";
import {
  INDEX_COLOR,
  INDEX_HELP,
  INDEX_LABEL,
  fmtDate,
  pct,
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

  // Últimos ~90 días para el panel de monitoreo reciente.
  const recent = (arr: Report["series"]["ndvi"]) => arr.slice(-24);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      {/* Estado y alertas */}
      <div className="flex flex-col gap-4 xl:col-span-1">
        <Card>
          <SectionTitle hint={`Evaluado hasta ${a.evaluado_hasta ? fmtDate(a.evaluado_hasta) : "—"}`}>
            Estado de la parcela
          </SectionTitle>
          <div
            className="flex items-center gap-3 rounded-xl px-4 py-3"
            style={{
              background: ok ? "#0ca30c18" : "#d03b3b18",
              color: ok ? "#0ca30c" : "#d03b3b",
            }}
          >
            <span className="text-2xl">{ok ? "✓" : "⚠"}</span>
            <div>
              <div className="text-base font-semibold">
                {ok ? "Sin alertas" : `${a.alertas.length} alerta${a.alertas.length > 1 ? "s" : ""} activa${a.alertas.length > 1 ? "s" : ""}`}
              </div>
              <div className="text-xs opacity-80">
                {ok
                  ? "El cultivo se comporta dentro de lo normal."
                  : "Se detectaron cambios bruscos en las últimas pasadas."}
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
          <Card key={i} className="border-l-4" >
            <div
              className="flex items-start gap-3"
              style={{ borderColor: severityColor(al.severidad) }}
            >
              <span className="text-2xl leading-none">{ALERT_ICON[al.tipo]}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase"
                    style={{
                      background: `${severityColor(al.severidad)}22`,
                      color: severityColor(al.severidad),
                    }}
                  >
                    {al.severidad === "alta" ? "Alerta alta" : "Aviso"}
                  </span>
                  <span className="text-xs text-ink-muted">
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
      <div className="flex flex-col gap-4 xl:col-span-2">
        <Card>
          <div className="flex items-center justify-between">
            <SectionTitle hint="Las tres señales que anticipan estrés, en cada pasada de Sentinel-2 (~5 días)">
              Monitoreo reciente
            </SectionTitle>
            <div className="flex gap-3">
              <LegendItem color={INDEX_COLOR.ndvi} label="NDVI" />
              <LegendItem color={INDEX_COLOR.ndmi} label="NDMI" />
              <LegendItem color={INDEX_COLOR.ndre} label="NDRE" />
            </div>
          </div>
          <IndexChart
            lines={[
              { key: "ndvi", label: "NDVI", color: INDEX_COLOR.ndvi, data: recent(report.series.ndvi) },
              { key: "ndmi", label: "NDMI", color: INDEX_COLOR.ndmi, data: recent(report.series.ndmi) },
              { key: "ndre", label: "NDRE", color: INDEX_COLOR.ndre, data: recent(report.series.ndre) },
            ]}
            domain={[-0.2, 1]}
            height={280}
          />
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {(["ndvi", "ndmi", "ndre"] as const).map((k) => (
            <Card key={k}>
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: INDEX_COLOR[k] }}
                />
                <span className="text-sm font-semibold text-ink-primary">
                  {INDEX_LABEL[k]}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-ink-muted">{INDEX_HELP[k]}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
