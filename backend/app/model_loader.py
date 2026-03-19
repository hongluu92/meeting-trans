import logging
import threading

from .config import get_config

logger = logging.getLogger(__name__)

_model = None
_model_loading = False
_model_loaded = False
_lock = threading.Lock()


def get_model_status() -> dict:
    return {
        "model_loaded": _model_loaded,
        "model_loading": _model_loading,
    }


def load_model():
    global _model, _model_loading, _model_loaded

    if _model is not None:
        return _model

    with _lock:
        if _model is not None:
            return _model

        cfg = get_config()["whisper"]
        model_size = cfg["model_size"]
        device = cfg["device"]
        compute_type = cfg["compute_type"]

        _model_loading = True
        logger.info(
            f"Loading faster-whisper model={model_size}, "
            f"device={device}, compute_type={compute_type}"
        )

        try:
            from faster_whisper import WhisperModel

            _model = WhisperModel(model_size, device=device, compute_type=compute_type)

            _model_loaded = True
            _model_loading = False
            logger.info("Whisper model loaded successfully")
            return _model

        except Exception as e:
            _model_loading = False
            logger.error(f"Failed to load model: {e}")
            raise


def get_model() -> "WhisperModel":
    if _model is None:
        raise RuntimeError("Model not loaded. Call load_model() first.")
    return _model
