"""
Model registry — loads XGBoost model artifacts from disk.
Supports hot-swap via blue/green model loading.
"""

import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_MODEL_DIR = Path(__file__).parent.parent.parent / "models"

_registry: "ModelRegistry | None" = None


class ModelRegistry:
    """Holds the active risk and delay prediction models."""

    def __init__(self) -> None:
        self._risk_model: Any = None
        self._delay_model: Any = None
        self._loaded = False

    def load(self) -> None:
        """Attempt to load model artifacts from disk. Falls back to a dummy model."""
        try:
            import joblib  # type: ignore[import-untyped]

            risk_path = _MODEL_DIR / "risk_model.joblib"
            delay_path = _MODEL_DIR / "delay_model.joblib"

            if risk_path.exists() and delay_path.exists():
                self._risk_model = joblib.load(risk_path)
                self._delay_model = joblib.load(delay_path)
                self._loaded = True
                logger.info("ML models loaded from %s", _MODEL_DIR)
            else:
                logger.warning(
                    "Model artifacts not found at %s — using heuristic fallback", _MODEL_DIR
                )
                self._loaded = False
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to load models: %s — using heuristic fallback", exc)
            self._loaded = False

    def is_loaded(self) -> bool:
        return self._loaded

    @property
    def risk_model(self) -> Any:
        return self._risk_model

    @property
    def delay_model(self) -> Any:
        return self._delay_model


def get_model_registry() -> ModelRegistry:
    global _registry
    if _registry is None:
        _registry = ModelRegistry()
        _registry.load()
    return _registry
