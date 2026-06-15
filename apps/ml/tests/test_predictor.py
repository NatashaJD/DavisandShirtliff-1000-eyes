"""
Unit tests for the ML predictor module.
Requirements: 10.1, 10.2
"""

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.ml.predictor import PredictionRequest, _heuristic_predict, score_to_label


class TestScoreToLabel:
    def test_critical_threshold(self) -> None:
        assert score_to_label(0.75) == "Critical"
        assert score_to_label(1.0) == "Critical"

    def test_high_threshold(self) -> None:
        assert score_to_label(0.50) == "High"
        assert score_to_label(0.74) == "High"

    def test_medium_threshold(self) -> None:
        assert score_to_label(0.25) == "Medium"
        assert score_to_label(0.49) == "Medium"

    def test_low_threshold(self) -> None:
        assert score_to_label(0.0) == "Low"
        assert score_to_label(0.24) == "Low"


class TestHeuristicPredict:
    def _make_request(self, **kwargs: object) -> PredictionRequest:
        defaults: dict[str, object] = {
            "requestId": "00000000-0000-0000-0000-000000000001",
            "currentStage": "Inquiry",
            "elapsedHours": 2.0,
            "historicalAvgCompletionHours": 8.0,
            "deptBacklogCount": 5,
            "priorSlaWarningCount": 0,
            "dayOfWeek": 1,
            "hourOfDay": 10,
        }
        defaults.update(kwargs)
        return PredictionRequest(**defaults)  # type: ignore[arg-type]

    def test_risk_score_in_range(self) -> None:
        result = _heuristic_predict(self._make_request())
        assert 0.0 <= result.riskScore <= 1.0

    def test_label_consistent_with_score(self) -> None:
        result = _heuristic_predict(self._make_request())
        assert result.riskLabel == score_to_label(result.riskScore)

    def test_contributing_factors_non_empty(self) -> None:
        result = _heuristic_predict(self._make_request())
        assert len(result.contributingFactors) >= 1
        assert len(result.contributingFactors) <= 5

    def test_zero_historical_avg_does_not_crash(self) -> None:
        result = _heuristic_predict(self._make_request(historicalAvgCompletionHours=0.0))
        assert result.riskScore >= 0.0

    def test_high_elapsed_produces_higher_risk(self) -> None:
        low_risk = _heuristic_predict(self._make_request(elapsedHours=1.0, historicalAvgCompletionHours=8.0))
        high_risk = _heuristic_predict(self._make_request(elapsedHours=20.0, historicalAvgCompletionHours=8.0))
        assert high_risk.riskScore > low_risk.riskScore


# Feature: dayliff-1000-eyes, Property 13: Risk Score Label Consistency
@given(
    risk_score=st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False),
)
@settings(max_examples=200)
def test_score_to_label_coverage(risk_score: float) -> None:
    """
    For arbitrary risk scores in [0, 1], assert the label is exactly
    Low/Medium/High/Critical per defined thresholds.
    Validates: Requirements 10.1
    """
    label = score_to_label(risk_score)
    assert label in ("Low", "Medium", "High", "Critical")

    if risk_score >= 0.75:
        assert label == "Critical"
    elif risk_score >= 0.50:
        assert label == "High"
    elif risk_score >= 0.25:
        assert label == "Medium"
    else:
        assert label == "Low"
