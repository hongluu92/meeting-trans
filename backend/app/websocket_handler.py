import json
import logging

from fastapi import WebSocket, WebSocketDisconnect

from .audio_processor import AudioBuffer
from .translator import LANG_MAP, translate_audio

logger = logging.getLogger(__name__)

MAX_CHUNK_BYTES = 16 * 1024 * 1024  # 16MB max per chunk


async def handle_websocket(ws: WebSocket):
    """Handle a single WebSocket connection for audio translation."""
    await ws.accept()

    target_lang = ws.query_params.get("target_lang", "en")
    if target_lang not in LANG_MAP:
        target_lang = "en"
    buffer = AudioBuffer()

    logger.info(f"WebSocket connected, target_lang={target_lang}")

    try:
        while True:
            data = await ws.receive()

            # Handle text messages (config updates)
            if "text" in data:
                try:
                    msg = json.loads(data["text"])
                    if "target_lang" in msg and msg["target_lang"] in LANG_MAP:
                        target_lang = msg["target_lang"]
                        logger.info(f"Target language changed to {target_lang}")
                        continue
                except json.JSONDecodeError:
                    pass

            # Handle binary audio data
            if "bytes" in data:
                chunk = data["bytes"]
                if len(chunk) > MAX_CHUNK_BYTES:
                    await ws.send_json({"error": "Audio chunk too large"})
                    continue

                buffer.add_chunk(chunk)

                # Process buffered audio
                audio = buffer.get_audio_and_clear()
                if audio is None:
                    continue

                try:
                    result = await translate_audio(audio, target_lang)
                    await ws.send_json(result)
                except Exception as e:
                    logger.error(f"Translation error: {e}")
                    await ws.send_json({"error": "Translation failed. Please try again."})

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
