"""FastAPI application factory."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import health, predict


def create_app() -> FastAPI:
    app = FastAPI(
        title="Dayliff 1000 Eyes — ML Service",
        description="Level 1 Predictive Analytics microservice",
        version="1.0.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(predict.router, prefix="/internal")

    return app
