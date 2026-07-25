"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { analyze, getParcels, getReport, hasLiveBackend } from "@/lib/api";
import type { ParcelSummary, Report } from "@/lib/types";
import { riskColor } from "@/lib/ui";
import CreditView from "./CreditView";
import FarmerView from "./FarmerView";
import { Pill } from "./primitives";

const ParcelMap = dynamic(() => import("./ParcelMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-ink-muted">
      Cargando mapa…
    </div>
  ),
});

type Mode = "credito" | "agricultor";

export default function Dashboard() {
  const [parcels, setParcels] = useState<ParcelSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [mode, setMode] = useState<Mode>("credito");
  const [loading, setLoading] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    getParcels()
      .then((ps) => {
        setParcels(ps);
        if (ps.length) setSelectedId(ps[0].id);
      })
      .catch(() => setNotice("No se pudieron cargar las parcelas."));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    getReport(selectedId)
      .then(setReport)
      .catch(() => setNotice("No se pudo cargar el reporte de la parcela."))
      .finally(() => setLoading(false));
  }, [selectedId]);

  const selected = useMemo(
    () => parcels.find((p) => p.id === selectedId) || null,
    [parcels, selectedId]
  );

  async function onDraw(geometry: GeoJSON.Polygon) {
    setDrawing(false);
    setLoading(true);
    setNotice(null);
    const res = await analyze(geometry, "Parcela dibujada");
    setLoading(false);
    if (res.ok) {
      setReport(res.report);
      setSelectedId(null);
    } else {
      setNotice(res.error);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-4 py-5 lg:px-6">
      <Header mode={mode} setMode={setMode} />

      <div className="mt-5 grid flex-1 grid-cols-1 gap-5 lg:grid-cols-[380px_1fr]">
        {/* Panel izquierdo: mapa + parcelas */}
        <aside className="flex flex-col gap-4">
          <div className="h-[300px] overflow-hidden rounded-2xl border border-line bg-card shadow-card lg:h-[380px]">
            <ParcelMap
              parcels={parcels}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                setNotice(null);
              }}
              onDraw={onDraw}
              drawing={drawing}
            />
          </div>

          <button
            onClick={() => {
              setDrawing((d) => !d);
              setNotice(
                !drawing && !hasLiveBackend
                  ? "Modo demo: dibujar analiza en vivo solo con un backend conectado (NEXT_PUBLIC_API_URL)."
                  : null
              );
            }}
            className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
              drawing
                ? "border-ocean/40 bg-ocean/10 text-ocean"
                : "border-line bg-card text-ink-secondary shadow-soft hover:bg-cream"
            }`}
          >
            {drawing
              ? "Dibujando… hacé clic en el mapa (cerrá el polígono)"
              : "✏️  Dibujar mi parcela"}
          </button>

          <div className="flex flex-col gap-2">
            <div className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Parcelas de demostración
            </div>
            {parcels.map((p) => (
              <ParcelRow
                key={p.id}
                p={p}
                active={p.id === selectedId}
                onClick={() => {
                  setSelectedId(p.id);
                  setNotice(null);
                }}
              />
            ))}
          </div>
        </aside>

        {/* Panel derecho: la vista */}
        <main className="min-w-0">
          {notice && (
            <div className="mb-4 rounded-xl border border-ndre/25 bg-ndre/[0.08] px-4 py-3 text-sm text-[#92500a]">
              {notice}
            </div>
          )}
          {loading && !report && (
            <div className="flex h-64 items-center justify-center text-sm text-ink-muted">
              Analizando parcela…
            </div>
          )}
          {report && (
            <>
              <ReportHeader report={report} selected={selected} loading={loading} />
              {mode === "credito" ? (
                <CreditView report={report} />
              ) : (
                <FarmerView report={report} />
              )}
            </>
          )}
        </main>
      </div>

      <Footer />
    </div>
  );
}

function Header({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-forest text-xl shadow-soft">
          🛰️
        </div>
        <div>
          <h1 className="text-lg font-bold leading-tight text-ink-primary">
            Cuby · Inteligencia Agrícola
          </h1>
          <p className="text-xs text-ink-muted">
            Score de Riesgo Verde &amp; Alertas Tempranas · Sentinel-2
          </p>
        </div>
      </div>

      <div className="inline-flex rounded-xl border border-line bg-card p-1 shadow-soft">
        <ToggleBtn active={mode === "credito"} onClick={() => setMode("credito")}>
          🏦 Entidad financiera
        </ToggleBtn>
        <ToggleBtn active={mode === "agricultor"} onClick={() => setMode("agricultor")}>
          🌱 Agricultor
        </ToggleBtn>
      </div>
    </header>
  );
}

function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-forest text-white shadow-soft"
          : "text-ink-muted hover:text-ink-primary"
      }`}
    >
      {children}
    </button>
  );
}

function ParcelRow({
  p,
  active,
  onClick,
}: {
  p: ParcelSummary;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition ${
        active
          ? "border-forest/40 bg-forest/[0.06] shadow-soft"
          : "border-line bg-card hover:bg-cream"
      }`}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-ink-primary">{p.name}</div>
        <div className="truncate text-xs text-ink-muted">
          {p.crop} · {p.region}
        </div>
      </div>
      <div className="flex items-center gap-2 pl-2">
        {p.estado_alertas === "alerta" && <span title="Alerta activa">🔴</span>}
        <span
          className="rounded-lg px-2 py-1 text-xs font-bold tabular-nums"
          style={{ background: `${riskColor(p.risk_level)}18`, color: riskColor(p.risk_level) }}
        >
          {p.score}
        </span>
      </div>
    </button>
  );
}

function ReportHeader({
  report,
  selected,
  loading,
}: {
  report: Report;
  selected: ParcelSummary | null;
  loading: boolean;
}) {
  const isDemo = report.meta?.source === "demo";
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="text-xl font-bold text-ink-primary">{report.parcela}</h2>
        <p className="text-sm text-ink-muted">
          {report.meta?.crop ? `${report.meta.crop} · ` : ""}
          {report.meta?.region || selected?.region || ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {loading && <span className="text-xs text-ink-muted">actualizando…</span>}
        <Pill color={isDemo ? "#8A8072" : "#2D6A4F"}>
          {isDemo ? "Datos de demostración" : "Sentinel-2 en vivo"}
        </Pill>
        <span className="text-xs text-ink-muted">{report.cobertura.n_fechas} fechas</span>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-8 border-t border-line pt-4 text-center text-xs text-ink-muted">
      Índices Sentinel-2 · NDVI (B8-B4) biomasa · NDMI (B8-B11) humedad · NDRE
      (B8-B5) clorofila · Copernicus / Microsoft Planetary Computer
    </footer>
  );
}
