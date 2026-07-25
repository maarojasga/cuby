"""Score de Riesgo Verde y verificación de cultivo sobre series sintéticas."""

import numpy as np

from analysis import green_score, verify_crop
from analysis.series import Series


def _seasonal(
    years: int = 3,
    peak: float = 0.85,
    base: float = 0.15,
    cadence: int = 5,
    peak_jitter: float = 0.0,
    noise: float = 0.0,
    seed: int = 0,
) -> Series:
    """Serie de NDVI con un ciclo anual limpio; parámetros para romperla."""
    rng = np.random.default_rng(seed)
    start = np.datetime64("2022-01-01")
    n = int(years * 365 / cadence)
    dates = start + (np.arange(n) * cadence).astype("timedelta64[D]")
    doy = (dates - dates.astype("datetime64[Y]")).astype("timedelta64[D]").astype(int)
    frac = (doy % 365) / 365.0
    shape = 0.5 * (1 - np.cos(2 * np.pi * frac))  # 0 en año nuevo, 1 a mitad de año

    # Amplitud distinta por año -> variabilidad interanual controlada.
    year_idx = ((dates - start) / np.timedelta64(365, "D")).astype(int)
    amp = (peak - base) * (1 + peak_jitter * rng.standard_normal(len(np.unique(year_idx))))
    values = base + amp[year_idx] * shape + noise * rng.standard_normal(n)
    return Series(dates=dates, values=values.astype("float32"), name="ndvi")


def test_parcela_sana_estable_da_bajo_riesgo():
    score = green_score(_seasonal(years=3, peak=0.88, base=0.15))
    assert score.score >= 75
    assert score.risk_level == "bajo"


def test_parcela_erratica_baja_el_score():
    estable = green_score(_seasonal(years=3, peak=0.85, peak_jitter=0.0, seed=1))
    erratica = green_score(
        _seasonal(years=3, peak=0.85, peak_jitter=0.35, noise=0.08, seed=1)
    )
    assert erratica.score < estable.score


def test_tierra_pobre_da_alto_riesgo():
    # Pico bajo: nunca desarrolla biomasa de cultivo.
    score = green_score(_seasonal(years=3, peak=0.30, base=0.10))
    assert score.risk_level in ("alto", "medio")
    assert score.components.productividad < 0.5


def test_pocas_observaciones_no_scorea():
    s = Series(
        dates=np.array(["2024-01-01", "2024-01-06"], dtype="datetime64[ns]"),
        values=np.array([0.5, 0.6], dtype="float32"),
        name="ndvi",
    )
    score = green_score(s)
    assert score.score == 0
    assert score.risk_level == "sin_datos"


def test_score_serializa_a_dict():
    d = green_score(_seasonal()).to_dict()
    assert set(d) >= {"score", "risk_band", "risk_level", "components", "metrics", "rationale"}
    assert isinstance(d["rationale"], list) and d["rationale"]


def test_verifica_cultivo_activo():
    check = verify_crop(_seasonal(years=2, peak=0.85, base=0.15))
    assert check.is_cultivated
    assert check.pattern == "cultivo_activo"


def test_verifica_suelo_desnudo():
    s = Series(
        dates=np.arange("2022-01", "2024-01", np.timedelta64(15, "D"), dtype="datetime64[D]").astype("datetime64[ns]"),
        values=np.full(48, 0.18, dtype="float32"),
        name="ndvi",
    )
    check = verify_crop(s)
    assert not check.is_cultivated
    assert check.pattern == "suelo_desnudo"


def test_verifica_vegetacion_permanente():
    # NDVI alto y plano todo el año: bosque/potrero, no cultivo.
    dates = np.arange("2022-01", "2024-01", np.timedelta64(10, "D"), dtype="datetime64[D]").astype("datetime64[ns]")
    values = np.full(len(dates), 0.80, dtype="float32") + 0.01 * np.random.default_rng(0).standard_normal(len(dates)).astype("float32")
    check = verify_crop(Series(dates=dates, values=values, name="ndvi"))
    assert not check.is_cultivated
    assert check.pattern == "vegetacion_permanente"
