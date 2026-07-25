"use client";

import type { Report } from "@/lib/types";
import { INDEX_COLOR, INDEX_LABEL, pct, riskColor } from "@/lib/ui";
import IndexChart from "./IndexChart";
import ScoreGauge from "./ScoreGauge";
import { Card, LegendItem, MeterBar, Pill, SectionTitle, Stat } from "./primitives";

// Vista para la entidad financiera: Score de Riesgo Verde + histórico + verificación.
export default function CreditView({ report }: { report: Report }) {
  const { score, verificacion_cultivo: crop } = report.credito;
  const m = score.metrics;
  const color = riskColor(score.risk_level);

  const peaks: Record<string, number> = m.picos_por_anio || {};

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      {/* Score */}
      <Card className="xl:col-span-1">
        <SectionTitle hint="Aptitud de la tierra como garantía de crédito de siembra">
          Score de Riesgo Verde
        </SectionTitle>
        <ScoreGauge score={score} />

        <div className="mt-5 space-y-3">
          <MeterBar label="Productividad" value={score.components.productividad} color="#1baf7a" />
          <MeterBar label="Estabilidad interanual" value={score.components.estabilidad} color="#3987e5" />
          <MeterBar label="Regularidad de ciclos" value={score.components.regularidad} color="#eda100" />
          <MeterBar label="Cobertura de datos" value={score.components.cobertura} color="#6f7a72" />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Stat label="NDVI pico" value={m.ndvi_pico ?? "—"} />
          <Stat label="NDVI medio" value={m.ndvi_medio ?? "—"} />
          <Stat
            label="Var. interanual"
            value={m.cv_picos_anuales != null ? pct(m.cv_picos_anuales) : "—"}
            sub="picos año a año"
          />
          <Stat label="Años de histórico" value={m.anios_cubiertos ?? "—"} />
        </div>
      </Card>

      {/* Histórico + razones */}
      <div className="flex flex-col gap-4 xl:col-span-2">
        <Card>
          <div className="flex items-center justify-between">
            <SectionTitle hint="Serie de NDVI de Sentinel-2, promediada sobre el polígono">
              Histórico de producción
            </SectionTitle>
            <LegendItem color={INDEX_COLOR.ndvi} label={INDEX_LABEL.ndvi} />
          </div>
          <IndexChart
            lines={[
              { key: "ndvi", label: "NDVI", color: INDEX_COLOR.ndvi, data: report.series.ndvi },
            ]}
            domain={[0, 1]}
            height={260}
          />
          {Object.keys(peaks).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(peaks).map(([year, v]) => (
                <Pill key={year} color="#1baf7a">
                  {year}: pico {Number(v).toFixed(2)}
                </Pill>
              ))}
            </div>
          )}
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <SectionTitle>Verificación del cultivo</SectionTitle>
            <div className="flex items-center gap-2">
              <Pill color={crop.is_cultivated ? "#0ca30c" : "#fab219"}>
                {crop.is_cultivated ? "✓ Sembrado" : "⚠ Revisar"}
              </Pill>
              <span className="text-sm font-medium text-ink-primary">{crop.label}</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink-secondary">{crop.detail}</p>
            <div className="mt-3 flex gap-2 text-xs text-ink-muted">
              <span>pico {crop.features.ndvi_pico}</span>
              <span>·</span>
              <span>valle {crop.features.ndvi_valle}</span>
              <span>·</span>
              <span>amplitud {crop.features.amplitud}</span>
            </div>
          </Card>

          <Card>
            <SectionTitle>Dictamen</SectionTitle>
            <div
              className="mb-3 rounded-xl px-3 py-2 text-sm font-semibold"
              style={{ background: `${color}18`, color }}
            >
              {score.risk_band} · {score.score}/100
            </div>
            <ul className="space-y-2">
              {score.rationale.map((r, i) => (
                <li key={i} className="flex gap-2 text-sm text-ink-secondary">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-muted" />
                  {r}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
