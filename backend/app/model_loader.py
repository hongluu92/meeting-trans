import logging
import threading

import numpy as np

from .config import get_config

logger = logging.getLogger(__name__)

_model = None
_model_loading = False
_model_loaded = False
_loading_step = ""  # current loading step description
_lock = threading.Lock()

_engine = None
_mlx_model_path = None
_gipformer = None
_gipformer_loaded = False
_gipformer_lock = threading.Lock()


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


def should_use_gipformer(source_lang: str) -> bool:
    cfg = get_config().get("gipformer", {})
    return bool(cfg.get("enabled_for_vietnamese", True) and source_lang == "vi")


def get_gipformer_status() -> dict:
    return {"gipformer_loaded": _gipformer_loaded}


def load_gipformer():
    global _gipformer, _gipformer_loaded

    if _gipformer_loaded:
        return _gipformer

    with _gipformer_lock:
        if _gipformer_loaded:
            return _gipformer

        cfg = get_config().get("gipformer", {})
        quantize = cfg.get("quantize", "int8")
        file_map = cfg.get("files", {}).get(quantize)
        if not file_map:
            raise ValueError(f"Unsupported gipformer quantize mode: {quantize}")

        logger.info(
            "Loading gipformer model repo=%s quantize=%s",
            cfg.get("repo_id"),
            quantize,
        )

        import sherpa_onnx
        from huggingface_hub import hf_hub_download

        model_paths = {
            key: hf_hub_download(repo_id=cfg["repo_id"], filename=filename)
            for key, filename in file_map.items()
        }
        model_paths["tokens"] = hf_hub_download(
            repo_id=cfg["repo_id"], filename="tokens.txt"
        )

        _gipformer = sherpa_onnx.OfflineRecognizer.from_transducer(
            encoder=model_paths["encoder"],
            decoder=model_paths["decoder"],
            joiner=model_paths["joiner"],
            tokens=model_paths["tokens"],
            num_threads=cfg.get("num_threads", 4),
            sample_rate=cfg.get("sample_rate", 16000),
            feature_dim=cfg.get("feature_dim", 80),
            decoding_method=cfg.get("decoding_method", "modified_beam_search"),
        )
        _gipformer_loaded = True
        logger.info("gipformer loaded successfully")
        return _gipformer


def set_loading_step(step: str):
    global _loading_step
    _loading_step = step


def get_model_status() -> dict:
    return {
        "model_loaded": _model_loaded,
        "model_loading": _model_loading,
        "loading_step": _loading_step,
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
