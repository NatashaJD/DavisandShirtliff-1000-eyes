"""
/internal/predict endpoint
Requirements: 10.1, 10.2
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..ml.predictor import PredictionRequest, PredictionResult, predict_batch

router = APIRouter(tags=["prediction"])


class BatchPredictRequest(BaseModel):
    requests: list[PredictionRequest] = Field(..., min_length=1)


class BatchPredictResponse(BaseModel):
    results: list[PredictionResult]


@router.post("/predict", response_model=BatchPredictResponse)
async def predict_endpoint(body: BatchPredictRequest) -> BatchPredictResponse:
    results = predict_batch(body.requests)
    return BatchPredictResponse(results=results)
