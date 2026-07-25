"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { analyze, getParcels, getReport, hasLiveBackend } from "@/lib/api";
import type { ParcelSummary, Report } from "@/lib/types";
import { riskColor } from "@/lib/ui";
import CreditView from "./CreditView";
import FarmerView from "./FarmerView";
import { Card, Pill, SectionTitle, Sparkline } from "./primitives";

const ParcelMap = dynamic(() => import("./ParcelMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-ink-muted">
      Cargando mapa…
    </div>
  ),
});

const Surface3D = dynamic(() => import("./Surface3D"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[400px] items-center justify-center text-sm text-ink-muted">
      Preparando relieve 3D…
    </div>
  ),
});

type Mode = "credito" | "agricultor";

export default function Dashboard({
  initialMode = "credito",
}: {
  initialMode?: Mode;
}) {
  const [parcels, setParcels] = useState<ParcelSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [mode, setMode] = useState<Mode>(initialMode);
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
    <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col px-4 py-5 lg:px-8">
      <Header mode={mode} setMode={setMode} />

      <div className="mt-6 grid flex-1 grid-cols-1 gap-6 lg:grid-cols-[368px_1fr]">
        {/* ── Panel izquierdo: mapa + parcelas ── */}
        <aside className="flex flex-col gap-4">
          <div className="relative h-[300px] overflow-hidden rounded-2xl border border-line bg-card shadow-card lg:h-[340px]">
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
            <div className="pointer-events-none absolute right-3 top-3 z-[500] rounded-full border border-line bg-card/90 px-2.5 py-1 text-[11px] font-semibold text-ink-secondary shadow-soft backdrop-blur">
              🛰️ Satélite · Colombia
            </div>
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
            className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
              drawing
                ? "border-ocean/40 bg-ocean/10 text-ocean"
                : "border-line bg-card text-ink-secondary shadow-soft hover:border-forest/30 hover:text-forest"
            }`}
          >
            {drawing
              ? "Dibujando… hacé clic en el mapa (cerrá el polígono)"
              : "✏️  Dibujar mi parcela"}
          </button>

          <div className="flex flex-col gap-2">
            <div className="px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
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

        {/* ── Panel derecho ── */}
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
              <Hero report={report} selected={selected} loading={loading} />

              {report.surface && (
                <Card className="mb-6 overflow-hidden">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <SectionTitle
                      eyebrow="Últimas 12 lecturas · Sentinel-2"
                      hint="Cada píxel del lote como relieve: la altura y el color son el vigor del cultivo (NDVI). Arrastrá para rotar, movete en el tiempo con la línea."
                    >
                      Terreno vivo en 3D
                    </SectionTitle>
                  </div>
                  <Surface3D surface={report.surface} height={400} />
                </Card>
              )}

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
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <a href="/" className="flex items-center gap-3.5" title="Volver al inicio">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-forest text-2xl shadow-card">
          🛰️
        </div>
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-ink-primary">
            Cuby
            <span className="ml-2 rounded-full bg-forest/10 px-2 py-0.5 align-middle text-[11px] font-bold uppercase tracking-wide text-forest">
              AgTech
            </span>
          </h1>
          <p className="text-xs text-ink-muted">
            Score de Riesgo Verde &amp; Alertas Tempranas con Sentinel-2
          </p>
        </div>
      </a>

      <div className="inline-flex self-start rounded-full border border-line bg-card p-1 shadow-soft sm:self-auto">
        <ToggleBtn active={mode === "credito"} onClick={() => setMode("credito")}>
          🏦 Entidad financiera
        </ToggleBtn>
        <ToggleBtn
          active={mode === "agricultor"}
          onClick={() => setMode("agricultor")}
        >
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
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
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
  const color = riskColor(p.risk_level);
  return (
    <button
      onClick={onClick}
      className={`group flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition ${
        active
          ? "border-forest/40 bg-card shadow-card"
          : "border-line-soft bg-card/60 hover:border-line hover:bg-card hover:shadow-soft"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {p.estado_alertas === "alerta" && (
            <span
              className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#DC2626]"
              title="Alerta activa"
            />
          )}
          <div className="truncate text-sm font-bold text-ink-primary">
            {p.name}
          </div>
        </div>
        <div className="truncate text-xs text-ink-muted">
          {p.crop} · {p.region}
        </div>
      </div>
      <Sparkline data={p.spark} color={color} />
      <span
        className="rounded-lg px-2 py-1 text-sm font-extrabold tabular-nums"
        style={{ background: `${color}14`, color }}
      >
        {p.score}
      </span>
    </button>
  );
}

function Hero({
  report,
  selected,
  loading,
}: {
  report: Report;
  selected: ParcelSummary | null;
  loading: boolean;
}) {
  const isDemo = report.meta?.source === "demo";
  const score = report.credito.score;
  const color = riskColor(score.risk_level);
  const nAlerts = report.alertas.alertas.length;

  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div className="min-w-0">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-forest-600">
          {report.meta?.crop || "Parcela"} ·{" "}
          {report.meta?.region || selected?.region || "—"}
        </div>
        <h2 className="text-2xl font-extrabold tracking-tight text-ink-primary lg:text-3xl">
          {report.parcela}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Pill color={isDemo ? "#8A8072" : "#2D6A4F"}>
            {isDemo ? "◦ Datos de demostración" : "● Sentinel-2 en vivo"}
          </Pill>
          <span className="text-xs text-ink-muted">
            {report.cobertura.n_fechas} lecturas ·{" "}
            {report.cobertura.validez_media != null
              ? `validez ${Math.round(report.cobertura.validez_media * 100)}%`
              : ""}
          </span>
          {loading && (
            <span className="text-xs text-ink-muted">actualizando…</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {nAlerts > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-[#DC2626]/[0.08] px-3.5 py-2">
            <span className="text-lg">⚠️</span>
            <div>
              <div className="text-sm font-extrabold text-[#DC2626]">
                {nAlerts} alerta{nAlerts > 1 ? "s" : ""}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-[#DC2626]/70">
                activas
              </div>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-extrabold text-white shadow-card"
            style={{ background: color }}
          >
            {score.score}
          </div>
          <div>
            <div className="text-sm font-bold" style={{ color }}>
              {score.risk_band}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-ink-muted">
              Score de Riesgo Verde
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-10 border-t border-line pt-5 text-center text-xs text-ink-muted">
      Índices Sentinel-2 · NDVI (B8−B4) biomasa · NDMI (B8−B11) humedad · NDRE
      (B8−B5) clorofila · Copernicus / Microsoft Planetary Computer
    </footer>
  );
}
