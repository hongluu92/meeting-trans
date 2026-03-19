import asyncio
import logging
import time

import numpy as np

from .config import get_config
from .model_loader import get_engine, get_mlx_model_path, get_model

logger = logging.getLogger(__name__)

# faster-whisper language codes -> our short codes
WHISPER_LANG_MAP = {
    "en": "en",
    "english": "en",
    "ja": "ja",
    "japanese": "ja",
    "vi": "vi",
    "vietnamese": "vi",
    "ko": "ko",
    "korean": "ko",
}


def get_lang_map() -> dict[str, str]:
    """Build LANG_MAP from config."""
    return {lang: lang for lang in get_config()["languages"]}


# Module-level alias for backward compat (used by websocket_handler)
LANG_MAP = get_lang_map()


async def transcribe_audio(
    audio_tensor, source_lang: str = "auto"
) -> dict | None:
    """Transcribe audio to text. Returns dict with source_text, source_lang, or None if no speech."""

    def _run():
        engine = get_engine()
        cfg = get_config()["transcription"]
        audio_np = audio_tensor.numpy().astype(np.float32)

        if engine == "mlx":
            import mlx_whisper

            mlx_kwargs = {"path_or_hf_repo": get_mlx_model_path()}
            if source_lang != "auto":
                mlx_kwargs["language"] = source_lang
            result = mlx_whisper.transcribe(audio_np, **mlx_kwargs)
            source_text = result.get("text", "").strip()
            raw_lang = result.get("language", "en")
            detected_lang = WHISPER_LANG_MAP.get(raw_lang, raw_lang)
        else:
            model = get_model()
            transcribe_kwargs = {
                "beam_size": cfg["beam_size"],
                "best_of": cfg["best_of"],
                "vad_filter": cfg["vad_filter"],
            }
            if source_lang != "auto":
                transcribe_kwargs["language"] = source_lang
            segments, info = model.transcribe(audio_np, **transcribe_kwargs)
            source_text = " ".join(seg.text.strip() for seg in segments)
            detected_lang = WHISPER_LANG_MAP.get(info.language, info.language)

        if not source_text.strip():
            return None

        return {"source_text": source_text, "source_lang": detected_lang}

    return await asyncio.to_thread(_run)


async def translate_text(text: str, target_lang: str) -> str:
    """Translate text to target language using Google Translate."""

    def _run():
        from deep_translator import GoogleTranslator

        return GoogleTranslator(source="auto", target=target_lang).translate(text)

    try:
        return await asyncio.to_thread(_run)
    except Exception as e:
        logger.error(f"[Translator] translation failed: {e}")
        return text
