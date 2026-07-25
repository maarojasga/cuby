"""Score de Riesgo Verde — módulo para bancos y financieras.

Entra el histórico de vegetación de una parcela (2-3 años de NDVI) y sale un
número entre 0 y 100: qué tan productiva y confiable es la tierra como
garantía de un crédito de siembra. Cuanto más alto, menor riesgo.

El score no es una caja negra: se compone de cuatro señales, cada una
defendible frente a un jurado o un comité de crédito, y viene con el desglose
y las razones en texto para que la entidad entienda de dónde sale.

    Productividad  El vigor en la mejor parte del ciclo. Tierra pobre o
                   degradada nunca llega a NDVI alto ni regándola.
    Estabilidad    Consistencia año a año de las cosechas. Picos que
                   saltan de un año a otro = sequías o plagas recurrentes.
    Regularidad    ¿Hay ciclos de siembra limpios y repetidos, o la señal
                   es errática? Un cultivo sano tiene fenología reconocible.
    Cobertura      Cuántas observaciones útiles respaldan todo lo anterior.
                   Sin datos, no hay confianza; el score se modera solo.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

import numpy as np

from .series import Series

# Pesos de cada componente en el score final. Suman 1. La productividad pesa
# más porque es lo que un perito miraría primero; la cobertura pesa menos
# porque es un factor de confianza, no de calidad de la tierra.
WEIGHTS = {
    "productividad": 0.35,
    "estabilidad": 0.30,
    "regularidad": 0.20,
    "cobertura": 0.15,
}

# Cortes de la banda de riesgo. Elegidos para que una parcela buena y estable
# caiga en "Bajo" y una errática o pobre caiga en "Alto".
BAND_LOW = 75.0   # >= 75 -> Bajo riesgo
BAND_MEDIUM = 55.0  # 55..74 -> Riesgo medio ; < 55 -> Alto riesgo


@dataclass
class ScoreComponents:
    productividad: float
    estabilidad: float
    regularidad: float
    cobertura: float


@dataclass
class GreenScore:
    score: int                     # 0..100
    risk_band: str                 # "Bajo riesgo" | "Riesgo medio" | "Alto riesgo"
    risk_level: str                # "bajo" | "medio" | "alto" (para el frontend)
    components: ScoreComponents
    metrics: dict
    rationale: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        return d


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def _lin(x: float, lo: float, hi: float) -> float:
    """Normaliza x del rango [lo, hi] a [0, 1] con recorte en los extremos."""
    if hi == lo:
        return 0.0
    return _clamp01((x - lo) / (hi - lo))


def _percentile(values: np.ndarray, q: float) -> float:
    return float(np.percentile(values, q)) if values.size else 0.0


def _annual_peaks(dates: np.ndarray, values: np.ndarray) -> dict[int, float]:
    """Pico de NDVI por año calendario. La mejor parte del ciclo de cada año."""
    years = dates.astype("datetime64[Y]").astype(int) + 1970
    peaks: dict[int, float] = {}
    for y in np.unique(years):
        peaks[int(y)] = float(values[years == y].max())
    return peaks


def _monthly_climatology(dates: np.ndarray, values: np.ndarray) -> np.ndarray:
    """Valor esperado por mes (1..12), promediando todos los años.

    Es la 'forma' del año típico. La usamos para medir regularidad: si los
    datos reales se pegan a esta curva, la fenología es limpia.
    """
    months = dates.astype("datetime64[M]").astype(int) % 12  # 0..11
    clim = np.full(12, np.nan)
    for m in range(12):
        sel = values[months == m]
        if sel.size:
            clim[m] = sel.mean()
    return clim


def _regularity(dates: np.ndarray, values: np.ndarray) -> float:
    """Cuánta de la variación se explica por un patrón anual suave [0..1].

    Si el residuo contra la climatología mensual es chico frente a la
    variación total, hay un ciclo estacional reconocible (cultivo regular).
    Si el residuo es tan grande como la señal, la parcela es errática.
    """
    total_std = float(values.std())
    if total_std < 1e-6:
        return 0.0  # serie plana: no hay ciclo que reconocer
    clim = _monthly_climatology(dates, values)
    months = dates.astype("datetime64[M]").astype(int) % 12
    expected = clim[months]
    resid = values - expected
    resid_std = float(np.nanstd(resid))
    ratio = resid_std / total_std  # 0 = calza perfecto, 1 = puro ruido
    return _lin(1.0 - ratio, 0.3, 0.9)


def _stability(peaks: dict[int, float]) -> tuple[float, float]:
    """Consistencia de los picos anuales. Devuelve (score01, cv)."""
    vals = np.array(list(peaks.values()), dtype="float64")
    if vals.size < 2 or vals.mean() < 1e-6:
        # Con un solo año no se puede juzgar variabilidad interanual: neutral.
        return 0.6, float("nan")
    cv = float(vals.std() / vals.mean())  # coeficiente de variación
    # cv 0 (picos idénticos) -> 1.0 ; cv >= 0.30 (muy dispares) -> 0.0
    return _lin(1.0 - cv / 0.30, 0.0, 1.0), cv


def _band(score: float) -> tuple[str, str]:
    if score >= BAND_LOW:
        return "Bajo riesgo", "bajo"
    if score >= BAND_MEDIUM:
        return "Riesgo medio", "medio"
    return "Alto riesgo", "alto"


def green_score(
    ndvi: Series,
    valid_fraction: np.ndarray | None = None,
) -> GreenScore:
    """Calcula el Score de Riesgo Verde a partir del histórico de NDVI.

    `valid_fraction` (opcional) es la serie de calidad del cubo, una cifra por
    fecha original. Alimenta el componente de cobertura.
    """
    dates, values = ndvi.dates, ndvi.values
    n = int(values.size)
    if n < 4:
        # Sin histórico suficiente no se puede scorear con seriedad.
        return GreenScore(
            score=0,
            risk_band="Sin datos suficientes",
            risk_level="sin_datos",
            components=ScoreComponents(0.0, 0.0, 0.0, 0.0),
            metrics={"n_observaciones": n},
            rationale=[
                "No hay suficientes observaciones limpias para un score confiable "
                f"(se encontraron {n}, se necesitan al menos 4)."
            ],
        )

    # --- Componentes (cada uno en [0, 1]) ---
    peak = _percentile(values, 90)  # vigor de temporada, robusto a outliers
    productividad = _lin(peak, 0.25, 0.80)

    peaks = _annual_peaks(dates, values)
    estabilidad, cv_peaks = _stability(peaks)

    regularidad = _regularity(dates, values)

    if valid_fraction is not None and np.isfinite(valid_fraction).any():
        mean_vf = float(np.nanmean(valid_fraction))
    else:
        mean_vf = float("nan")
    span_days = float((dates.max() - dates.min()) / np.timedelta64(1, "D"))
    years_covered = max(span_days / 365.25, 0.0)
    # Cobertura combina calidad media de escena y densidad temporal.
    density = _lin(n / max(years_covered, 1e-6) / 30.0, 0.2, 1.0)  # ~obs/año vs ideal
    vf_component = _lin(mean_vf, 0.3, 0.8) if np.isfinite(mean_vf) else 0.6
    cobertura = 0.6 * vf_component + 0.4 * density

    comp = ScoreComponents(
        productividad=round(productividad, 3),
        estabilidad=round(estabilidad, 3),
        regularidad=round(regularidad, 3),
        cobertura=round(cobertura, 3),
    )

    raw = (
        WEIGHTS["productividad"] * productividad
        + WEIGHTS["estabilidad"] * estabilidad
        + WEIGHTS["regularidad"] * regularidad
        + WEIGHTS["cobertura"] * cobertura
    )
    score = int(round(100 * raw))
    band, level = _band(score)

    metrics = {
        "ndvi_pico": round(peak, 3),
        "ndvi_medio": round(float(values.mean()), 3),
        "ndvi_minimo": round(float(values.min()), 3),
        "cv_picos_anuales": None if not np.isfinite(cv_peaks) else round(cv_peaks, 3),
        "picos_por_anio": {str(k): round(v, 3) for k, v in sorted(peaks.items())},
        "anios_cubiertos": round(years_covered, 2),
        "n_observaciones": n,
        "validez_media": None if not np.isfinite(mean_vf) else round(mean_vf, 3),
    }

    return GreenScore(
        score=score,
        risk_band=band,
        risk_level=level,
        components=comp,
        metrics=metrics,
        rationale=_rationale(comp, metrics, level),
    )


def _rationale(comp: ScoreComponents, metrics: dict, level: str) -> list[str]:
    """Frases legibles para el comité de crédito. Nada de jerga espectral."""
    out: list[str] = []

    if comp.productividad >= 0.7:
        out.append(
            f"Vigor alto en temporada (NDVI pico {metrics['ndvi_pico']}): "
            "la tierra alcanza biomasa propia de un cultivo productivo."
        )
    elif comp.productividad >= 0.4:
        out.append(
            f"Vigor moderado (NDVI pico {metrics['ndvi_pico']}): productividad media, "
            "sin llegar a niveles de tierra de primera."
        )
    else:
        out.append(
            f"Vigor bajo (NDVI pico {metrics['ndvi_pico']}): la parcela no alcanza "
            "la biomasa esperada de un cultivo sano."
        )

    cv = metrics["cv_picos_anuales"]
    if cv is None:
        out.append(
            "Menos de dos años de histórico: no se pudo evaluar la variabilidad "
            "interanual, principal fuente de riesgo."
        )
    elif comp.estabilidad >= 0.7:
        out.append(
            f"Cosechas consistentes año a año (variación de picos {cv:.0%}): "
            "sin caídas drásticas que sugieran sequías o plagas recurrentes."
        )
    else:
        out.append(
            f"Alta variabilidad entre años (variación de picos {cv:.0%}): "
            "el histórico muestra caídas que elevan el riesgo del crédito."
        )

    if comp.regularidad >= 0.6:
        out.append("Ciclos de siembra regulares y reconocibles: fenología sana.")
    else:
        out.append(
            "Ciclos irregulares o señal errática: cuesta anticipar la próxima campaña."
        )

    if comp.cobertura < 0.4:
        out.append(
            "Cobertura de datos limitada (nubosidad o pocas pasadas útiles): "
            "el score se tomó con cautela."
        )

    if level == "bajo":
        out.append("Recomendación: perfil apto para crédito de siembra sin visita de perito.")
    elif level == "medio":
        out.append("Recomendación: crédito viable con seguimiento; considerar visita puntual.")
    elif level == "alto":
        out.append("Recomendación: riesgo elevado; se sugiere visita de campo antes de aprobar.")

    return out
