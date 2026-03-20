import logging
import threading

import numpy as np

from .config import get_config

logger = logging.getLogger(__name__)

_model = None
_model_loading = False
_model_loaded = False
_lock = threading.Lock()

_engine = None
_mlx_model_path = None


def get_engine() -> str:
    global _engine
    if _engine is None:
        _engine = get_config()["whisper"].get("engine", "faster-whisper")
    return _engine


def get_mlx_model_path() -> str:
    global _mlx_model_path
    if _mlx_model_path is None:
        _mlx_model_path = get_config()["whisper"].get(
            "mlx_model", "mlx-community/whisper-small"
        )
    return _mlx_model_path


def get_model_status() -> dict:
    return {
        "model_loaded": _model_loaded,
        "model_loading": _model_loading,
    }


def load_model():
    global _model, _model_loading, _model_loaded

    if _model_loaded:
        return _model

    with _lock:
        if _model_loaded:
            return _model

        engine = get_engine()
        cfg = get_config()["whisper"]
        _model_loading = True

        try:
            if engine == "mlx":
                mlx_path = get_mlx_model_path()
                logger.info(f"Loading mlx-whisper model={mlx_path}")

                import mlx_whisper

                # Warmup: transcribe 1s of silence to cache the model
                silence = np.zeros(16000, dtype=np.float32)
                mlx_whisper.transcribe(
                    silence, path_or_hf_repo=mlx_path, language="en"
                )

                _model_loaded = True
                _model_loading = False
                logger.info("mlx-whisper model loaded successfully")
                return None
            else:
                model_size = cfg["model_size"]
                device = cfg["device"]
                compute_type = cfg["compute_type"]

                logger.info(
                    f"Loading faster-whisper model={model_size}, "
                    f"device={device}, compute_type={compute_type}"
                )

                from faster_whisper import WhisperModel

                _model = WhisperModel(
                    model_size, device=device, compute_type=compute_type
                )

                _model_loaded = True
                _model_loading = False
                logger.info("Whisper model loaded successfully")
                return _model

        except Exception as e:
            _model_loading = False
            logger.error(f"Failed to load model: {e}")
            raise


def get_model():
    if _model is None and get_engine() != "mlx":
        raise RuntimeError("Model not loaded. Call load_model() first.")
    return _model
