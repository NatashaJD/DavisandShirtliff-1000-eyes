"""
Dayliff 1000 Eyes — ML Prediction Microservice
Entry point for the Python FastAPI application.
"""

import uvicorn

from app.api import create_app

app = create_app()

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, log_level="info")
