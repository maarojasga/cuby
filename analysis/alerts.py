"""Alertas tempranas — módulo para el agricultor.

Una vez aprobado el crédito, el sistema mira la parcela en cada pasada de
Sentinel-2 (~5 días) y dispara avisos cuando algo se sale de lo normal, antes
de que el daño sea visible a ojo.

Tres señales, cada una adelantándose un poco más:

    NDRE  clorofila — cae primero, días antes que el NDVI. Plagas/enfermedad.
    NDMI  agua en la hoja — cae con el estrés hídrico antes del marchitamiento.
    NDVI  biomasa — confirma el daño cuando ya se instaló.

La regla base es la del enunciado: una caída brusca (~15-20%) del valor medio
del polígono respecto a la referencia reciente dispara la alerta.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np

from .series import Series

# Ventana (días) hacia atrás desde la última observación que forma la
# referencia. ~14 días ≈ "la semana o dos anteriores" con la cadencia de S-2.
REFERENCE_WINDOW_DAYS = 16

# Umbrales de caída relativa que disparan alerta, por índice.
DROP_WARN = 0.15   # 15% -> aviso
DROP_HIGH = 0.20   # 20% -> alerta alta

# Piso absoluto de NDMI: por debajo, la hoja está seca aunque no haya caído
# de golpe. Es orientativo y depende del cultivo.
NDMI_DRY_FLOOR = 0.0


@dataclass
class Alert:
    tipo: str          # estres_hidrico | estres_vegetal | estres_clorofila
    severidad: str     # media | alta
    indice: str        # NDVI | NDMI | NDRE
    fecha: str
    valor_actual: float
    valor_referencia: float | None
    caida_pct: float | None
    mensaje: str

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class AlertReport:
    parcela: str
    estado: str            # ok | alerta
    evaluado_hasta: str | None
    alertas: list[dict]
    ultimos_valores: dict

    def to_dict(self) -> dict:
        return asdict(self)


def _latest_and_reference(s: Series) -> tuple[str, float, float | None]:
    """Última observación y una referencia robusta reciente.

    La referencia es la mediana de las observaciones en la ventana previa a la
    última (excluyéndola). Mediana y no media: una sola escena con niebla
    residual no debe fabricar una caída que no existe.
    """
    if len(s) == 0:
        return "", float("nan"), None

    last_date = s.dates[-1]
    last_value = float(s.values[-1])
    iso = str(last_date.astype("datetime64[D]"))

    window_start = last_date - np.timedelta64(REFERENCE_WINDOW_DAYS, "D")
    in_window = (s.dates >= window_start) & (s.dates < last_date)
    ref_vals = s.values[in_window]

    if ref_vals.size == 0:
        # Sin nada en la ventana: caemos a la observación inmediata anterior.
        ref = float(s.values[-2]) if len(s) >= 2 else None
    else:
        ref = float(np.median(ref_vals))

    return iso, last_value, ref


def _drop(current: float, reference: float | None) -> float | None:
    """Caída relativa positiva respecto a la referencia. None si no aplica."""
    if reference is None or not np.isfinite(reference) or reference <= 1e-6:
        return None
    return (reference - current) / reference


def _severity(drop: float) -> str | None:
    if drop >= DROP_HIGH:
        return "alta"
    if drop >= DROP_WARN:
        return "media"
    return None


def evaluate_alerts(
    ndvi: Series,
    ndmi: Series | None = None,
    ndre: Series | None = None,
    parcela: str = "Parcela",
) -> AlertReport:
    """Evalúa las señales recientes y arma el parte de alertas de la parcela."""
    alerts: list[Alert] = []
    ultimos: dict = {}

    # --- NDRE: clorofila, el que se adelanta ---
    if ndre is not None and len(ndre):
        fecha, actual, ref = _latest_and_reference(ndre)
        ultimos["NDRE"] = round(actual, 4)
        drop = _drop(actual, ref)
        sev = _severity(drop) if drop is not None else None
        if sev:
            alerts.append(Alert(
                tipo="estres_clorofila",
                severidad=sev,
                indice="NDRE",
                fecha=fecha,
                valor_actual=round(actual, 4),
                valor_referencia=round(ref, 4) if ref is not None else None,
                caida_pct=round(drop * 100, 1),
                mensaje=(
                    f"Atención {parcela}: caída de {drop:.0%} en clorofila (NDRE) "
                    "respecto a la referencia reciente. Señal temprana de posible "
                    "plaga o enfermedad — revisar el lote antes de que sea visible."
                ),
            ))

    # --- NDMI: agua en la hoja ---
    if ndmi is not None and len(ndmi):
        fecha, actual, ref = _latest_and_reference(ndmi)
        ultimos["NDMI"] = round(actual, 4)
        drop = _drop(actual, ref)
        sev = _severity(drop) if drop is not None else None
        if sev:
            alerts.append(Alert(
                tipo="estres_hidrico",
                severidad=sev,
                indice="NDMI",
                fecha=fecha,
                valor_actual=round(actual, 4),
                valor_referencia=round(ref, 4) if ref is not None else None,
                caida_pct=round(drop * 100, 1),
                mensaje=(
                    f"Atención {parcela}: caída de {drop:.0%} en humedad de la "
                    "canopia (NDMI). Posible estrés hídrico — considerar riego "
                    "antes de que la planta se marchite."
                ),
            ))
        elif np.isfinite(actual) and actual < NDMI_DRY_FLOOR:
            alerts.append(Alert(
                tipo="estres_hidrico",
                severidad="media",
                indice="NDMI",
                fecha=fecha,
                valor_actual=round(actual, 4),
                valor_referencia=round(ref, 4) if ref is not None else None,
                caida_pct=None,
                mensaje=(
                    f"Atención {parcela}: humedad de canopia baja (NDMI {actual:.2f}). "
                    "La hoja está seca; revisar disponibilidad de agua."
                ),
            ))

    # --- NDVI: biomasa, confirma ---
    if len(ndvi):
        fecha, actual, ref = _latest_and_reference(ndvi)
        ultimos["NDVI"] = round(actual, 4)
        drop = _drop(actual, ref)
        sev = _severity(drop) if drop is not None else None
        if sev:
            alerts.append(Alert(
                tipo="estres_vegetal",
                severidad=sev,
                indice="NDVI",
                fecha=fecha,
                valor_actual=round(actual, 4),
                valor_referencia=round(ref, 4) if ref is not None else None,
                caida_pct=round(drop * 100, 1),
                mensaje=(
                    f"Atención {parcela}: caída de {drop:.0%} en biomasa (NDVI). "
                    "El estrés ya afecta el vigor general del cultivo — "
                    "inspección recomendada."
                ),
            ))

    evaluado = max(
        (s.dates[-1] for s in (ndvi, ndmi, ndre) if s is not None and len(s)),
        default=None,
    )
    return AlertReport(
        parcela=parcela,
        estado="alerta" if alerts else "ok",
        evaluado_hasta=str(evaluado.astype("datetime64[D]")) if evaluado is not None else None,
        alertas=[a.to_dict() for a in _dedupe(alerts)],
        ultimos_valores=ultimos,
    )


def _dedupe(alerts: list[Alert]) -> list[Alert]:
    """Ordena por severidad (alta primero) y evita dos alertas del mismo tipo."""
    order = {"alta": 0, "media": 1}
    alerts = sorted(alerts, key=lambda a: order.get(a.severidad, 9))
    seen: set[str] = set()
    out: list[Alert] = []
    for a in alerts:
        if a.tipo in seen:
            continue
        seen.add(a.tipo)
        out.append(a)
    return out
