import asyncio
import logging
import time

import torch

from .model_loader import get_translator

logger = logging.getLogger(__name__)

# SeamlessM4T v2 uses ISO 639-3 language codes
LANG_MAP = {
    "en": "eng",
    "ja": "jpn",
    "vi": "vie",
}

LANG_REVERSE = {v: k for k, v in LANG_MAP.items()}

# All supported source languages for ASR attempts
SOURCE_LANGS = list(LANG_MAP.values())


async def translate_audio(audio_tensor: torch.Tensor, target_lang: str) -> dict:
    """Run SeamlessM4T v2 S2TT + language detection via ASR.

    Strategy: S2TT auto-detects source for translation. For source text,
    we run ASR with each candidate language and pick the longest result.
    """
    tgt_lang_code = LANG_MAP.get(target_lang, "eng")

    def _run():
        start = time.time()
        translator = get_translator()

        # S2TT: speech-to-text translation (auto-detects source internally)
        translated_text, _ = translator.predict(
            input=audio_tensor,
            task_str="S2TT",
            tgt_lang=tgt_lang_code,
        )
        translated_str = str(translated_text[0])

        # Detect source language by running ASR in each candidate language
        # Pick the result with most content (heuristic for correct language)
        best_source = ""
        best_lang = "eng"
        for lang_code in SOURCE_LANGS:
            if lang_code == tgt_lang_code:
                continue
            try:
                asr_text, _ = translator.predict(
                    input=audio_tensor,
                    task_str="ASR",
                    tgt_lang=lang_code,
                )
                asr_str = str(asr_text[0])
                if len(asr_str) > len(best_source):
                    best_source = asr_str
                    best_lang = lang_code
            except Exception:
                continue

        # Also try ASR in the target language (speaker might be speaking target lang)
        try:
            asr_text, _ = translator.predict(
                input=audio_tensor,
                task_str="ASR",
                tgt_lang=tgt_lang_code,
            )
            asr_str = str(asr_text[0])
            if len(asr_str) > len(best_source):
                best_source = asr_str
                best_lang = tgt_lang_code
        except Exception:
            pass

        duration_ms = int((time.time() - start) * 1000)

        return {
            "source_lang": LANG_REVERSE.get(best_lang, best_lang),
            "source_text": best_source,
            "target_lang": target_lang,
            "translated_text": translated_str,
            "duration_ms": duration_ms,
            "timestamp": int(time.time() * 1000),
        }

    return await asyncio.to_thread(_run)
