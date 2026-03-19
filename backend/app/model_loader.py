import logging
import threading

import torch

logger = logging.getLogger(__name__)

_translator = None
_model_loading = False
_model_loaded = False
_lock = threading.Lock()


def get_model_status() -> dict:
    return {
        "model_loaded": _model_loaded,
        "model_loading": _model_loading,
    }


def load_translator():
    global _translator, _model_loading, _model_loaded

    if _translator is not None:
        return _translator

    with _lock:
        # Double-check after acquiring lock
        if _translator is not None:
            return _translator

        _model_loading = True
        logger.info("Loading SeamlessM4T v2 model...")

        try:
            from seamless_communication.inference import Translator

            device = torch.device("cpu")
            dtype = torch.float32  # CPU requires float32; float16 only on CUDA

            if torch.cuda.is_available():
                device = torch.device("cuda:0")
                dtype = torch.float16

            _translator = Translator(
                model_name_or_card="seamlessM4T_v2_large",
                vocoder_name_or_card="vocoder_v2",
                device=device,
                dtype=dtype,
            )

            _model_loaded = True
            _model_loading = False
            logger.info("SeamlessM4T v2 model loaded successfully")
            return _translator

        except Exception as e:
            _model_loading = False
            logger.error(f"Failed to load model: {e}")
            raise


def get_translator():
    if _translator is None:
        raise RuntimeError("Model not loaded. Call load_translator() first.")
    return _translator
