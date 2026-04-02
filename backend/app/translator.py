import asyncio
import logging
import unicodedata
import threading
from concurrent.futures import ThreadPoolExecutor

import numpy as np

from .config import get_config
from .model_loader import (
    get_engine,
    get_mlx_model_path,
    get_model,
    load_gipformer,
    should_use_gipformer,
)

logger = logging.getLogger(__name__)

# Separate thread pools so STT and translation run truly in parallel
_stt_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="stt")
_translate_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="nllb")

KNOWN_BAD_PHRASE_PARTS = (
    "hay subscribe cho kenh",
    "de khong bo lo nhung video hap dan",
)


def _normalize_for_match(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower()
    text = "".join(ch if ch.isalnum() or ch.isspace() else " " for ch in text)
    return " ".join(text.split())


def _is_hallucination(text: str) -> bool:
    """Detect Whisper hallucination patterns (repetitive garbage text).

    Handles both space-separated languages (EN, VI) and CJK languages (JA, KO)
    where words are not separated by spaces.
    """
    from collections import Counter

    text = text.strip()
    if not text:
        return False

    normalized = _normalize_for_match(text)
    if all(part in normalized for part in KNOWN_BAD_PHRASE_PARTS):
        logger.debug(f"[STT] hallucination detected (known bad phrase): '{text[:80]}...'")
        return True

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


def _transcribe_with_gipformer(audio_np: np.ndarray) -> dict[str, str] | None:
    recognizer = load_gipformer()
    stream = recognizer.create_stream()
    stream.accept_waveform(16000, audio_np)
    recognizer.decode_streams([stream])
    source_text = stream.result.text.strip()
    if not source_text:
        return None
    return {"source_text": source_text, "source_lang": "vi"}

# faster-whisper language codes -> our short codes
WHISPER_LANG_MAP = {
    "en": "en", "english": "en",
    "zh": "zh", "chinese": "zh",
    "ja": "ja", "japanese": "ja",
    "ko": "ko", "korean": "ko",
    "vi": "vi", "vietnamese": "vi",
    "es": "es", "spanish": "es",
    "fr": "fr", "french": "fr",
    "de": "de", "german": "de",
    "pt": "pt", "portuguese": "pt",
    "ru": "ru", "russian": "ru",
    "ar": "ar", "arabic": "ar",
    "hi": "hi", "hindi": "hi",
    "th": "th", "thai": "th",
    "id": "id", "indonesian": "id",
    "ms": "ms", "malay": "ms",
    "tl": "tl", "tagalog": "tl", "filipino": "tl",
    "it": "it", "italian": "it",
    "nl": "nl", "dutch": "nl",
    "pl": "pl", "polish": "pl",
    "tr": "tr", "turkish": "tr",
    "uk": "uk", "ukrainian": "uk",
    "sv": "sv", "swedish": "sv",
}

# Our short codes -> NLLB FLORES-200 codes
NLLB_LANG_MAP = {
    "en": "eng_Latn",
    "zh": "zho_Hans",
    "ja": "jpn_Jpan",
    "ko": "kor_Hang",
    "vi": "vie_Latn",
    "es": "spa_Latn",
    "fr": "fra_Latn",
    "de": "deu_Latn",
    "pt": "por_Latn",
    "ru": "rus_Cyrl",
    "ar": "arb_Arab",
    "hi": "hin_Deva",
    "th": "tha_Thai",
    "id": "ind_Latn",
    "ms": "zsm_Latn",
    "tl": "tgl_Latn",
    "it": "ita_Latn",
    "nl": "nld_Latn",
    "pl": "pol_Latn",
    "tr": "tur_Latn",
    "uk": "ukr_Cyrl",
    "sv": "swe_Latn",
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
    audio_data, source_lang: str = "auto", is_interim: bool = False, initial_prompt: str | None = None
):
    """Transcribe audio to text. Returns dict with source_text, source_lang, or None if no speech.

    Args:
        audio_data: Audio data as numpy array (float32).
        source_lang: Language code or "auto" for detection.
        is_interim: If True, use fast greedy decoding (beam_size=1) for partials.
        initial_prompt: Domain-specific vocabulary hint for Whisper.
    """

    def _run():
        engine = get_engine()
        cfg = get_config()["transcription"]
        audio_np = np.asarray(audio_data, dtype=np.float32)

        # Use greedy decoding for interim (speed), full beam search for final (quality)
        beam_size = 1 if is_interim else cfg["beam_size"]
        best_of = 1 if is_interim else cfg["best_of"]

        if should_use_gipformer(source_lang):
            try:
                result = _transcribe_with_gipformer(audio_np)
                if result is None:
                    return None
                if _is_hallucination(result["source_text"]):
                    return None
                return result
            except Exception as e:
                logger.warning(
                    "[STT] Gipformer failed for Vietnamese, falling back to Whisper: %s",
                    e,
                )

        if engine == "mlx":
            import mlx_whisper

            # mlx-whisper only supports greedy decoding (beam_size=1)
            mlx_kwargs = {
                "path_or_hf_repo": get_mlx_model_path(),
                "best_of": best_of,
                "compression_ratio_threshold": cfg.get("compression_ratio_threshold", 2.4),
                "no_speech_threshold": cfg.get("no_speech_threshold", 0.6),
                "logprob_threshold": cfg.get("log_prob_threshold", -1.0),
            }
            if initial_prompt:
                mlx_kwargs["initial_prompt"] = initial_prompt
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
            if initial_prompt:
                transcribe_kwargs["initial_prompt"] = initial_prompt
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

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_stt_pool, _run)


# Lock to protect tokenizer.src_lang (shared mutable state)
_tokenizer_lock = threading.Lock()


async def translate_text(text: str, target_lang: str, source_lang: str = "en") -> str:
    """Translate text using offline NLLB model via CTranslate2.

    Runs on a dedicated translation thread pool so it never blocks STT.
    """

    def _run():
        src_code = NLLB_LANG_MAP.get(source_lang)
        tgt_code = NLLB_LANG_MAP.get(target_lang)
        if not src_code or not tgt_code:
            logger.warning(f"[NLLB] Unsupported lang pair: {source_lang}->{target_lang}")
            return text

        translator, tokenizer = _get_nllb()
        cfg = get_config()["translation"]

        # Tokenizer.src_lang is mutable shared state — lock around encode
        with _tokenizer_lock:
            tokenizer.src_lang = src_code
            tokens = tokenizer.convert_ids_to_tokens(tokenizer.encode(text))

        results = translator.translate_batch(
            [tokens],
            target_prefix=[[tgt_code]],
            max_decoding_length=cfg["max_decoding_length"],
            beam_size=cfg["beam_size"],
        )

        output_tokens = results[0].hypotheses[0][1:]
        return tokenizer.decode(
            tokenizer.convert_tokens_to_ids(output_tokens),
            skip_special_tokens=True,
        )

    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(_translate_pool, _run)
    except Exception as e:
        logger.error(f"[NLLB] Translation failed: {e}")
        return text


# Google Translate language code mapping (our short codes -> Google codes)
GOOGLE_LANG_MAP = {
    "en": "en", "zh": "zh-CN", "ja": "ja", "ko": "ko", "vi": "vi",
    "es": "es", "fr": "fr", "de": "de", "pt": "pt", "ru": "ru",
    "ar": "ar", "hi": "hi", "th": "th", "id": "id", "ms": "ms",
    "tl": "tl", "it": "it", "nl": "nl", "pl": "pl", "tr": "tr",
    "uk": "uk", "sv": "sv",
}


async def translate_text_google(text: str, target_lang: str, source_lang: str = "en") -> str:
    """Translate text using Google Translate via deep-translator (free, no API key)."""

    def _run():
        from deep_translator import GoogleTranslator

        src = GOOGLE_LANG_MAP.get(source_lang, source_lang)
        tgt = GOOGLE_LANG_MAP.get(target_lang, target_lang)
        return GoogleTranslator(source=src, target=tgt).translate(text)

    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(_translate_pool, _run)
    except Exception as e:
        logger.warning(f"[Google] Translation failed, falling back to NLLB: {e}")
        return await translate_text(text, target_lang, source_lang=source_lang)
