import logging
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)

_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.yaml"

_DEFAULTS = {
    "whisper": {
        "engine": "faster-whisper",
        "model_size": "small",
        "device": "cpu",
        "compute_type": "int8",
        "mlx_model": "mlx-community/whisper-small",
    },
    "transcription": {
        "beam_size": 1,
        "best_of": 1,
        "vad_filter": True,
    },
    "vad": {
        "threshold": 0.15,
        "min_speech_ms": 250,
        "silence_duration_ms": 500,
        "max_segment_s": 15,
        "interim_interval_s": 0.5,
    },
    "translation": {
        "model": "OpenNMT/nllb-200-distilled-1.3B-ct2-int8",
        "tokenizer": "facebook/nllb-200-distilled-1.3B",
        "device": "cpu",
        "compute_type": "int8",
        "inter_threads": 1,
        "intra_threads": 4,
        "beam_size": 2,
        "max_decoding_length": 256,
    },
    "languages": ["en", "ja", "vi"],
}

_config = None


def _deep_merge(defaults: dict, overrides: dict) -> dict:
    """Merge overrides into defaults, keeping defaults for missing keys."""
    result = dict(defaults)
    for key, val in overrides.items():
        if key in result and isinstance(result[key], dict) and isinstance(val, dict):
            result[key] = _deep_merge(result[key], val)
        else:
            result[key] = val
    return result


def get_config() -> dict:
    global _config
    if _config is not None:
        return _config

    if _CONFIG_PATH.exists():
        with open(_CONFIG_PATH) as f:
            file_config = yaml.safe_load(f) or {}
        _config = _deep_merge(_DEFAULTS, file_config)
        logger.info(f"Loaded config from {_CONFIG_PATH}")
    else:
        _config = dict(_DEFAULTS)
        logger.warning(f"Config file not found at {_CONFIG_PATH}, using defaults")

    logger.info(f"Config: whisper={_config['whisper']}, languages={_config['languages']}")
    return _config
