"""
Prediction logic for risk assessment and delay forecasting.
Requirements: 10.1, 10.2
"""

from datetime import datetime, timedelta, timezone
from typing import Literal

import numpy as np
from pydantic import BaseModel, Field

from .model import get_model_registry

RiskLabelType = Literal["Low", "Medium", "High", "Critical"]

# Risk label thresholds: Low [0,0.25), Medium [0.25,0.50), High [0.50,0.75), Critical [0.75,1.0]
_RISK_THRESHOLDS: list[tuple[float, RiskLabelType]] = [
    (0.75, "Critical"),
    (0.50, "High"),
    (0.25, "Medium"),
    (0.0, "Low"),
]


def score_to_label(score: float) -> RiskLabelType:
    """Convert a continuous risk score [0,1] to a discrete label."""
    for threshold, label in _RISK_THRESHOLDS:
        if score >= threshold:
            return label
    return "Low"


class ContributingFactor(BaseModel):
    factor: str
    influence: float


class PredictionRequest(BaseModel):
    requestId: str = Field(..., description="UUID of the service request")
    currentStage: str
    elapsedHours: float = Field(..., ge=0)
    historicalAvgCompletionHours: float = Field(..., ge=0)
    deptBacklogCount: int = Field(..., ge=0)
    priorSlaWarningCount: int = Field(..., ge=0)
    dayOfWeek: int = Field(..., ge=0, le=6)
    hourOfDay: int = Field(..., ge=0, le=23)


class PredictionResult(BaseModel):
    requestId: str
    riskScore: float = Field(..., ge=0.0, le=1.0)
    riskLabel: RiskLabelType
    contributingFactors: list[ContributingFactor] = Field(..., min_length=1, max_length=5)
    predictedDelayHours: float | None = Field(None, ge=0, le=8760)
    delayConfidence: float | None = Field(None, ge=0.0, le=1.0)
    predictedCompletionAt: str | None


def _heuristic_predict(req: PredictionRequest) -> PredictionResult:
    """
    Deterministic heuristic fallback used when the XGBoost model is not loaded.
    Produces plausible output for all inputs without requiring trained artifacts.
    """
    # Normalise elapsed vs historical to compute a simple risk proxy
    if req.historicalAvgCompletionHours > 0:
        ratio = req.elapsedHours / req.historicalAvgCompletionHours
    else:
        ratio = 0.0

    backlog_factor = min(req.deptBacklogCount / 50.0, 1.0)
    warning_factor = min(req.priorSlaWarningCount / 3.0, 1.0)

    raw_score = (ratio * 0.5) + (backlog_factor * 0.3) + (warning_factor * 0.2)
    risk_score = float(np.clip(raw_score, 0.0, 1.0))
    risk_label = score_to_label(risk_score)

    factors = [
        ContributingFactor(factor="elapsed_time_ratio", influence=round(ratio * 0.5, 3)),
        ContributingFactor(factor="dept_backlog", influence=round(backlog_factor * 0.3, 3)),
        ContributingFactor(
            factor="prior_sla_warnings", influence=round(warning_factor * 0.2, 3)
        ),
    ]
    # Sort descending by influence; keep at most 5
    factors.sort(key=lambda f: f.influence, reverse=True)
    factors = factors[:5]
    if not factors:
        factors = [ContributingFactor(factor="elapsed_time_ratio", influence=0.0)]

    predicted_delay = max(0.0, (ratio - 1.0) * req.historicalAvgCompletionHours) if ratio > 1 else None
    confidence = float(np.clip(1.0 - abs(risk_score - 0.5), 0.5, 0.95)) if predicted_delay is not None else None

    predicted_completion_at: str | None = None
    if predicted_delay is not None:
        eta = datetime.now(tz=timezone.utc) + timedelta(hours=predicted_delay)
        predicted_completion_at = eta.isoformat()

    return PredictionResult(
        requestId=req.requestId,
        riskScore=round(risk_score, 3),
        riskLabel=risk_label,
        contributingFactors=factors,
        predictedDelayHours=round(predicted_delay, 2) if predicted_delay is not None else None,
        delayConfidence=round(confidence, 3) if confidence is not None else None,
        predictedCompletionAt=predicted_completion_at,
    )


def predict_batch(requests: list[PredictionRequest]) -> list[PredictionResult]:
    """
    Run batch prediction. Uses trained XGBoost models when available;
    falls back to the heuristic predictor otherwise.
    """
    registry = get_model_registry()

    if not registry.is_loaded():
        return [_heuristic_predict(req) for req in requests]

    # Build feature matrix
    feature_vectors = np.array(
        [
            [
                req.elapsedHours,
                req.historicalAvgCompletionHours,
                req.deptBacklogCount,
                req.priorSlaWarningCount,
                req.dayOfWeek,
                req.hourOfDay,
            ]
            for req in requests
        ],
        dtype=float,
    )

    risk_scores = registry.risk_model.predict_proba(feature_vectors)[:, 1]
    delay_hours = registry.delay_model.predict(feature_vectors)

    results: list[PredictionResult] = []
    for i, req in enumerate(requests):
        score = float(np.clip(risk_scores[i], 0.0, 1.0))
        delay = float(np.clip(delay_hours[i], 0.0, 8760.0))

        # Build contributing factors from feature importances if available
        try:
            importances = registry.risk_model.feature_importances_
            feature_names = [
                "elapsed_hours",
                "historical_avg_hours",
                "dept_backlog",
                "prior_sla_warnings",
                "day_of_week",
                "hour_of_day",
            ]
            factors = sorted(
                [
                    ContributingFactor(factor=name, influence=float(imp))
                    for name, imp in zip(feature_names, importances, strict=False)
                ],
                key=lambda f: f.influence,
                reverse=True,
            )[:5]
        except AttributeError:
            factors = [ContributingFactor(factor="model_score", influence=score)]

        eta: str | None = None
        if delay > 0:
            eta = (datetime.now(tz=timezone.utc) + timedelta(hours=delay)).isoformat()

        results.append(
            PredictionResult(
                requestId=req.requestId,
                riskScore=round(score, 3),
                riskLabel=score_to_label(score),
                contributingFactors=factors if factors else [ContributingFactor(factor="model_score", influence=score)],
                predictedDelayHours=round(delay, 2) if delay > 0 else None,
                delayConfidence=0.75,
                predictedCompletionAt=eta,
            )
        )

    return results
