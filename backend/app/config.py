import logging
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)

_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.yaml"

_DEFAULTS = {
    "whisper": {
        "model_size": "small",
        "device": "cpu",
        "compute_type": "int8",
    },
    "transcription": {
        "beam_size": 1,
        "best_of": 1,
        "vad_filter": True,
    },
    "vad": {
        "threshold": 0.15,
        "min_speech_ms": 250,
    },
    "languages": ["en", "ja", "vi"],
}

_config: dict | None = None


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
