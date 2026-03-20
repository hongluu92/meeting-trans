import asyncio
import logging
import time

import numpy as np

from .config import get_config
from .model_loader import get_engine, get_mlx_model_path, get_model

logger = logging.getLogger(__name__)


def _is_hallucination(text: str) -> bool:
    """Detect Whisper hallucination patterns (repetitive garbage text)."""
    text = text.strip()
    if not text:
        return False

    # Split into words and check for excessive repetition
    words = text.split()
    if len(words) < 3:
        return False

    # Check if a single word/phrase repeats more than 60% of the time
    from collections import Counter
    counts = Counter(words)
    most_common_word, most_common_count = counts.most_common(1)[0]
    if most_common_count / len(words) > 0.6 and len(words) >= 4:
        logger.debug(f"[STT] hallucination detected (repetition): '{text[:80]}...'")
        return True

    # Check for repeating bigram patterns
    if len(words) >= 6:
        bigrams = [f"{words[i]} {words[i+1]}" for i in range(len(words) - 1)]
        bigram_counts = Counter(bigrams)
        top_bigram, top_count = bigram_counts.most_common(1)[0]
        if top_count / len(bigrams) > 0.5:
            logger.debug(f"[STT] hallucination detected (bigram): '{text[:80]}...'")
            return True

    return False

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

        if _is_hallucination(source_text):
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
