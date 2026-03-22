import asyncio
import logging
import warnings
from contextlib import asynccontextmanager

# Suppress semaphore leak warning from torch/silero-vad multiprocessing
warnings.filterwarnings("ignore", message="resource_tracker.*semaphore", module="multiprocessing")

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from .config import get_config
from .model_loader import get_model_status, load_model
from .translator import preload_nllb
from .websocket_handler import handle_websocket

logging.basicConfig(level=logging.WARNING)
# Enable INFO logs for our app modules
logging.getLogger("app").setLevel(logging.INFO)
logger = logging.getLogger(__name__)


class _FilterStatusPoll(logging.Filter):
    """Suppress repetitive /api/status access logs."""

    def filter(self, record: logging.LogRecord) -> bool:
        return "/api/status" not in record.getMessage()


logging.getLogger("uvicorn.access").addFilter(_FilterStatusPoll())


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting model loading in background...")
    asyncio.create_task(asyncio.to_thread(load_model))
    asyncio.create_task(asyncio.to_thread(preload_nllb))
    yield


app = FastAPI(title="STT Translator", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/status")
async def status():
    cfg = get_config()
    return {
        **get_model_status(),
        "whisper": cfg["whisper"],
        "languages": cfg["languages"],
    }


@app.websocket("/ws/translate")
async def websocket_translate(ws: WebSocket):
    await handle_websocket(ws)
