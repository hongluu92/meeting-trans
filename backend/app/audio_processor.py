import logging
import struct
import subprocess
import tempfile
from pathlib import Path

import torch

from .config import get_config

logger = logging.getLogger(__name__)

SAMPLE_RATE = 16000


def convert_webm_to_wav(webm_bytes: bytes) -> torch.Tensor:
    """Convert WebM/Opus audio bytes to 16kHz mono float32 tensor using ffmpeg.

    Pipes raw PCM from ffmpeg directly — no torchaudio dependency.
    """
    logger.info(
        f"[ffmpeg] converting WebM->PCM: {len(webm_bytes)} bytes, "
        f"header={webm_bytes[:4].hex() if len(webm_bytes) >= 4 else 'empty'}"
    )
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp_in:
        tmp_in.write(webm_bytes)
        tmp_in_path = tmp_in.name

    try:
        result = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                tmp_in_path,
                "-ar",
                str(SAMPLE_RATE),
                "-ac",
                "1",
                "-f",
                "s16le",  # raw 16-bit signed little-endian PCM
                "pipe:1",
            ],
            capture_output=True,
            check=True,
            timeout=10,
        )

        pcm_bytes = result.stdout
        logger.debug(f"[ffmpeg] stderr: {result.stderr.decode()[-300:]}")
        if len(pcm_bytes) == 0:
            raise ValueError("ffmpeg produced empty output")

        # Convert raw int16 PCM to float32 tensor
        n_samples = len(pcm_bytes) // 2
        samples = struct.unpack(f"<{n_samples}h", pcm_bytes)
        waveform = torch.tensor(samples, dtype=torch.float32) / 32768.0

        logger.info(
            f"[ffmpeg] output: {n_samples} samples, {n_samples/SAMPLE_RATE:.2f}s, "
            f"min={waveform.min():.4f}, max={waveform.max():.4f}, "
            f"rms={waveform.pow(2).mean().sqrt():.6f}"
        )
        return waveform  # 1D tensor

    except subprocess.CalledProcessError as e:
        logger.error(f"ffmpeg conversion failed: {e.stderr.decode()}")
        raise ValueError("Failed to convert audio format")
    finally:
        Path(tmp_in_path).unlink(missing_ok=True)


class AudioBuffer:
    """Buffers incoming audio chunks and detects speech segments using silero-vad."""

    MAX_BUFFER_BYTES = 10 * 1024 * 1024  # 10MB max buffer

    def __init__(self, vad_threshold: float | None = None, min_speech_ms: int | None = None):
        vad_cfg = get_config()["vad"]
        self.vad_threshold = vad_threshold if vad_threshold is not None else vad_cfg["threshold"]
        self.min_speech_ms = min_speech_ms if min_speech_ms is not None else vad_cfg["min_speech_ms"]
        self.chunks: list[bytes] = []
        self._buffer_size = 0
        self._vad_model = None
        self._vad_utils = None

    def _load_vad(self):
        if self._vad_model is None:
            self._vad_model, self._vad_utils = torch.hub.load(
                "snakers4/silero-vad", "silero_vad"
            )

    def add_chunk(self, chunk: bytes):
        self._buffer_size += len(chunk)
        if self._buffer_size > self.MAX_BUFFER_BYTES:
            logger.warning("Audio buffer exceeded max size, clearing")
            self.chunks.clear()
            self._buffer_size = len(chunk)
        self.chunks.append(chunk)

    def get_audio_and_clear(self) -> torch.Tensor | None:
        """Combine buffered chunks, convert to tensor, and clear buffer.
        Returns tensor if speech detected, None otherwise."""
        if not self.chunks:
            return None

        combined = b"".join(self.chunks)
        n_chunks = len(self.chunks)
        self.chunks.clear()
        self._buffer_size = 0

        logger.info(f"[AudioBuffer] processing {n_chunks} chunks, {len(combined)} bytes total")

        try:
            audio = convert_webm_to_wav(combined)
        except ValueError as e:
            logger.error(f"[AudioBuffer] ffmpeg conversion failed: {e}")
            return None

        min_samples = int(SAMPLE_RATE * (self.min_speech_ms / 1000))
        if audio.shape[0] < min_samples:
            logger.info(
                f"[AudioBuffer] audio too short: {audio.shape[0]} < {min_samples} samples "
                f"({audio.shape[0]/SAMPLE_RATE*1000:.0f}ms < {self.min_speech_ms}ms)"
            )
            return None

        # VAD check (soft filter — log but don't drop, model handles silence)
        try:
            self._load_vad()
            get_speech_timestamps = self._vad_utils[0]
            speech_timestamps = get_speech_timestamps(
                audio, self._vad_model, threshold=self.vad_threshold
            )
            logger.info(
                f"[VAD] threshold={self.vad_threshold}, "
                f"speech_segments={len(speech_timestamps)}, "
                f"timestamps={speech_timestamps[:3]}"
            )
            if not speech_timestamps:
                logger.info("[VAD] no speech detected, but forwarding to model anyway")
        except Exception as e:
            logger.warning(f"[VAD] check failed, processing anyway: {e}")

        return audio
