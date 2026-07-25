"use client";

// Relieve 3D del cultivo: la grilla NDVI de las últimas lecturas como un
// terreno vivo. Altura y color = vigor del cultivo; la animación recorre las
// pasadas del satélite y deja ver dónde y cuándo empieza el estrés.
//
// Three.js directo (sin react-three-fiber): una escena, un mesh con colores
// por vértice y un loop que interpola suavemente entre lecturas.

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { SurfaceData } from "@/lib/types";
import { fmtDate } from "@/lib/ui";

const HEIGHT = 0.95; // altura del relieve para NDVI = 1
const FRAME_MS = 850; // cadencia de la animación temporal

// Rampa estrés -> vigor, en la paleta del producto.
const STOPS: [number, THREE.Color][] = [
  [0.15, new THREE.Color("#DC2626")], // estrés severo
  [0.4, new THREE.Color("#D97706")], // estrés / suelo
  [0.65, new THREE.Color("#689149")], // vigor
  [0.9, new THREE.Color("#33501F")], // vigor pleno (verde profundo)
];

function valueColor(v: number, out: THREE.Color) {
  if (v <= STOPS[0][0]) return out.copy(STOPS[0][1]);
  for (let i = 1; i < STOPS.length; i++) {
    if (v <= STOPS[i][0]) {
      const [a, ca] = STOPS[i - 1];
      const [b, cb] = STOPS[i];
      return out.copy(ca).lerp(cb, (v - a) / (b - a));
    }
  }
  return out.copy(STOPS[STOPS.length - 1][1]);
}

// Zona que más se quedó atrás del resto del lote entre las primeras lecturas
// de la ventana y la última. Se mide como anomalía relativa (zona vs. lote
// completo) para que funcione igual con el cultivo subiendo o bajando: una
// mancha enferma en plena campaña no "cae", crece menos que sus vecinos.
function worstZone(
  frames: (number | null)[][][]
): { zone: string; drop: number } | null {
  if (frames.length < 4) return null;
  const R = frames[0].length;
  const C = frames[0][0].length;
  const refN = 3;

  const zoneOf = (r: number, c: number): string[] => [
    r < R / 2 ? "norte" : "sur", // fila 0 = norte (frames ya orientados)
    c < C / 2 ? "oeste" : "este",
  ];

  const acc: Record<string, { ref: number; last: number; n: number }> = {};
  let allRef = 0;
  let allLast = 0;
  let allN = 0;
  const last = frames[frames.length - 1];

  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const lv = last[r][c];
      if (lv == null) continue;
      let ref = 0;
      let k = 0;
      for (let f = 0; f < refN; f++) {
        const v = frames[f][r][c];
        if (v != null) {
          ref += v;
          k++;
        }
      }
      if (!k) continue;
      ref /= k;
      allRef += ref;
      allLast += lv;
      allN++;
      for (const z of zoneOf(r, c)) {
        acc[z] ??= { ref: 0, last: 0, n: 0 };
        acc[z].ref += ref;
        acc[z].last += lv;
        acc[z].n++;
      }
    }
  }
  if (!allN || allRef / allN < 0.05 || allLast / allN < 0.05) return null;
  const parcelRatio = allLast / allRef; // cómo evolucionó el lote entero

  let best: { zone: string; drop: number } | null = null;
  for (const [zone, { ref, last: lv, n }] of Object.entries(acc)) {
    if (!n || ref / n < 0.05) continue;
    // < 1: la zona evolucionó peor que el lote. drop = cuánto peor.
    const rel = lv / ref / parcelRatio;
    const d = 1 - rel;
    if (!best || d > best.drop) best = { zone, drop: d };
  }
  return best && best.drop >= 0.06 ? best : null;
}

export default function Surface3D({
  surface,
  height = 400,
}: {
  surface: SurfaceData;
  height?: number;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const targetRef = useRef<Float32Array | null>(null);

  // Frames orientados: fila 0 = norte, siempre.
  const frames = useMemo(
    () =>
      surface.north === "last_row"
        ? surface.frames.map((f) => [...f].reverse())
        : surface.frames,
    [surface]
  );
  const zone = useMemo(() => worstZone(frames), [frames]);

  const nFrames = frames.length;

  // --- escena (una vez) ---
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !nFrames) return;

    const R = frames[0].length;
    const C = frames[0][0].length;
    const aspect2d = C / R;
    const W = aspect2d >= 1 ? 2.5 : 2.5 * aspect2d;
    const D = aspect2d >= 1 ? 2.5 / aspect2d : 2.5;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      46,
      mount.clientWidth / height,
      0.1,
      100
    );
    camera.position.set(2.3, 1.9, 2.7);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, height);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.3, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.9;
    controls.enablePan = false;
    controls.minDistance = 2;
    controls.maxDistance = 7;
    controls.maxPolarAngle = Math.PI * 0.49;

    scene.add(new THREE.HemisphereLight(0xfff8ec, 0xa89f8d, 1.15));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(2.5, 4, 1.5);
    scene.add(sun);

    // --- geometría del terreno: solo celdas dentro del lote ---
    const mask = frames[0].map((row) => row.map((v) => v != null));
    const xOf = (c: number) => (c / (C - 1) - 0.5) * W;
    const zOf = (r: number) => (r / (R - 1) - 0.5) * D;

    const positions = new Float32Array(R * C * 3);
    const colors = new Float32Array(R * C * 3);
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const i = r * C + c;
        positions[i * 3] = xOf(c);
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = zOf(r);
      }
    }
    const indices: number[] = [];
    for (let r = 0; r < R - 1; r++) {
      for (let c = 0; c < C - 1; c++) {
        if (mask[r][c] && mask[r][c + 1] && mask[r + 1][c] && mask[r + 1][c + 1]) {
          const a = r * C + c;
          const b = r * C + c + 1;
          const d = (r + 1) * C + c;
          const e = (r + 1) * C + c + 1;
          indices.push(a, d, b, b, d, e);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    // Pedestal: una placa crema con el contorno del bbox, para asentarlo.
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(W + 0.25, 0.06, D + 0.25),
      new THREE.MeshStandardMaterial({ color: 0xede7d8, roughness: 1 })
    );
    base.position.y = -0.05;
    scene.add(base);

    // Brújula: un sprite "N" en el borde norte (fila 0 => z negativo).
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#171009";
    ctx.font = "bold 40px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("N", 32, 34);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas),
        transparent: true,
        opacity: 0.75,
      })
    );
    sprite.scale.set(0.22, 0.22, 1);
    sprite.position.set(0, 0.12, -(D / 2 + 0.35));
    scene.add(sprite);

    // --- animación: interpola hacia el frame objetivo ---
    const current = new Float32Array(R * C);
    const setTarget = (f: number) => {
      const t = new Float32Array(R * C);
      const fr = frames[Math.min(f, nFrames - 1)];
      for (let r = 0; r < R; r++)
        for (let c = 0; c < C; c++) t[r * C + c] = (fr[r][c] ?? 0) * HEIGHT;
      targetRef.current = t;
    };
    setTarget(0);

    const tmp = new THREE.Color();
    let raf = 0;
    let disposed = false;
    const tick = () => {
      if (disposed) return;
      const target = targetRef.current;
      if (target) {
        const pos = geo.getAttribute("position") as THREE.BufferAttribute;
        const col = geo.getAttribute("color") as THREE.BufferAttribute;
        let moving = false;
        for (let i = 0; i < current.length; i++) {
          const diff = target[i] - current[i];
          if (Math.abs(diff) > 0.0004) {
            current[i] += diff * 0.14;
            moving = true;
          } else {
            current[i] = target[i];
          }
          pos.setY(i, current[i]);
          valueColor(current[i] / HEIGHT, tmp);
          col.setXYZ(i, tmp.r, tmp.g, tmp.b);
        }
        pos.needsUpdate = true;
        col.needsUpdate = true;
        if (moving) geo.computeVertexNormals();
      }
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    // Exponer setTarget al efecto de frame (via ref para no recrear escena).
    (mount as any).__setTarget = setTarget;

    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    });
    ro.observe(mount);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      delete (mount as any).__setTarget;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, height, nFrames]);

  // Cambio de frame -> nuevo objetivo de interpolación.
  useEffect(() => {
    const mount = mountRef.current as any;
    mount?.__setTarget?.(frame);
  }, [frame]);

  // Reproducción automática en bucle.
  useEffect(() => {
    if (!playing || nFrames < 2) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % nFrames), FRAME_MS);
    return () => clearInterval(id);
  }, [playing, nFrames]);

  if (!nFrames) return null;

  return (
    <div>
      <div className="relative">
        <div ref={mountRef} style={{ height }} className="w-full cursor-grab" />

        {/* Fecha de la lectura visible */}
        <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-line bg-card/90 px-3 py-1 text-xs font-semibold tabular-nums text-ink-primary shadow-soft backdrop-blur">
          🛰️ {fmtDate(surface.dates[frame])}
        </div>

        {/* Zona más afectada */}
        {zone && frame >= nFrames - 3 && (
          <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-[#DC2626] px-3 py-1 text-xs font-semibold text-white shadow-soft">
            ⚠ Mayor caída: zona {zone.zone} (−{Math.round(zone.drop * 100)}%)
          </div>
        )}
      </div>

      {/* Controles temporales + leyenda */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          onClick={() => setPlaying((p) => !p)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest text-sm text-white shadow-soft transition hover:bg-forest-600"
          aria-label={playing ? "Pausar" : "Reproducir"}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <input
          type="range"
          min={0}
          max={nFrames - 1}
          value={frame}
          onChange={(e) => {
            setPlaying(false);
            setFrame(Number(e.target.value));
          }}
          className="h-1.5 min-w-[140px] flex-1 cursor-pointer appearance-none rounded-full bg-line accent-[#222D67]"
        />
        <div className="flex items-center gap-2 text-[11px] text-ink-muted">
          <span>Estrés</span>
          <span
            className="h-2 w-24 rounded-full"
            style={{
              background:
                "linear-gradient(90deg,#DC2626,#D97706 38%,#689149 72%,#222D67)",
            }}
          />
          <span>Vigor</span>
        </div>
      </div>
    </div>
  );
}
