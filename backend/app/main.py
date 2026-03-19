import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from .model_loader import get_model_status, load_translator
from .websocket_handler import handle_websocket

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting model loading in background...")
    asyncio.create_task(asyncio.to_thread(load_translator))
    yield


app = FastAPI(title="STT Translator", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/status")
async def status():
    return get_model_status()


@app.websocket("/ws/translate")
async def websocket_translate(ws: WebSocket):
    await handle_websocket(ws)
