import asyncio
import contextlib
import json
import logging
from collections.abc import Awaitable, Callable

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
    translate_queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=1)
    translate_worker = asyncio.create_task(_translation_worker(ws, translate_queue))

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
                    if msg.get("action") == "ping":
                        await ws.send_json({"action": "pong"})
                        continue
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
                                engine=engine,
                                enqueue_translation=lambda item: _enqueue_latest(translate_queue, item),
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
                        engine=engine,
                        enqueue_translation=lambda item: _enqueue_latest(translate_queue, item),
                    )

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        translate_worker.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await translate_worker


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
    engine: str = "nllb",
    enqueue_translation: Callable[[dict], Awaitable[None]] | None = None,
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
            item = {
                "source_text": source_text,
                "source_lang": detected_lang,
                "target_lang": target_lang,
                "timestamp": ts,
                "is_partial": not is_final,
                "engine": engine,
            }
            if enqueue_translation is not None:
                await enqueue_translation(item)
            else:
                await _translate_and_send(
                    ws,
                    source_text,
                    detected_lang,
                    target_lang,
                    ts,
                    is_partial=not is_final,
                    engine=engine,
                )

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


async def _enqueue_latest(queue: asyncio.Queue[dict], item: dict) -> None:
    """Keep queue bounded by replacing stale queued item with the newest one."""
    if queue.full():
        try:
            queue.get_nowait()
            queue.task_done()
        except asyncio.QueueEmpty:
            pass

    try:
        queue.put_nowait(item)
    except asyncio.QueueFull:
        logger.warning("[WS] translation queue still full, dropping segment")


async def _translation_worker(ws: WebSocket, queue: asyncio.Queue[dict]) -> None:
    """Single translation worker per WebSocket connection."""
    while True:
        item = await queue.get()
        try:
            await _translate_and_send(
                ws,
                item["source_text"],
                item["source_lang"],
                item["target_lang"],
                item["timestamp"],
                is_partial=item["is_partial"],
                engine=item["engine"],
            )
        except Exception as e:
            logger.error(f"[WS] Translation task error: {e}", exc_info=True)
        finally:
            queue.task_done()


async def _translate_and_send(
    ws: WebSocket,
    source_text: str,
    source_lang: str,
    target_lang: str,
    timestamp: int,
    is_partial: bool = False,
    engine: str = "nllb",
) -> None:
    """Run translation in background and send result."""
    try:
        if engine == "google":
            translated = await translate_text_google(source_text, target_lang, source_lang=source_lang)
        else:
            translated = await translate_text(source_text, target_lang, source_lang=source_lang)

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
