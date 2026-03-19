import logging
import time

import numpy as np
import torch

from .config import get_config

logger = logging.getLogger(__name__)

SAMPLE_RATE = 16000

# Silero VAD operates on 512-sample windows at 16kHz (32ms each)
VAD_WINDOW_SAMPLES = 512


class AudioBuffer:
    """Streaming audio buffer with VAD-based speech segmentation.

    Accepts raw float32 PCM chunks, runs silero-vad on incoming data,
    and returns complete speech segments when silence is detected after speech.
    Also emits interim (partial) segments every `interim_interval_s` while speaking.

    State machine: idle → speaking → silence_after_speech → (emit segment) → idle
    """

    def __init__(self):
        cfg = get_config()["vad"]
        self._threshold = cfg["threshold"]
        self._min_speech_ms = cfg["min_speech_ms"]
        self._silence_duration_ms = cfg["silence_duration_ms"]
        self._max_segment_s = cfg["max_segment_s"]
        self._interim_interval_s = cfg["interim_interval_s"]

        # Derived sample counts
        self._min_speech_samples = int(SAMPLE_RATE * self._min_speech_ms / 1000)
        self._silence_samples = int(SAMPLE_RATE * self._silence_duration_ms / 1000)
        self._max_segment_samples = int(SAMPLE_RATE * self._max_segment_s)

        # Rolling PCM buffer (numpy float32)
        self._pcm = np.empty(0, dtype=np.float32)
        # Index where current speech started (-1 = idle)
        self._speech_start = -1
        # Count of consecutive silence samples after speech
        self._silence_count = 0
        # Timestamp of last interim emission
        self._last_interim_time = 0.0

        self._vad_model = None

    def _load_vad(self):
        if self._vad_model is None:
            self._vad_model, _ = torch.hub.load("snakers4/silero-vad", "silero_vad")
            logger.debug("[VAD] silero-vad model loaded")

    def _run_vad_on_chunk(self, chunk: np.ndarray) -> list[bool]:
        """Run VAD on chunk, return per-window speech decisions."""
        self._load_vad()
        results = []
        for i in range(0, len(chunk) - VAD_WINDOW_SAMPLES + 1, VAD_WINDOW_SAMPLES):
            window = torch.from_numpy(chunk[i : i + VAD_WINDOW_SAMPLES])
            prob = self._vad_model(window, SAMPLE_RATE).item()
            results.append(prob >= self._threshold)
        return results

    def add_chunk(self, pcm_bytes: bytes) -> None:
        """Append raw float32 PCM bytes to the rolling buffer."""
        chunk = np.frombuffer(pcm_bytes, dtype=np.float32)
        if len(chunk) == 0:
            return
        self._pcm = np.concatenate([self._pcm, chunk])

    def get_speech_segment(self) -> tuple[torch.Tensor, bool] | None:
        """Check buffer for a complete or partial speech segment.

        Returns (tensor, is_final):
          - is_final=True: silence boundary or force-cut, buffer cleared
          - is_final=False: interim partial segment, buffer kept
          - None: nothing to emit yet
        """
        if len(self._pcm) < VAD_WINDOW_SAMPLES:
            return None

        # Run VAD on recent tail
        analyze_start = max(0, len(self._pcm) - VAD_WINDOW_SAMPLES * 20)
        recent = self._pcm[analyze_start:]
        vad_decisions = self._run_vad_on_chunk(recent)

        for is_speech in vad_decisions:
            if is_speech:
                if self._speech_start < 0:
                    self._speech_start = max(0, len(self._pcm) - len(recent))
                    self._last_interim_time = time.monotonic()
                    logger.debug("[VAD] speech started")
                self._silence_count = 0
            else:
                if self._speech_start >= 0:
                    self._silence_count += VAD_WINDOW_SAMPLES

        if self._speech_start < 0:
            return None

        speech_len = len(self._pcm) - self._speech_start

        # Force-cut if max segment length exceeded
        if speech_len >= self._max_segment_samples:
            logger.debug(
                f"[VAD] force-cut at {speech_len / SAMPLE_RATE:.1f}s "
                f"(max {self._max_segment_s}s)"
            )
            return (self._extract_segment(), True)

        # Silence after speech — natural boundary
        if self._silence_count >= self._silence_samples:
            actual_speech = speech_len - self._silence_count
            if actual_speech >= self._min_speech_samples:
                logger.debug(
                    f"[VAD] segment ready: {actual_speech / SAMPLE_RATE:.2f}s speech "
                    f"+ {self._silence_count / SAMPLE_RATE:.2f}s silence"
                )
                return (self._extract_segment(), True)
            else:
                logger.debug(
                    f"[VAD] discarding short utterance: "
                    f"{actual_speech / SAMPLE_RATE * 1000:.0f}ms "
                    f"< {self._min_speech_ms}ms"
                )
                self._discard_segment()
                return None

        # Interim partial: emit copy every interim_interval_s while still speaking
        now = time.monotonic()
        actual_speech = speech_len - self._silence_count
        if (
            actual_speech >= self._min_speech_samples
            and now - self._last_interim_time >= self._interim_interval_s
        ):
            self._last_interim_time = now
            audio = self._pcm[self._speech_start : len(self._pcm) - self._silence_count]
            tensor = torch.from_numpy(audio.copy())
            logger.debug(
                f"[VAD] interim segment: {len(audio) / SAMPLE_RATE:.2f}s"
            )
            return (tensor, False)

        return None

    def _extract_segment(self) -> torch.Tensor:
        """Extract speech segment from buffer, trim silence tail, reset state."""
        end = len(self._pcm) - self._silence_count
        audio = self._pcm[self._speech_start : end]

        self._pcm = np.empty(0, dtype=np.float32)
        self._speech_start = -1
        self._silence_count = 0
        self._last_interim_time = 0.0

        tensor = torch.from_numpy(audio.copy())
        logger.info(
            f"[AudioBuffer] segment: {len(audio)} samples, "
            f"{len(audio) / SAMPLE_RATE:.2f}s, "
            f"rms={tensor.pow(2).mean().sqrt():.6f}"
        )
        return tensor

    def _discard_segment(self) -> None:
        """Discard current speech region and reset state."""
        self._pcm = np.empty(0, dtype=np.float32)
        self._speech_start = -1
        self._silence_count = 0
        self._last_interim_time = 0.0

    def flush(self) -> tuple[torch.Tensor, bool] | None:
        """Force-emit any remaining speech (called on recording stop)."""
        if self._speech_start < 0 or len(self._pcm) == 0:
            self._pcm = np.empty(0, dtype=np.float32)
            self._speech_start = -1
            self._silence_count = 0
            return None

        actual_speech = len(self._pcm) - self._speech_start - self._silence_count
        if actual_speech < self._min_speech_samples:
            self._pcm = np.empty(0, dtype=np.float32)
            self._speech_start = -1
            self._silence_count = 0
            return None

        return (self._extract_segment(), True)
