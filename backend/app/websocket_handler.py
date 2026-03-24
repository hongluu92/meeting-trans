import asyncio
import json
import logging

from fastapi import WebSocket, WebSocketDisconnect

from .audio_processor import AudioBuffer
from .translator import LANG_MAP, transcribe_audio, translate_text

logger = logging.getLogger(__name__)

MAX_CHUNK_BYTES = 2 * 1024 * 1024  # 2MB max per binary frame (~8s of float32 16kHz)
_LANG_PIN_THRESHOLD = 3  # consecutive same-language detections to pin


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

    # Language pinning state: after consecutive same-language detections, pin it
    lang_pin = _LangPin()

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
                    # Flush remaining audio on stop signal
                    if msg.get("action") == "stop":
                        result = buffer.flush()
                        if result is not None:
                            audio, is_final, seg_ts = result
                            effective_src = lang_pin.effective_lang(source_lang)
                            await _process_audio(
                                ws, audio, effective_src, target_lang,
                                is_final, seg_ts, lang_pin,
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
                    await _process_audio(
                        ws, audio, effective_src, target_lang,
                        is_final, seg_ts, lang_pin,
                    )

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
) -> None:
    """Run STT (+ translation if final) on an audio segment and send results."""
    try:
        ts = segment_ts

        # Step 1: STT (greedy for interims, beam search for finals)
        stt = await transcribe_audio(audio, source_lang, is_interim=not is_final)
        if stt is None:
            if is_final:
                await ws.send_json({"status": "no_speech"})
            return

        detected_lang = stt["source_lang"]
        source_text = stt["source_text"]

        # Update language pinning on final segments only (interims are noisy)
        if is_final and lang_pin is not None:
            lang_pin.update(detected_lang)

        needs_translation = detected_lang != target_lang

        # Send STT result immediately (partial or final)
        await ws.send_json({
            "source_lang": detected_lang,
            "source_text": source_text,
            "target_lang": target_lang,
            "translated_text": "" if needs_translation else source_text,
            "translating": needs_translation and is_final,
            "partial": not is_final,
            "timestamp": ts,
        })

        # Start translation in parallel — runs on dedicated thread pool,
        # does NOT block the next STT segment
        if needs_translation and is_final:
            asyncio.create_task(
                _translate_and_send(ws, source_text, detected_lang, target_lang, ts)
            )

    except WebSocketDisconnect:
        logger.debug("[WS] client disconnected during audio processing")
    except Exception as e:
        logger.error(f"[WS] STT error: {e}", exc_info=True)
        try:
            await ws.send_json({"error": "Processing failed. Please try again."})
        except (WebSocketDisconnect, RuntimeError):
            pass


async def _translate_and_send(
    ws: WebSocket,
    source_text: str,
    source_lang: str,
    target_lang: str,
    timestamp: int,
) -> None:
    """Run translation in background and send result. Does not block STT loop."""
    try:
        translated = await translate_text(source_text, target_lang, source_lang=source_lang)
        await ws.send_json({
            "source_lang": source_lang,
            "source_text": source_text,
            "target_lang": target_lang,
            "translated_text": translated,
            "translating": False,
            "partial": False,
            "timestamp": timestamp,
        })
    except (WebSocketDisconnect, RuntimeError):
        pass
    except Exception as e:
        logger.error(f"[WS] translation error: {e}", exc_info=True)
