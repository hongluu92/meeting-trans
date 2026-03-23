import asyncio
import logging
import threading

import numpy as np

from .config import get_config
from .model_loader import get_engine, get_mlx_model_path, get_model

logger = logging.getLogger(__name__)


def _is_hallucination(text: str) -> bool:
    """Detect Whisper hallucination patterns (repetitive garbage text).

    Handles both space-separated languages (EN, VI) and CJK languages (JA, KO)
    where words are not separated by spaces.
    """
    import re
    from collections import Counter

    text = text.strip()
    if not text:
        return False

    # --- CJK substring repetition (Japanese, Korean, Chinese) ---
    # Find shortest repeating substring that covers most of the text
    # e.g. "ちょっとちょっとちょっと" → pattern "ちょっと" repeats 3x
    for pat_len in range(1, min(20, len(text) // 2 + 1)):
        pattern = text[:pat_len]
        count = text.count(pattern)
        if count >= 4 and (count * pat_len) / len(text) > 0.5:
            logger.debug(f"[STT] hallucination detected (substring repeat): '{text[:80]}...'")
            return True

    # --- Space-separated word repetition (EN, VI, etc.) ---
    words = text.split()
    if len(words) >= 4:
        counts = Counter(words)
        _, most_common_count = counts.most_common(1)[0]
        if most_common_count / len(words) > 0.6:
            logger.debug(f"[STT] hallucination detected (word repeat): '{text[:80]}...'")
            return True

    # Check for repeating bigram patterns
    if len(words) >= 6:
        bigrams = [f"{words[i]} {words[i+1]}" for i in range(len(words) - 1)]
        bigram_counts = Counter(bigrams)
        _, top_count = bigram_counts.most_common(1)[0]
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

# Our short codes -> NLLB FLORES-200 codes
NLLB_LANG_MAP = {
    "en": "eng_Latn",
    "ja": "jpn_Jpan",
    "vi": "vie_Latn",
    "ko": "kor_Hang",
}


def get_lang_map() -> dict[str, str]:
    """Build LANG_MAP from config."""
    return {lang: lang for lang in get_config()["languages"]}


# Module-level alias for backward compat (used by websocket_handler)
LANG_MAP = get_lang_map()


# --- NLLB lazy-loaded globals ---
_nllb_translator = None
_nllb_tokenizer = None
_nllb_lock = threading.Lock()


def preload_nllb():
    """Download and load NLLB model at startup. Called from lifespan."""
    _get_nllb()


def _get_nllb():
    """Lazy-load NLLB translator and tokenizer. Thread-safe, loads once."""
    global _nllb_translator, _nllb_tokenizer
    if _nllb_translator is not None:
        return _nllb_translator, _nllb_tokenizer

    with _nllb_lock:
        if _nllb_translator is not None:
            return _nllb_translator, _nllb_tokenizer

        cfg = get_config()["translation"]
        logger.info(f"[NLLB] Downloading/loading model: {cfg['model']}")

        from huggingface_hub import snapshot_download
        import ctranslate2
        import transformers

        model_dir = snapshot_download(cfg["model"])

        _nllb_translator = ctranslate2.Translator(
            model_dir,
            device=cfg["device"],
            compute_type=cfg["compute_type"],
            inter_threads=cfg["inter_threads"],
            intra_threads=cfg["intra_threads"],
        )

        _nllb_tokenizer = transformers.AutoTokenizer.from_pretrained(
            cfg["tokenizer"]
        )

        logger.info("[NLLB] Model and tokenizer loaded")
        return _nllb_translator, _nllb_tokenizer


async def transcribe_audio(
    audio_tensor, source_lang: str = "auto", is_interim: bool = False
):
    """Transcribe audio to text. Returns dict with source_text, source_lang, or None if no speech.

    Args:
        audio_tensor: Audio data as torch tensor.
        source_lang: Language code or "auto" for detection.
        is_interim: If True, use fast greedy decoding (beam_size=1) for partials.
    """

    def _run():
        engine = get_engine()
        cfg = get_config()["transcription"]
        audio_np = audio_tensor.numpy().astype(np.float32)

        # Use greedy decoding for interim (speed), full beam search for final (quality)
        beam_size = 1 if is_interim else cfg["beam_size"]
        best_of = 1 if is_interim else cfg["best_of"]

        if engine == "mlx":
            import mlx_whisper

            mlx_kwargs = {
                "path_or_hf_repo": get_mlx_model_path(),
                "beam_size": beam_size,
                "best_of": best_of,
                "compression_ratio_threshold": cfg.get("compression_ratio_threshold", 2.4),
                "no_speech_threshold": cfg.get("no_speech_threshold", 0.6),
                "logprob_threshold": cfg.get("log_prob_threshold", -1.0),
            }
            if source_lang != "auto":
                mlx_kwargs["language"] = source_lang
            result = mlx_whisper.transcribe(audio_np, **mlx_kwargs)
            source_text = result.get("text", "").strip()
            raw_lang = result.get("language", "en")
            detected_lang = WHISPER_LANG_MAP.get(raw_lang, raw_lang)
        else:
            model = get_model()
            transcribe_kwargs = {
                "beam_size": beam_size,
                "best_of": best_of,
                "vad_filter": cfg["vad_filter"],
                "no_speech_threshold": cfg.get("no_speech_threshold", 0.6),
                "compression_ratio_threshold": cfg.get("compression_ratio_threshold", 2.4),
                "log_prob_threshold": cfg.get("log_prob_threshold", -1.0),
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


async def translate_text(text: str, target_lang: str, source_lang: str = "en") -> str:
    """Translate text using offline NLLB model via CTranslate2."""

    def _run():
        src_code = NLLB_LANG_MAP.get(source_lang)
        tgt_code = NLLB_LANG_MAP.get(target_lang)
        if not src_code or not tgt_code:
            logger.warning(f"[NLLB] Unsupported lang pair: {source_lang}->{target_lang}")
            return text

        translator, tokenizer = _get_nllb()
        cfg = get_config()["translation"]

        # Set source language (stateful on tokenizer)
        tokenizer.src_lang = src_code
        tokens = tokenizer.convert_ids_to_tokens(tokenizer.encode(text))

        results = translator.translate_batch(
            [tokens],
            target_prefix=[[tgt_code]],
            max_decoding_length=cfg["max_decoding_length"],
            beam_size=cfg["beam_size"],
        )

        # Skip first token (target lang tag)
        output_tokens = results[0].hypotheses[0][1:]
        return tokenizer.decode(
            tokenizer.convert_tokens_to_ids(output_tokens),
            skip_special_tokens=True,
        )

    try:
        return await asyncio.to_thread(_run)
    except Exception as e:
        logger.error(f"[NLLB] Translation failed: {e}")
        return text
