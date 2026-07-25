"""Genera reportes de demo por parcela, con datos sintéticos realistas.

No inventa el resultado: fabrica series NDVI/NDMI/NDRE físicamente plausibles
y las pasa por EL MISMO código de score, verificación y alertas que corre el
backend en vivo. Así la demo es coherente con lo real y sirve de fallback
cuando el backend está frío o sin red.

    python scripts/build_demo_reports.py

Escribe api/demo/<id>.json y api/demo/index.json.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from analysis.report import report_from_series
from analysis.series import Series

ROOT = Path(__file__).resolve().parent.parent
PARCELS = json.loads((ROOT / "data" / "parcels" / "parcels.json").read_text())
OUT = ROOT / "api" / "demo"

# Ancla fija para que la demo sea reproducible (no depende de "hoy").
END = np.datetime64("2026-07-20")
YEARS = 3
CADENCE = 5  # días entre pasadas de Sentinel-2


def _dates() -> np.ndarray:
    n = int(YEARS * 365 / CADENCE)
    start = END - np.timedelta64(YEARS * 365, "D")
    return (start + (np.arange(n) * CADENCE).astype("timedelta64[D]")).astype("datetime64[ns]")


def _seasonal_shape(dates: np.ndarray, cycles: float, phase: float = 0.0) -> np.ndarray:
    """Forma estacional en [0, 1], `cycles` ciclos por año."""
    start = dates[0]
    t = (dates - start) / np.timedelta64(365, "D")
    return 0.5 * (1 - np.cos(2 * np.pi * (cycles * t + phase)))


def _ndvi(story: str, dates: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    n = len(dates)
    if story == "permanent":
        # Palma: verde alto y casi plano todo el año.
        return np.clip(0.80 + 0.03 * _seasonal_shape(dates, 1) + 0.01 * rng.standard_normal(n), 0, 1)

    cycles = 2 if story in ("variable", "stressed") else 1  # arroz: dos campañas/año
    # Fase por historia: todas las parcelas de demo están en campaña "hoy",
    # así el relieve 3D de las últimas lecturas muestra el cultivo desarrollado
    # y no el rastrojo de fin de temporada. El lote estresado queda justo en el
    # pico: el estrés golpea con el cultivo verde y alto, que es cuando el 3D
    # lo delata.
    phase = {"stressed": 0.5, "variable": 0.3}.get(story, 0.45)
    shape = _seasonal_shape(dates, cycles, phase=phase)

    year_idx = ((dates - dates[0]) / np.timedelta64(365, "D")).astype(int)
    n_years = len(np.unique(year_idx)) + 1
    if story == "variable":
        # Arroz con campañas dispares y una temporada mala (sequía): riesgo medio.
        base, peak = 0.15, 0.70
        amp = (peak - base) * (1 + 0.28 * rng.standard_normal(n_years))
        amp[1] *= 0.45  # un año flojo, caída marcada del pico
        noise = 0.06
    elif story == "stressed":
        base, peak = 0.16, 0.84
        amp = (peak - base) * (1 + 0.10 * rng.standard_normal(n_years))
        noise = 0.03
    else:  # healthy
        base, peak = 0.16, 0.86
        amp = (peak - base) * (1 + 0.04 * rng.standard_normal(n_years))
        noise = 0.02

    ndvi = base + amp[year_idx] * shape + noise * rng.standard_normal(n)
    return np.clip(ndvi, 0.02, 0.95)


def _derive(ndvi: np.ndarray, rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    """NDMI y NDRE correlacionados con el NDVI pero con su propio rango/ruido."""
    n = len(ndvi)
    ndre = np.clip(0.55 * ndvi + 0.02 + 0.012 * rng.standard_normal(n), -0.1, 0.8)
    ndmi = np.clip(0.45 * ndvi - 0.05 + 0.015 * rng.standard_normal(n), -0.3, 0.5)
    return ndmi, ndre


def _stabilize_tail(dates, arr):
    """Aplana la última observación al nivel reciente.

    En las parcelas sanas de la demo evita que la senescencia normal del ciclo
    dispare una falsa alerta: la regla del 15% mira la caída semana a semana y
    no distingue por sí sola una cosecha de un problema. Para el relato limpio
    de la demo, la última pasada queda en el nivel de las anteriores.
    """
    from analysis.alerts import REFERENCE_WINDOW_DAYS
    last = dates[-1]
    window = (dates >= last - np.timedelta64(REFERENCE_WINDOW_DAYS, "D")) & (dates < last)
    ref = float(np.median(arr[window])) if window.any() else float(arr[-2])
    arr = arr.copy()
    arr[-1] = ref
    return arr


def _apply_stress(dates, ndvi, ndmi, ndre):
    """Mete una caída reciente para disparar alertas en la parcela 'stressed'.

    Clorofila (NDRE) y agua (NDMI) caen primero y fuerte; la biomasa (NDVI)
    apenas empieza a ceder — justo el orden que el producto promete detectar.
    """
    ndre[-1] *= 0.80  # -20% clorofila
    ndmi[-1] *= 0.75  # -25% humedad
    ndvi[-1] *= 0.92  # -8% biomasa, aún incipiente
    return ndvi, ndmi, ndre


def _valid_fraction(story: str, n: int, rng: np.random.Generator) -> np.ndarray:
    mean = 0.62 if story in ("variable", "stressed") else 0.78
    return np.clip(mean + 0.12 * rng.standard_normal(n), 0.05, 1.0).astype("float32")


# --- Superficie 3D: grilla NDVI por píxel de las últimas lecturas ---

SURFACE_N = 26      # celdas por lado
SURFACE_FRAMES = 12  # últimas lecturas (~2 meses de Sentinel-2)


def _surface(feat: dict, story: str, dates: np.ndarray,
             ndvi_v: np.ndarray, rng: np.random.Generator) -> dict:
    """Fabrica la grilla espacial que alimenta el relieve 3D del frontend.

    La base de cada frame es el valor medio de la serie en esa fecha; encima va
    una textura espacial suave y fija por parcela (los surcos y manchones que
    un lote real siempre tiene). En la historia 'stressed', un manchón en la
    zona norte se profundiza en las últimas lecturas — la anomalía localizada
    que el promedio del polígono todavía disimula.
    """
    from shapely.geometry import Point, shape

    geom = shape(feat["geometry"])
    minx, miny, maxx, maxy = geom.bounds
    n = SURFACE_N
    xs = np.linspace(minx, maxx, n)
    ys = np.linspace(miny, maxy, n)  # ascendente: la última fila es el norte
    mask = np.array([[geom.contains(Point(x, y)) for x in xs] for y in ys])

    gx, gy = np.meshgrid(np.linspace(0, 1, n), np.linspace(0, 1, n))
    ph = rng.uniform(0, 2 * np.pi, 3)
    texture = (
        0.5 * np.sin(2 * np.pi * gx * 1.7 + ph[0])
        + 0.5 * np.sin(2 * np.pi * gy * 1.3 + ph[1])
        + 0.3 * np.sin(2 * np.pi * (gx + gy) * 2.3 + ph[2])
    )
    texture /= max(float(np.abs(texture).max()), 1e-6)

    k = SURFACE_FRAMES
    out_dates = [str(d.astype("datetime64[D]")) for d in dates[-k:]]
    frames = []
    for i, base in enumerate(ndvi_v[-k:]):
        f = base * (1 + 0.08 * texture) + 0.012 * rng.standard_normal((n, n))
        if story == "stressed":
            # El manchón aparece en las últimas 5 lecturas y crece.
            t = max(0.0, i - (k - 5)) / 4.0
            dist = np.sqrt((gx - 0.5) ** 2 + ((gy - 0.8) / 0.6) ** 2)
            f *= 1 - 0.55 * t * np.exp(-((dist / 0.28) ** 2))
        vals = np.clip(f, 0.0, 1.0)
        frames.append([
            [round(float(vals[r, c]), 3) if mask[r, c] else None for c in range(n)]
            for r in range(n)
        ])

    return {"index": "ndvi", "dates": out_dates, "frames": frames, "north": "last_row"}


def build_one(feat: dict) -> dict:
    props = feat["properties"]
    story = props.get("story", "healthy")
    rng = np.random.default_rng(abs(hash(props["id"])) % (2**32))

    dates = _dates()
    ndvi_v = _ndvi(story, dates, rng)
    ndmi_v, ndre_v = _derive(ndvi_v, rng)
    if story == "stressed":
        ndvi_v, ndmi_v, ndre_v = _apply_stress(dates, ndvi_v, ndmi_v, ndre_v)
    else:
        # Parcelas sin estrés: la última pasada no debe fabricar una alerta
        # por la caída estacional normal del cultivo.
        ndvi_v = _stabilize_tail(dates, ndvi_v)
        ndmi_v = _stabilize_tail(dates, ndmi_v)
        ndre_v = _stabilize_tail(dates, ndre_v)
    vf = _valid_fraction(story, len(dates), rng)

    def S(v, name):
        return Series(dates=dates, values=v.astype("float32"), name=name)

    report = report_from_series(
        S(ndvi_v, "ndvi"), S(ndmi_v, "ndmi"), S(ndre_v, "ndre"),
        parcela=props["name"],
        parcel_id=props["id"],
        valid_fraction=vf,
        meta={
            "crop": props.get("crop"),
            "region": props.get("region"),
            "geometry": feat["geometry"],
            "source": "demo",  # marca honesta: datos sintéticos, no Sentinel-2 real
        },
        surface=_surface(feat, story, dates, ndvi_v, rng),
    )
    return report


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    index = []
    for feat in PARCELS["features"]:
        report = build_one(feat)
        pid = feat["properties"]["id"]
        (OUT / f"{pid}.json").write_text(json.dumps(report, ensure_ascii=False), encoding="utf-8")
        s = report["credito"]["score"]
        index.append({
            "id": pid,
            "name": feat["properties"]["name"],
            "crop": feat["properties"].get("crop"),
            "region": feat["properties"].get("region"),
            "geometry": feat["geometry"],
            "score": s["score"],
            "risk_level": s["risk_level"],
            "estado_alertas": report["alertas"]["estado"],
            # Mini-serie para el sparkline de la lista de parcelas.
            "spark": [p["value"] for p in report["series"]["ndvi"][-24:]],
        })
        print(f"  {pid}: score {s['score']} ({s['risk_level']}), alertas {report['alertas']['estado']}")
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{len(index)} reportes de demo en {OUT}")


if __name__ == "__main__":
    main()
