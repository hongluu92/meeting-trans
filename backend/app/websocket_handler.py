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

    source_lang = ws.query_params.get("source_lang", "auto")
    if source_lang not in LANG_MAP and source_lang != "auto":
        source_lang = "auto"
    target_lang = ws.query_params.get("target_lang", "en")
    if target_lang not in LANG_MAP:
        target_lang = "en"
    buffer = AudioBuffer()

    logger.info(f"WebSocket connected, source_lang={source_lang}, target_lang={target_lang}")

    try:
        while True:
            data = await ws.receive()
            logger.debug(f"[WS] raw message keys: {list(data.keys())}")

            # Handle text messages (config updates)
            if "text" in data:
                logger.debug(f"[WS] text message: {data['text'][:200]}")
                try:
                    msg = json.loads(data["text"])
                    if "source_lang" in msg:
                        new_src = msg["source_lang"]
                        if new_src == "auto" or new_src in LANG_MAP:
                            source_lang = new_src
                            logger.info(f"Source language changed to {source_lang}")
                    if "target_lang" in msg and msg["target_lang"] in LANG_MAP:
                        target_lang = msg["target_lang"]
                        logger.info(f"Target language changed to {target_lang}")
                    continue
                except json.JSONDecodeError:
                    pass

            # Handle binary audio data
            if "bytes" in data:
                chunk = data["bytes"]
                logger.info(
                    f"[WS] received binary chunk: {len(chunk)} bytes, "
                    f"header={chunk[:4].hex() if len(chunk) >= 4 else 'too short'}"
                )
                if len(chunk) > MAX_CHUNK_BYTES:
                    await ws.send_json({"error": "Audio chunk too large"})
                    continue

                buffer.add_chunk(chunk)

                # Process buffered audio
                audio = buffer.get_audio_and_clear()
                if audio is None:
                    logger.info("[WS] audio_processor returned None, skipping")
                    await ws.send_json({"status": "no_speech"})
                    continue

                duration_s = audio.shape[0] / 16000
                logger.info(
                    f"[WS] audio ready: {audio.shape[0]} samples, "
                    f"{duration_s:.2f}s, min={audio.min():.4f}, max={audio.max():.4f}"
                )
                try:
                    result = await translate_audio(audio, target_lang, source_lang)
                    logger.info(
                        f"[WS] translation result: src={result.get('source_lang')} "
                        f"tgt={result.get('target_lang')} "
                        f"src_text='{result.get('source_text', '')[:50]}' "
                        f"translated='{result.get('translated_text', '')[:50]}' "
                        f"duration={result.get('duration_ms')}ms"
                    )
                    await ws.send_json(result)
                except Exception as e:
                    logger.error(f"[WS] translation error: {e}", exc_info=True)
                    await ws.send_json({"error": "Translation failed. Please try again."})

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
