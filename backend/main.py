import os
import logging
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pymongo.errors import PyMongoError
from services.llm import ModelError
from routes.inspection import router as inspection_router
from routes.chat import router as chat_router
from routes.session import router as session_router

ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../.env')
load_dotenv(dotenv_path=ENV_PATH, override=False)
run_logger = logging.getLogger("focalpoint.runs")
run_logger.setLevel(logging.INFO)
if not run_logger.handlers:
    run_logger.addHandler(logging.StreamHandler())
run_logger.propagate = False

app = FastAPI(title="FocalPoint API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("FRONTEND_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(session_router)
app.include_router(inspection_router)


@app.exception_handler(ModelError)
def model_error(request, error):
    return JSONResponse(status_code=502, content={"detail": str(error)})


@app.exception_handler(KeyError)
def missing_error(request, error):
    return JSONResponse(status_code=404, content={"detail": str(error)})


@app.exception_handler(ValueError)
def contract_error(request, error):
    return JSONResponse(status_code=409, content={"detail": str(error)})


@app.exception_handler(PyMongoError)
def database_error(request, error):
    return JSONResponse(status_code=503, content={"detail": f"Database {type(error).__name__}: {error}"})


@app.exception_handler(RuntimeError)
def runtime_error(request, error):
    return JSONResponse(status_code=500, content={"detail": str(error)})

@app.get("/health")
def health():
    return {"status": "ok"}
