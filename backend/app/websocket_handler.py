import json
import logging
import time

from fastapi import WebSocket, WebSocketDisconnect

from .audio_processor import AudioBuffer
from .translator import LANG_MAP, transcribe_audio, translate_text

logger = logging.getLogger(__name__)

MAX_CHUNK_BYTES = 2 * 1024 * 1024  # 2MB max per binary frame (~8s of float32 16kHz)


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
                    if "target_lang" in msg and msg["target_lang"] in LANG_MAP:
                        target_lang = msg["target_lang"]
                    # Flush remaining audio on stop signal
                    if msg.get("action") == "stop":
                        result = buffer.flush()
                        if result is not None:
                            audio, is_final = result
                            await _process_audio(ws, audio, source_lang, target_lang, is_final)
                    continue
                except json.JSONDecodeError:
                    pass

            # Handle binary audio data (raw float32 PCM at 16kHz)
            if "bytes" in data:
                chunk = data["bytes"]
                logger.info(f"[WS] chunk: {len(chunk)}B, first16={chunk[:16].hex()}")
                if len(chunk) > MAX_CHUNK_BYTES:
                    await ws.send_json({"error": "Audio chunk too large"})
                    continue

                buffer.add_chunk(chunk)

                # Check if VAD detected a complete or partial speech segment
                result = buffer.get_speech_segment()
                logger.info(f"[WS] VAD result: {result is not None}")
                if result is not None:
                    audio, is_final = result
                    logger.info(f"[WS] segment: {len(audio)} samples, is_final={is_final}")
                    await _process_audio(ws, audio, source_lang, target_lang, is_final)

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
) -> None:
    """Run STT (+ translation if final) on an audio segment and send results."""
    try:
        ts = int(time.time() * 1000)

        # Step 1: STT
        stt = await transcribe_audio(audio, source_lang)
        if stt is None:
            if is_final:
                await ws.send_json({"status": "no_speech"})
            return

        detected_lang = stt["source_lang"]
        source_text = stt["source_text"]

        # Partial (interim): send STT only, no translation
        if not is_final:
            await ws.send_json({
                "source_lang": detected_lang,
                "source_text": source_text,
                "target_lang": target_lang,
                "translated_text": "",
                "translating": False,
                "partial": True,
                "timestamp": ts,
            })
            return

        # Final: send STT then translation
        needs_translation = detected_lang != target_lang
        stt_result = {
            "source_lang": detected_lang,
            "source_text": source_text,
            "target_lang": target_lang,
            "translated_text": "" if needs_translation else source_text,
            "translating": needs_translation,
            "partial": False,
            "timestamp": ts,
        }
        await ws.send_json(stt_result)

        # Step 2: Translate (if needed)
        if needs_translation:
            translated = await translate_text(source_text, target_lang)
            await ws.send_json({
                "source_lang": detected_lang,
                "source_text": source_text,
                "target_lang": target_lang,
                "translated_text": translated,
                "translating": False,
                "partial": False,
                "timestamp": ts,
            })

    except WebSocketDisconnect:
        logger.debug("[WS] client disconnected during audio processing")
    except Exception as e:
        logger.error(f"[WS] translation error: {e}", exc_info=True)
        try:
            await ws.send_json({"error": "Translation failed. Please try again."})
        except (WebSocketDisconnect, RuntimeError):
            pass
