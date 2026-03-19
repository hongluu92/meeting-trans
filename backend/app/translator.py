import asyncio
import logging
import time

import numpy as np

from .config import get_config
from .model_loader import get_model

logger = logging.getLogger(__name__)

# faster-whisper language codes -> our short codes
WHISPER_LANG_MAP = {
    "en": "en",
    "english": "en",
    "ja": "ja",
    "japanese": "ja",
    "vi": "vi",
    "vietnamese": "vi",
}


def get_lang_map() -> dict[str, str]:
    """Build LANG_MAP from config."""
    return {lang: lang for lang in get_config()["languages"]}


# Module-level alias for backward compat (used by websocket_handler)
LANG_MAP = get_lang_map()


async def translate_audio(audio_tensor, target_lang: str, source_lang: str = "auto") -> dict:
    """Transcribe with faster-whisper, translate with Google Translate."""

    def _run():
        start = time.time()
        model = get_model()
        cfg = get_config()["transcription"]

        # Convert torch tensor to numpy
        audio_np = audio_tensor.numpy().astype(np.float32)
        logger.info(
            f"[Translator] start, source={source_lang}, target={target_lang}, "
            f"samples={len(audio_np)}"
        )

        # STT with faster-whisper
        t0 = time.time()
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
        logger.info(
            f"[Translator] STT ({int((time.time()-t0)*1000)}ms): "
            f"lang={info.language}({info.language_probability:.2f}) "
            f"text='{source_text[:80]}'"
        )

        if not source_text.strip():
            return {"status": "no_speech"}

        # Translate if source != target
        translated_text = source_text
        if detected_lang != target_lang:
            t1 = time.time()
            try:
                from deep_translator import GoogleTranslator

                translated_text = GoogleTranslator(
                    source="auto",
                    target=target_lang,
                ).translate(source_text)
                logger.info(
                    f"[Translator] translate ({int((time.time()-t1)*1000)}ms): "
                    f"'{translated_text[:80]}'"
                )
            except Exception as e:
                logger.error(f"[Translator] translation failed: {e}")
                translated_text = source_text

        duration_ms = int((time.time() - start) * 1000)
        logger.info(f"[Translator] done in {duration_ms}ms")

        return {
            "source_lang": detected_lang,
            "source_text": source_text,
            "target_lang": target_lang,
            "translated_text": translated_text,
            "duration_ms": duration_ms,
            "timestamp": int(time.time() * 1000),
        }

    return await asyncio.to_thread(_run)
