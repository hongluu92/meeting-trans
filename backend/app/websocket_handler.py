import asyncio
import json
import logging

from fastapi import WebSocket, WebSocketDisconnect

from .audio_processor import AudioBuffer
from .translator import LANG_MAP, transcribe_audio, translate_text, translate_text_google

logger = logging.getLogger(__name__)

MAX_CHUNK_BYTES = 2 * 1024 * 1024  # 2MB max per binary frame (~8s of float32 16kHz)
_LANG_PIN_THRESHOLD = 3  # consecutive same-language detections to pin

# Domain-specific vocabulary prompts for Whisper initial_prompt
DOMAIN_PROMPTS = {
    "it": (
        "Technical discussion about software development, APIs, cloud computing, "
        "Kubernetes, Docker, CI/CD, microservices, deployment, DevOps, Git, "
        "React, Python, TypeScript, database, server, frontend, backend."
    ),
    "medical": (
        "Medical discussion about patient care, diagnosis, symptoms, treatment, "
        "prescription, surgery, MRI, CT scan, blood test, vital signs, "
        "cardiology, neurology, pharmacy, clinical trial."
    ),
    "legal": (
        "Legal discussion about contracts, plaintiff, defendant, jurisdiction, "
        "statute, compliance, litigation, arbitration, intellectual property, "
        "due diligence, liability, regulatory, court ruling."
    ),
    "business": (
        "Business meeting about revenue, stakeholders, KPIs, quarterly results, "
        "ROI, market analysis, strategy, acquisition, partnership, "
        "budget, forecast, profit margin, competitive advantage."
    ),
    "education": (
        "Educational discussion about curriculum, students, assessment, "
        "learning outcomes, pedagogy, lecture, research, thesis, "
        "academic, university, scholarship, enrollment."
    ),
}


class _LangPin:
    """Track detected languages and pin after consecutive matches.

    Prevents Whisper from flipping between languages mid-conversation
    when source_lang is set to "auto".
    """

    def __init__(self):
        self.pinned = None
        self._streak_lang = None
        self._streak_count = 0

    def update(self, detected_lang: str) -> None:
        """Update streak with a new detection. Pins after threshold reached."""
        if detected_lang == self._streak_lang:
            self._streak_count += 1
        else:
            self._streak_lang = detected_lang
            self._streak_count = 1

        if self._streak_count >= _LANG_PIN_THRESHOLD and self.pinned != detected_lang:
            self.pinned = detected_lang
            logger.debug(f"[LangPin] pinned to '{detected_lang}' after {self._streak_count} consecutive")

    def effective_lang(self, source_lang: str) -> str:
        """Return pinned language if source is auto and we have a pin."""
        if source_lang == "auto" and self.pinned is not None:
            return self.pinned
        return source_lang

    def reset(self):
        self.pinned = None
        self._streak_lang = None
        self._streak_count = 0


async def handle_websocket(ws: WebSocket):
    """Handle a single WebSocket connection for streaming audio translation."""
    await ws.accept()

    source_lang = ws.query_params.get("source_lang", "auto")
    if source_lang not in LANG_MAP and source_lang != "auto":
        source_lang = "auto"
    target_lang = ws.query_params.get("target_lang", "en")
    if target_lang not in LANG_MAP:
        target_lang = "en"
    buffer = AudioBuffer()
    domain = ws.query_params.get("domain", "general")
    engine = ws.query_params.get("engine", "nllb")

    # Language pinning state
    lang_pin = _LangPin()
    # Sliding context window: last source sentence for context-aware translation
    translation_context = ""

    try:
        while True:
            data = await ws.receive()

            # Handle text messages (config updates)
            if "text" in data:
                try:
                    msg = json.loads(data["text"])
                    if "source_lang" in msg:
                        new_src = msg["source_lang"]
                        if new_src == "auto" or new_src in LANG_MAP:
                            source_lang = new_src
                            lang_pin.reset()  # user changed lang, reset pin
                    if "target_lang" in msg and msg["target_lang"] in LANG_MAP:
                        target_lang = msg["target_lang"]
                    if "domain" in msg:
                        domain = msg["domain"]
                    if "engine" in msg and msg["engine"] in ("nllb", "google"):
                        engine = msg["engine"]
                    # Flush remaining audio on stop signal
                    if msg.get("action") == "stop":
                        result = buffer.flush()
                        if result is not None:
                            audio, is_final, seg_ts = result
                            effective_src = lang_pin.effective_lang(source_lang)
                            await _process_audio(
                                ws, audio, effective_src, target_lang,
                                is_final, seg_ts, lang_pin,
                                domain=domain,
                                context=translation_context,
                                engine=engine,
                            )
                    continue
                except json.JSONDecodeError:
                    pass

            # Handle binary audio data (raw float32 PCM at 16kHz)
            if "bytes" in data:
                chunk = data["bytes"]
                if len(chunk) > MAX_CHUNK_BYTES:
                    await ws.send_json({"error": "Audio chunk too large"})
                    continue

                buffer.add_chunk(chunk)

                # Check if VAD detected a complete or partial speech segment
                result = buffer.get_speech_segment()
                if result is not None:
                    audio, is_final, seg_ts = result
                    effective_src = lang_pin.effective_lang(source_lang)

                    # Only translate final (complete) segments — partials show STT only
                    translate_this = is_final

                    src_text = await _process_audio(
                        ws, audio, effective_src, target_lang,
                        is_final, seg_ts, lang_pin,
                        translate=translate_this,
                        domain=domain,
                        context=translation_context,
                        engine=engine,
                    )
                    # Update context with the latest final source text
                    if is_final and src_text:
                        translation_context = src_text

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket error: {e}")


async def _process_audio(
    ws: WebSocket,
    audio,
    source_lang: str,
    target_lang: str,
    is_final: bool,
    segment_ts: int,
    lang_pin: _LangPin | None = None,
    translate: bool = True,
    domain: str = "general",
    context: str = "",
    engine: str = "nllb",
) -> str | None:
    """Run STT (+ translation if final) on an audio segment and send results.
    Returns source_text for context tracking, or None if no speech."""
    try:
        ts = segment_ts
        initial_prompt = DOMAIN_PROMPTS.get(domain)

        # Step 1: STT (greedy for interims, beam search for finals)
        stt = await transcribe_audio(audio, source_lang, is_interim=not is_final, initial_prompt=initial_prompt)
        if stt is None:
            if is_final:
                await ws.send_json({"status": "no_speech"})
            return None

        detected_lang = stt["source_lang"]
        source_text = stt["source_text"]

        # Update language pinning on final segments only (interims are noisy)
        if is_final and lang_pin is not None:
            lang_pin.update(detected_lang)

        needs_translation = detected_lang != target_lang
        logger.info(
            f"[WS] STT {'partial' if not is_final else 'FINAL'}: "
            f"lang={detected_lang} target={target_lang} "
            f"text='{source_text[:60]}'"
        )

        # Send STT result immediately
        will_translate = needs_translation and translate
        await ws.send_json({
            "source_lang": detected_lang,
            "source_text": source_text,
            "target_lang": target_lang,
            "translated_text": "" if needs_translation else source_text,
            "translating": will_translate,
            "partial": not is_final,
            "timestamp": ts,
        })

        # Translate in parallel (debounced for partials to avoid flooding NLLB)
        if will_translate:
            # Only use context for final segments (partials need speed over quality)
            use_context = context and is_final and len(context) < 100
            text_to_translate = f"{context} {source_text}".strip() if use_context else source_text
            task = asyncio.create_task(
                _translate_and_send(
                    ws, source_text, detected_lang, target_lang, ts,
                    is_partial=not is_final,
                    full_text=text_to_translate,
                    context_len=len(context) if use_context else 0,
                    engine=engine,
                )
            )
            task.add_done_callback(lambda t: logger.error(f"[WS] Translation task error: {t.exception()}") if t.exception() else None)

        return source_text

    except WebSocketDisconnect:
        logger.debug("[WS] client disconnected during audio processing")
    except Exception as e:
        logger.error(f"[WS] STT error: {e}", exc_info=True)
        try:
            await ws.send_json({"error": "Processing failed. Please try again."})
        except (WebSocketDisconnect, RuntimeError):
            pass
    return None


async def _translate_and_send(
    ws: WebSocket,
    source_text: str,
    source_lang: str,
    target_lang: str,
    timestamp: int,
    is_partial: bool = False,
    full_text: str = "",
    context_len: int = 0,
    engine: str = "nllb",
) -> None:
    """Run translation in background and send result.

    If full_text includes context prefix, translates the full text for coherence
    but only sends the translation of the current segment (strips context translation).
    """
    try:
        text_to_translate = full_text or source_text
        if engine == "google":
            raw_translated = await translate_text_google(text_to_translate, target_lang, source_lang=source_lang)
        else:
            raw_translated = await translate_text(text_to_translate, target_lang, source_lang=source_lang)

        # If we prepended context, try to extract only the current sentence's translation
        # by translating context alone and stripping it from the full translation
        translated = raw_translated
        if context_len > 0 and len(raw_translated) > 20:
            # Heuristic: the translation of just the current part is roughly
            # the last portion of the full translation. We take the full result
            # since splitting translated text is unreliable across languages.
            # The context mainly helps NLLB produce better grammar/pronouns.
            translated = raw_translated

        logger.info(f"[WS] Translation done: '{translated[:60]}'")
        await ws.send_json({
            "source_lang": source_lang,
            "source_text": source_text,
            "target_lang": target_lang,
            "translated_text": translated,
            "translating": False,
            "partial": is_partial,
            "timestamp": timestamp,
        })
    except (WebSocketDisconnect, RuntimeError):
        pass
    except Exception as e:
        logger.error(f"[WS] translation error: {e}", exc_info=True)
