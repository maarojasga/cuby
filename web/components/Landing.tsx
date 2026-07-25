"use client";

// Home: satélite holográfico + marca + los dos casos de uso.
// Estética "sala de control" (#010a12 / #00c2e4), en contraste deliberado con
// el panel cálido crema al que llevan los botones.

import dynamic from "next/dynamic";
import Link from "next/link";

const HeroSatellite = dynamic(() => import("./HeroSatellite"), { ssr: false });

const HOLO = "#00c2e4";

export default function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#010a12] text-white">
      <HeroSatellite />

      {/* Rótulo de telemetría, como en el visualizador original */}
      <div
        className="pointer-events-none absolute left-5 top-5 select-none text-[11px] uppercase tracking-[0.2em] opacity-80"
        style={{ color: HOLO, textShadow: `0 0 10px ${HOLO}99` }}
      >
        <div className="font-bold">Visualizador satelital</div>
        <div className="mt-1 normal-case tracking-normal opacity-80">
          Sentinel-2 · órbita cada ~5 días
        </div>
        <div className="normal-case tracking-normal opacity-60">
          Clic + arrastrar para rotar
        </div>
      </div>

      {/* Contenido: la mitad inferior, dejando el satélite arriba */}
      <div className="pointer-events-none relative z-10 flex min-h-screen flex-col items-center justify-end px-4 pb-14 text-center">
        <h1
          className="text-6xl font-extrabold tracking-tight sm:text-7xl"
          style={{ textShadow: "0 0 40px rgba(0,194,228,0.25)" }}
        >
          Cuby
        </h1>
        <p
          className="mt-2 text-xl font-medium sm:text-2xl"
          style={{ color: HOLO, textShadow: `0 0 14px ${HOLO}66` }}
        >
          Imágenes satelitales
        </p>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/60">
          Inteligencia agrícola sobre Sentinel-2: score crediticio de parcelas
          para entidades financieras y alertas tempranas de estrés para el
          agricultor. NDVI · NDMI · NDRE.
        </p>

        {/* Los dos casos de uso */}
        <div className="pointer-events-auto mt-8 grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
          <UseCase
            href="/panel?modo=credito"
            icon="🏦"
            title="Entidad financiera"
            desc="Score de Riesgo Verde: evaluá la parcela antes de aprobar el crédito de siembra."
          />
          <UseCase
            href="/panel?modo=agricultor"
            icon="🌱"
            title="Agricultor"
            desc="Alertas Tempranas: enterate del estrés hídrico o la plaga antes de verla en campo."
          />
        </div>

        <div className="mt-8 text-[11px] uppercase tracking-[0.18em] text-white/30">
          ARX
        </div>
      </div>
    </div>
  );
}

function UseCase({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-[#00c2e4]/25 bg-[#00c2e4]/[0.04] p-5 text-left backdrop-blur transition hover:border-[#00c2e4]/70 hover:bg-[#00c2e4]/[0.1] hover:shadow-[0_0_30px_rgba(0,194,228,0.25)]"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#00c2e4]/30 bg-[#010a12] text-xl">
          {icon}
        </span>
        <div className="flex-1">
          <div className="text-base font-bold text-white">{title}</div>
        </div>
        <span
          className="text-lg transition-transform group-hover:translate-x-1"
          style={{ color: "#00c2e4" }}
        >
          →
        </span>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-white/55">{desc}</p>
    </Link>
  );
}
