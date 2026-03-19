import logging
import subprocess
import tempfile
from pathlib import Path

import torch
import torchaudio

logger = logging.getLogger(__name__)

SAMPLE_RATE = 16000


def convert_webm_to_wav(webm_bytes: bytes) -> torch.Tensor:
    """Convert WebM/Opus audio bytes to 16kHz mono float32 tensor using ffmpeg."""
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp_in:
        tmp_in.write(webm_bytes)
        tmp_in_path = tmp_in.name

    tmp_out_path = str(Path(tmp_in_path).with_suffix(".wav"))

    try:
        subprocess.run(
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
                "wav",
                tmp_out_path,
            ],
            capture_output=True,
            check=True,
            timeout=10,
        )

        waveform, sr = torchaudio.load(tmp_out_path)
        if sr != SAMPLE_RATE:
            waveform = torchaudio.functional.resample(waveform, sr, SAMPLE_RATE)

        # Ensure mono
        if waveform.shape[0] > 1:
            waveform = waveform.mean(dim=0, keepdim=True)

        return waveform.squeeze(0)  # Return 1D tensor

    except subprocess.CalledProcessError as e:
        logger.error(f"ffmpeg conversion failed: {e.stderr.decode()}")
        raise ValueError("Failed to convert audio format")
    finally:
        Path(tmp_in_path).unlink(missing_ok=True)
        Path(tmp_out_path).unlink(missing_ok=True)


class AudioBuffer:
    """Buffers incoming audio chunks and detects speech segments using silero-vad."""

    MAX_BUFFER_BYTES = 10 * 1024 * 1024  # 10MB max buffer

    def __init__(self, vad_threshold: float = 0.5, min_speech_ms: int = 500):
        self.vad_threshold = vad_threshold
        self.min_speech_ms = min_speech_ms
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
        self.chunks.clear()
        self._buffer_size = 0

        try:
            audio = convert_webm_to_wav(combined)
        except ValueError:
            return None

        if audio.shape[0] < SAMPLE_RATE * (self.min_speech_ms / 1000):
            return None

        # VAD check
        try:
            self._load_vad()
            get_speech_timestamps = self._vad_utils[0]
            speech_timestamps = get_speech_timestamps(
                audio, self._vad_model, threshold=self.vad_threshold
            )
            if not speech_timestamps:
                logger.debug("No speech detected in audio chunk")
                return None
        except Exception as e:
            logger.warning(f"VAD check failed, processing anyway: {e}")

        return audio
