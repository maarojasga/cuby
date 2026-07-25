"use client";

// Flujo del producto, 100% en vivo:
//
//   1. "select"  — mapa gigante: elegir un lugar recomendado, poner
//                  coordenadas propias o dibujar la parcela.
//   2. "collect" — recopilar imágenes de Sentinel-2 con rango de fechas e
//                  intervalo parametrizables (progreso en pantalla).
//   3. "ready"   — el panel de resultados, con el mapa ya a un costado.

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { analyze, getRecommendations, hasLiveBackend } from "@/lib/api";
import type { Recommended, Report } from "@/lib/types";
import { riskColor } from "@/lib/ui";
import ChatDock from "./ChatDock";
import CreditView from "./CreditView";
import FarmerView from "./FarmerView";
import Logo from "./Logo";
import { Card, Pill, SectionTitle } from "./primitives";
import { ThemeToggle } from "./theme";

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
type Stage = "select" | "collect" | "ready";

type Selection = {
  geometry: GeoJSON.Polygon;
  name: string;
  crop?: string;
  region?: string;
  recId?: string;
};

// Defaults útiles para cultivos: 3 años de histórico (lo que pide el score) y
// 15 días entre imágenes — pasadas a menos de ~2 semanas no aportan fenología.
const DEFAULT_YEARS_BACK = 3;
const DEFAULT_INTERVAL = 15;
// Frecuencias recomendadas según la necesidad agronómica. El piso es 5 días:
// la cadencia nativa de Sentinel-2. El monitoreo diario (heladas, plagas
// fulminantes, hortalizas de ciclo corto) exige constelaciones comerciales
// (PlanetScope/SkySat) que este producto no usa.
const INTERVALS = [
  {
    days: 5,
    label: "5 días · Monitoreo activo",
    use: "Seguimiento de NDVI/NDRE en el pico de desarrollo, fertilización de precisión y control de malezas. Cadencia nativa de Sentinel-2.",
  },
  {
    days: 10,
    label: "10 días · Seguimiento regular",
    use: "Grano extensivo (maíz, trigo, soya, girasol) en condiciones climáticas estables.",
  },
  {
    days: 15,
    label: "15 días · Fenología e histórico (recomendado)",
    use: "Fases lentas (siembra/emergencia, secado/maduración) y la curva del lote año a año. Buen equilibrio detalle/volumen.",
  },
  {
    days: 30,
    label: "30 días · Perennes y suelos",
    use: "Frutales maduros, palma, viñedos en receso; mapeo de lotes y suelo desnudo.",
  },
];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function Dashboard({
  initialMode = "credito",
}: {
  initialMode?: Mode;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [stage, setStage] = useState<Stage>("select");

  const [recs, setRecs] = useState<Recommended[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [drawing, setDrawing] = useState(false);

  const [start, setStart] = useState(isoDaysAgo(DEFAULT_YEARS_BACK * 365));
  const [end, setEnd] = useState(isoDaysAgo(0));
  const [interval, setIntervalDays] = useState(DEFAULT_INTERVAL);

  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRecommendations().then(setRecs);
  }, []);

  const estScenes = useMemo(() => {
    const days =
      (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000;
    if (!Number.isFinite(days) || days <= 0) return null;
    return Math.max(1, Math.round(days / Math.max(interval, 5)));
  }, [start, end, interval]);

  function pickRecommendation(id: string) {
    const rec = recs.find((r) => r.id === id);
    if (!rec) return;
    setSelection({
      geometry: rec.geometry,
      name: rec.name,
      crop: rec.crop,
      region: rec.region,
      recId: rec.id,
    });
    setDrawing(false);
    setError(null);
  }

  function onDraw(geometry: GeoJSON.Polygon) {
    setDrawing(false);
    setSelection({ geometry, name: "Parcela dibujada" });
    setError(null);
  }

  function onCoords(lat: number, lon: number, ha: number) {
    const side = Math.sqrt(ha * 10_000); // m de lado de un cuadrado de `ha`
    const dLat = side / 2 / 111_320;
    const dLon = side / 2 / (111_320 * Math.cos((lat * Math.PI) / 180));
    const ring: [number, number][] = [
      [lon - dLon, lat - dLat],
      [lon + dLon, lat - dLat],
      [lon + dLon, lat + dLat],
      [lon - dLon, lat + dLat],
      [lon - dLon, lat - dLat],
    ];
    setSelection({
      geometry: { type: "Polygon", coordinates: [ring] },
      name: `Parcela ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
    });
    setDrawing(false);
    setError(null);
  }

  async function collect() {
    if (!selection) return;
    setStage("collect");
    setError(null);
    const res = await analyze(selection.geometry, {
      name: selection.name,
      start,
      end,
      intervalDays: interval,
      crop: selection.crop,
      region: selection.region,
    });
    if (res.ok) {
      setReport(res.report);
      setStage("ready");
    } else {
      setError(res.error);
      setStage("select");
    }
  }

  function reset() {
    setStage("select");
    setReport(null);
    setSelection(null);
    setError(null);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col px-4 py-5 lg:px-8">
      <Header mode={mode} setMode={setMode} />

      {stage === "select" && (
        <SelectStage
          mode={mode}
          recs={recs}
          selection={selection}
          drawing={drawing}
          setDrawing={setDrawing}
          pickRecommendation={pickRecommendation}
          onDraw={onDraw}
          onCoords={onCoords}
          start={start}
          end={end}
          interval={interval}
          setStart={setStart}
          setEnd={setEnd}
          setIntervalDays={setIntervalDays}
          estScenes={estScenes}
          collect={collect}
          error={error}
        />
      )}

      {stage === "collect" && selection && (
        <CollectStage selection={selection} start={start} end={end} interval={interval} />
      )}

      {stage === "ready" && report && (
        <ReadyStage
          mode={mode}
          report={report}
          selection={selection}
          reset={reset}
        />
      )}

      <Footer />
    </div>
  );
}

/* ────────────────────────── Etapa 1: selección ────────────────────────── */

function SelectStage(props: {
  mode: Mode;
  recs: Recommended[];
  selection: Selection | null;
  drawing: boolean;
  setDrawing: (fn: (d: boolean) => boolean) => void;
  pickRecommendation: (id: string) => void;
  onDraw: (g: GeoJSON.Polygon) => void;
  onCoords: (lat: number, lon: number, ha: number) => void;
  start: string;
  end: string;
  interval: number;
  setStart: (s: string) => void;
  setEnd: (s: string) => void;
  setIntervalDays: (n: number) => void;
  estScenes: number | null;
  collect: () => void;
  error: string | null;
}) {
  const {
    mode, recs, selection, drawing, setDrawing, pickRecommendation, onDraw,
    onCoords, start, end, interval, setStart, setEnd, setIntervalDays,
    estScenes, collect, error,
  } = props;

  return (
    <div className="mt-5 grid flex-1 grid-cols-1 gap-5 lg:grid-cols-[1fr_390px]">
      {/* Mapa gigante */}
      <div className="relative h-[420px] overflow-hidden rounded-2xl border border-line bg-card shadow-card lg:h-[calc(100vh-190px)] lg:min-h-[560px]">
        <ParcelMap
          recs={recs}
          selectedId={selection?.recId ?? null}
          onSelect={pickRecommendation}
          onDraw={onDraw}
          drawing={drawing}
          highlight={selection && !selection.recId ? selection.geometry : null}
        />
        <div className="pointer-events-none absolute right-3 top-3 z-[500] rounded-full border border-line bg-card/90 px-2.5 py-1 text-[11px] font-semibold text-ink-secondary shadow-soft backdrop-blur">
          🛰️ Satélite · elegí tu parcela
        </div>
      </div>

      {/* Columna de control */}
      <aside className="flex flex-col gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-forest-600">
            Paso 1 ·{" "}
            {mode === "credito" ? "Evaluación de crédito" : "Monitoreo de parcela"}
          </div>
          <h2 className="mt-0.5 text-xl font-extrabold tracking-tight text-ink-primary">
            ¿Qué parcela analizamos?
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            Elegí un lugar recomendado, escribí tus coordenadas o dibujá el
            lote directamente en el mapa.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-[#DC2626]/25 bg-[#DC2626]/[0.06] px-4 py-3 text-sm text-risk-alto">
            {error}
          </div>
        )}

        {/* Recomendados */}
        <div className="flex flex-col gap-1.5">
          <div className="px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
            Lugares recomendados
          </div>
          {recs.map((r) => (
            <button
              key={r.id}
              onClick={() => pickRecommendation(r.id)}
              className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition ${
                selection?.recId === r.id
                  ? "border-forest/40 bg-card shadow-card"
                  : "border-line-soft bg-card/60 hover:border-line hover:bg-card"
              }`}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-ink-primary">
                  {r.name}
                </div>
                <div className="truncate text-xs text-ink-muted">
                  {r.crop} · {r.region}
                </div>
              </div>
              {selection?.recId === r.id && (
                <span className="text-forest-600">✓</span>
              )}
            </button>
          ))}
        </div>

        {/* Dibujar / coordenadas */}
        <button
          onClick={() => setDrawing((d) => !d)}
          className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
            drawing
              ? "border-ocean/40 bg-ocean/10 text-ocean"
              : "border-line bg-card text-ink-secondary shadow-soft hover:border-forest/30 hover:text-forest"
          }`}
        >
          {drawing
            ? "Dibujando… hacé clic en el mapa (cerrá el polígono)"
            : "✏️  Dibujar mi parcela en el mapa"}
        </button>

        <CoordsForm onCoords={onCoords} />

        {/* Paso 2: recopilar */}
        {selection && (
          <Card className="border-forest/25">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-forest-600">
              Paso 2 · Recopilar imágenes
            </div>
            <div className="mt-1 text-sm font-bold text-ink-primary">
              {selection.name}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-xs text-ink-secondary">
                Desde
                <input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-ink-primary"
                />
              </label>
              <label className="text-xs text-ink-secondary">
                Hasta
                <input
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-ink-primary"
                />
              </label>
            </div>

            <label className="mt-3 block text-xs text-ink-secondary">
              Intervalo entre imágenes
              <select
                value={interval}
                onChange={(e) => setIntervalDays(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-line bg-card px-2 py-2 text-sm text-ink-primary"
              >
                {INTERVALS.map((i) => (
                  <option key={i.days} value={i.days}>
                    {i.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-1.5 rounded-lg bg-forest/[0.06] px-2.5 py-1.5 text-[11px] leading-relaxed text-ink-secondary">
              {INTERVALS.find((i) => i.days === interval)?.use}
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-muted">
              Sentinel-2 pasa cada ~5 días (piso del intervalo). El monitoreo
              diario —heladas, plagas fulminantes, hortalizas de ciclo corto—
              requiere satélites comerciales que este producto no usa.
            </p>

            <button
              onClick={collect}
              className="mt-4 w-full rounded-xl bg-forest px-4 py-3 text-sm font-bold text-btnink shadow-card transition hover:bg-forest-600"
            >
              🛰️ Recopilar imágenes
              {estScenes ? ` (≈ ${estScenes})` : ""}
            </button>
            {!hasLiveBackend && (
              <p className="mt-2 text-[11px] leading-relaxed text-risk-alto">
                Sin backend configurado (NEXT_PUBLIC_API_URL) la recopilación
                no puede ejecutarse.
              </p>
            )}
          </Card>
        )}
      </aside>
    </div>
  );
}

function CoordsForm({
  onCoords,
}: {
  onCoords: (lat: number, lon: number, ha: number) => void;
}) {
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [ha, setHa] = useState("20");
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    const la = parseFloat(lat);
    const lo = parseFloat(lon);
    const h = parseFloat(ha);
    if (!Number.isFinite(la) || la < -90 || la > 90)
      return setErr("Latitud inválida (−90 a 90).");
    if (!Number.isFinite(lo) || lo < -180 || lo > 180)
      return setErr("Longitud inválida (−180 a 180).");
    if (!Number.isFinite(h) || h < 1 || h > 400)
      return setErr("Hectáreas entre 1 y 400.");
    setErr(null);
    onCoords(la, lo, h);
  }

  return (
    <div className="rounded-xl border border-line-soft bg-card/60 p-3.5">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
        O con mis coordenadas
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <input
          placeholder="Lat (4.05)"
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          className="rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-ink-primary placeholder:text-ink-muted/60"
        />
        <input
          placeholder="Lon (−71.75)"
          value={lon}
          onChange={(e) => setLon(e.target.value)}
          className="rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-ink-primary placeholder:text-ink-muted/60"
        />
        <input
          placeholder="ha"
          value={ha}
          onChange={(e) => setHa(e.target.value)}
          className="rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-ink-primary placeholder:text-ink-muted/60"
        />
      </div>
      {err && <p className="mt-1.5 text-[11px] text-risk-alto">{err}</p>}
      <button
        onClick={submit}
        className="mt-2 w-full rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold text-ink-secondary transition hover:border-forest/30 hover:text-forest"
      >
        Ubicar parcela
      </button>
    </div>
  );
}

/* ────────────────────────── Etapa 2: recopilación ────────────────────────── */

const COLLECT_STEPS: [number, string][] = [
  [0, "Consultando el catálogo STAC de Planetary Computer…"],
  [6, "Seleccionando las escenas menos nubosas por ventana…"],
  [12, "Descargando bandas B4 · B5 · B8 · B11 · SCL…"],
  [60, "Enmascarando nubes y recortando al polígono…"],
  [100, "Calculando NDVI · NDMI · NDRE…"],
  [130, "Score de Riesgo Verde, verificación y alertas…"],
];

function CollectStage({
  selection,
  start,
  end,
  interval,
}: {
  selection: Selection;
  start: string;
  end: string;
  interval: number;
}) {
  const [elapsed, setElapsed] = useState(0);
  const t0 = useRef(Date.now());

  useEffect(() => {
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - t0.current) / 1000)),
      1000
    );
    return () => clearInterval(id);
  }, []);

  const stepIdx = COLLECT_STEPS.reduce(
    (acc, [t], i) => (elapsed >= t ? i : acc),
    0
  );

  return (
    <div className="mt-5 flex flex-1 items-center justify-center">
      <Card className="w-full max-w-xl text-center">
        <div className="mx-auto flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl bg-forest text-3xl">
          🛰️
        </div>
        <h2 className="mt-4 text-xl font-extrabold tracking-tight text-ink-primary">
          Recopilando imágenes de {selection.name}
        </h2>
        <p className="mt-1 text-xs text-ink-muted">
          {start} → {end} · cada {interval} días · Sentinel-2 L2A
        </p>

        <ul className="mx-auto mt-6 max-w-sm space-y-2 text-left">
          {COLLECT_STEPS.map(([, label], i) => (
            <li key={label} className="flex items-center gap-2.5 text-sm">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  i < stepIdx
                    ? "bg-forest-600 text-white"
                    : i === stepIdx
                      ? "animate-pulse bg-ndre text-white"
                      : "bg-line text-ink-muted"
                }`}
              >
                {i < stepIdx ? "✓" : i + 1}
              </span>
              <span
                className={
                  i <= stepIdx ? "text-ink-primary" : "text-ink-muted"
                }
              >
                {label}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-xs tabular-nums text-ink-muted">
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} ·
          la primera vez puede tardar varios minutos; el resultado queda en
          caché para la próxima.
        </p>
      </Card>
    </div>
  );
}

/* ────────────────────────── Etapa 3: resultados ────────────────────────── */

function ReadyStage({
  mode,
  report,
  selection,
  reset,
}: {
  mode: Mode;
  report: Report;
  selection: Selection | null;
  reset: () => void;
}) {
  const geometry = report.meta?.geometry ?? selection?.geometry ?? null;

  return (
    <div className="mt-5 grid flex-1 grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
      {/* Mapa a un ladito */}
      <aside className="flex flex-col gap-4">
        <div className="relative h-[260px] overflow-hidden rounded-2xl border border-line bg-card shadow-card lg:h-[300px]">
          <ParcelMap
            recs={[]}
            selectedId={null}
            onSelect={() => {}}
            onDraw={() => {}}
            drawing={false}
            highlight={geometry}
          />
        </div>
        <Card>
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
            Recopilación
          </div>
          <div className="mt-2 space-y-1 text-xs text-ink-secondary">
            <div>
              📅 {report.meta?.start} → {report.meta?.end}
            </div>
            <div>⏱ Una imagen cada {report.meta?.interval_days ?? "?"} días</div>
            <div>🛰️ {report.cobertura.n_fechas} lecturas útiles</div>
            {report.cobertura.validez_media != null && (
              <div>
                ☁️ Validez media{" "}
                {Math.round(report.cobertura.validez_media * 100)}%
              </div>
            )}
          </div>
        </Card>
        <button
          onClick={reset}
          className="rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-semibold text-ink-secondary shadow-soft transition hover:border-forest/30 hover:text-forest"
        >
          ← Analizar otra parcela
        </button>
      </aside>

      {/* Resultados */}
      <main className="min-w-0">
        <Hero report={report} />

        {report.surface && (
          <Card className="mb-6 overflow-hidden">
            <SectionTitle
              eyebrow={`Últimas ${report.surface.frames.length} lecturas · Sentinel-2`}
              hint="Cada píxel del lote como relieve: la altura y el color son el vigor del cultivo (NDVI). Arrastrá para rotar, movete en el tiempo con la línea."
            >
              Terreno vivo en 3D
            </SectionTitle>
            <Surface3D surface={report.surface} height={400} />
          </Card>
        )}

        {mode === "credito" ? (
          <CreditView report={report} />
        ) : (
          <FarmerView report={report} />
        )}
      </main>

      {/* Deja aire abajo para que la barra de Cuby no tape el contenido */}
      <div className="h-20 lg:col-span-2" />
      <ChatDock report={report} />
    </div>
  );
}

function Hero({ report }: { report: Report }) {
  const score = report.credito.score;
  const color = riskColor(score.risk_level);
  const nAlerts = report.alertas.alertas.length;

  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div className="min-w-0">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-forest-600">
          {report.meta?.crop || "Parcela"}
          {report.meta?.region ? ` · ${report.meta.region}` : ""}
        </div>
        <h2 className="text-2xl font-extrabold tracking-tight text-ink-primary lg:text-3xl">
          {report.parcela}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Pill color="#689149">● Sentinel-2 en vivo</Pill>
          <span className="text-xs text-ink-muted">
            {report.cobertura.n_fechas} lecturas
            {report.cobertura.validez_media != null
              ? ` · validez ${Math.round(report.cobertura.validez_media * 100)}%`
              : ""}
          </span>
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

/* ────────────────────────── Chrome compartido ────────────────────────── */

function Header({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <a href="/" className="flex items-center gap-3.5" title="Volver al inicio">
        <Logo variant="icon" />
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

      <div className="flex items-center gap-3 self-start sm:self-auto">
        <div className="inline-flex rounded-full border border-line bg-card p-1 shadow-soft">
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
        <ThemeToggle />
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
          ? "bg-forest text-btnink shadow-soft"
          : "text-ink-muted hover:text-ink-primary"
      }`}
    >
      {children}
    </button>
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
