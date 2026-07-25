"""Verificación del cultivo — ¿el lote está realmente sembrado?

Parte del módulo para bancos: antes de dar el crédito, confirmar que en la
parcela hay un cultivo activo y no suelo desnudo, un potrero o un bosque que
el solicitante presenta como lote de siembra. No identifica la especie; sí
distingue el *patrón* de uso del suelo a partir de la firma temporal de NDVI.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np

from .series import Series


@dataclass
class CropCheck:
    is_cultivated: bool
    pattern: str        # cultivo_activo | vegetacion_permanente | suelo_desnudo | mixto
    label: str          # etiqueta legible en español
    confidence: float   # 0..1
    detail: str
    features: dict

    def to_dict(self) -> dict:
        return asdict(self)


def verify_crop(ndvi: Series) -> CropCheck:
    """Clasifica el patrón de uso del suelo desde la serie de NDVI.

    La lógica se apoya en tres números robustos de la serie:

        pico      NDVI alto en la mejor parte del ciclo -> hay vegetación densa
        valle     NDVI bajo entre ciclos -> el suelo se ve (típico de cultivo)
        amplitud  pico - valle -> qué tan marcado es el ciclo de siembra

    - Cultivo activo:      pico alto + amplitud alta (crece y se cosecha).
    - Vegetación permanente: pico alto + amplitud baja (bosque/potrero, verde
      todo el año, sin cosecha).
    - Suelo desnudo:       pico bajo (nunca desarrolla biomasa).
    """
    v = ndvi.values
    if v.size < 4:
        return CropCheck(
            is_cultivated=False,
            pattern="sin_datos",
            label="Sin datos suficientes",
            confidence=0.0,
            detail="No hay suficientes observaciones para verificar el uso del suelo.",
            features={"n_observaciones": int(v.size)},
        )

    pico = float(np.percentile(v, 90))
    valle = float(np.percentile(v, 10))
    amplitud = pico - valle
    features = {
        "ndvi_pico": round(pico, 3),
        "ndvi_valle": round(valle, 3),
        "amplitud": round(amplitud, 3),
    }

    if pico < 0.35:
        return CropCheck(
            is_cultivated=False,
            pattern="suelo_desnudo",
            label="Suelo desnudo o sin vegetación",
            confidence=round(_conf(0.35 - pico, 0.15), 2),
            detail=(
                f"El NDVI nunca supera {pico:.2f}: la parcela no desarrolla la "
                "biomasa de un cultivo. Verificar la solicitud."
            ),
            features=features,
        )

    if amplitud >= 0.30:
        return CropCheck(
            is_cultivated=True,
            pattern="cultivo_activo",
            label="Cultivo activo",
            confidence=round(_conf(amplitud - 0.30, 0.25) * 0.5 + 0.5, 2),
            detail=(
                f"Ciclo marcado de siembra y cosecha (NDVI oscila entre {valle:.2f} "
                f"y {pico:.2f}): consistente con un lote en producción."
            ),
            features=features,
        )

    if pico >= 0.6 and amplitud < 0.20:
        return CropCheck(
            is_cultivated=False,
            pattern="vegetacion_permanente",
            label="Vegetación permanente (bosque/potrero)",
            confidence=round(_conf(0.20 - amplitud, 0.15) * 0.5 + 0.5, 2),
            detail=(
                f"Verde alto y estable todo el año (NDVI ~{pico:.2f}, sin ciclo de "
                "cosecha): parece cobertura permanente, no un cultivo de siembra."
            ),
            features=features,
        )

    return CropCheck(
        is_cultivated=True,
        pattern="mixto",
        label="Patrón mixto / cultivo incipiente",
        confidence=0.4,
        detail=(
            f"Señal intermedia (pico {pico:.2f}, amplitud {amplitud:.2f}): podría ser "
            "un cultivo en desarrollo o un lote parcialmente sembrado."
        ),
        features=features,
    )


def _conf(margin: float, scale: float) -> float:
    """Confianza [0..1] a partir de cuánto se supera un umbral."""
    return float(max(0.0, min(1.0, margin / scale)))
