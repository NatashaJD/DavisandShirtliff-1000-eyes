"""Health check endpoint."""

from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    timestamp: str
    model_loaded: bool


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    from ..ml.model import get_model_registry

    registry = get_model_registry()
    return HealthResponse(
        status="ok",
        timestamp=datetime.now(tz=timezone.utc).isoformat(),
        model_loaded=registry.is_loaded(),
    )
