"""Alertas tempranas sobre series sintéticas."""

import numpy as np

from analysis import evaluate_alerts
from analysis.series import Series


def _flat(value: float, n: int = 8, cadence: int = 5, name: str = "ndvi") -> Series:
    dates = np.datetime64("2026-05-01") + (np.arange(n) * cadence).astype("timedelta64[D]")
    return Series(dates=dates.astype("datetime64[ns]"),
                  values=np.full(n, value, dtype="float32"), name=name)


def _with_last_drop(base: float, drop_frac: float, name: str) -> Series:
    s = _flat(base, name=name)
    vals = s.values.copy()
    vals[-1] = base * (1 - drop_frac)
    return Series(dates=s.dates, values=vals, name=name)


def test_serie_estable_sin_alertas():
    rep = evaluate_alerts(_flat(0.7, name="ndvi"),
                          _flat(0.25, name="ndmi"),
                          _flat(0.35, name="ndre"))
    assert rep.estado == "ok"
    assert rep.alertas == []


def test_caida_ndmi_dispara_estres_hidrico():
    rep = evaluate_alerts(
        _flat(0.7, name="ndvi"),
        _with_last_drop(0.25, 0.22, "ndmi"),
        _flat(0.35, name="ndre"),
        parcela="Parcela #2",
    )
    assert rep.estado == "alerta"
    tipos = {a["tipo"] for a in rep.alertas}
    assert "estres_hidrico" in tipos
    hidrico = next(a for a in rep.alertas if a["tipo"] == "estres_hidrico")
    assert hidrico["severidad"] == "alta"
    assert "Parcela #2" in hidrico["mensaje"]


def test_caida_ndre_dispara_estres_clorofila():
    rep = evaluate_alerts(
        _flat(0.7, name="ndvi"),
        _flat(0.25, name="ndmi"),
        _with_last_drop(0.35, 0.16, "ndre"),
    )
    tipos = {a["tipo"] for a in rep.alertas}
    assert "estres_clorofila" in tipos
    clor = next(a for a in rep.alertas if a["tipo"] == "estres_clorofila")
    assert clor["severidad"] == "media"  # 16% -> aviso, no alta


def test_ndmi_bajo_absoluto_avisa_sequia():
    # Sin caída brusca pero por debajo del piso seco.
    rep = evaluate_alerts(_flat(0.7, name="ndvi"),
                          _flat(-0.05, name="ndmi"),
                          _flat(0.35, name="ndre"))
    tipos = {a["tipo"] for a in rep.alertas}
    assert "estres_hidrico" in tipos


def test_reporte_serializa_y_trae_ultimos_valores():
    rep = evaluate_alerts(_flat(0.7, name="ndvi"),
                          _flat(0.25, name="ndmi"),
                          _flat(0.35, name="ndre")).to_dict()
    assert rep["ultimos_valores"]["NDVI"] == 0.7
    assert set(rep) >= {"parcela", "estado", "evaluado_hasta", "alertas", "ultimos_valores"}
