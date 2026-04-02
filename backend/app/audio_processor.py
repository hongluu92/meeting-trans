"""Streaming audio buffer with VAD-based speech segmentation.

Accepts raw float32 PCM chunks, runs Silero VAD (ONNX) on incoming data,
and returns complete speech segments when silence is detected after speech.
Also emits interim (partial) segments periodically while speaking.

State machine: idle -> speaking -> silence_after_speech -> (emit segment) -> idle
"""

import logging
import time

import numpy as np

from .config import get_config
from .vad import WINDOW_SAMPLES, SileroVAD

logger = logging.getLogger(__name__)

SAMPLE_RATE = 16000

# Minimum RMS energy to bother running VAD (filters keyboard clicks, silence)
MIN_RMS_ENERGY = 0.005


class AudioBuffer:
    """Streaming audio buffer with VAD-based speech segmentation."""

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
        # Stable timestamp for the current speech segment (ms since epoch)
        self._segment_ts = 0
        # Track how many samples have been VAD-analyzed (avoid re-analysis)
        self._vad_analyzed_up_to = 0

        self._vad_model = None

    def _load_vad(self):
        if self._vad_model is None:
            self._vad_model = SileroVAD()
            logger.debug("[VAD] Silero VAD ONNX model loaded")

    def _run_vad_on_new_data(self) -> list[bool]:
        """Run VAD only on data that hasn't been analyzed yet. Returns per-window speech decisions."""
        self._load_vad()

        # Start from where we left off, aligned to window boundary
        start = self._vad_analyzed_up_to
        results = []

        for i in range(start, len(self._pcm) - WINDOW_SAMPLES + 1, WINDOW_SAMPLES):
            window = self._pcm[i : i + WINDOW_SAMPLES]

            # Energy gate: skip VAD for near-silent windows
            rms = np.sqrt(np.mean(window ** 2))
            if rms < MIN_RMS_ENERGY:
                results.append(False)
            else:
                prob = self._vad_model(window)
                results.append(prob >= self._threshold)

            self._vad_analyzed_up_to = i + WINDOW_SAMPLES

        return results

    def add_chunk(self, pcm_bytes: bytes) -> None:
        """Append raw float32 PCM bytes to the rolling buffer."""
        # Trim trailing bytes so length is a multiple of 4 (float32 size)
        remainder = len(pcm_bytes) % 4
        if remainder != 0:
            pcm_bytes = pcm_bytes[: len(pcm_bytes) - remainder]
        if len(pcm_bytes) == 0:
            return
        chunk = np.frombuffer(pcm_bytes, dtype=np.float32)
        if len(chunk) == 0:
            return
        self._pcm = np.concatenate([self._pcm, chunk])

    def get_speech_segment(self):
        """Check buffer for a complete or partial speech segment.

        Returns (numpy_array, is_final, segment_ts):
          - is_final=True: silence boundary or force-cut, buffer cleared
          - is_final=False: interim partial segment, buffer kept
          - segment_ts: stable ms timestamp for this speech segment
          - None: nothing to emit yet
        """
        if len(self._pcm) < WINDOW_SAMPLES:
            return None

        vad_decisions = self._run_vad_on_new_data()

        for is_speech in vad_decisions:
            if is_speech:
                if self._speech_start < 0:
                    self._speech_start = max(0, len(self._pcm) - WINDOW_SAMPLES * len(vad_decisions))
                    self._last_interim_time = time.monotonic()
                    self._segment_ts = int(time.time() * 1000)
                    logger.debug("[VAD] speech started")
                self._silence_count = 0
            else:
                if self._speech_start >= 0:
                    self._silence_count += WINDOW_SAMPLES

        if self._speech_start < 0:
            self._trim_idle_buffer()
            return None

        speech_len = len(self._pcm) - self._speech_start

        # Force-cut if max segment length exceeded
        if speech_len >= self._max_segment_samples:
            logger.debug(
                f"[VAD] force-cut at {speech_len / SAMPLE_RATE:.1f}s "
                f"(max {self._max_segment_s}s)"
            )
            seg_ts = self._segment_ts
            return (self._extract_segment(), True, seg_ts)

        # Silence after speech — natural boundary
        if self._silence_count >= self._silence_samples:
            actual_speech = speech_len - self._silence_count
            if actual_speech >= self._min_speech_samples:
                logger.debug(
                    f"[VAD] segment ready: {actual_speech / SAMPLE_RATE:.2f}s speech "
                    f"+ {self._silence_count / SAMPLE_RATE:.2f}s silence"
                )
                seg_ts = self._segment_ts
                return (self._extract_segment(), True, seg_ts)
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
            logger.debug(
                f"[VAD] interim segment: {len(audio) / SAMPLE_RATE:.2f}s"
            )
            return (audio.copy(), False, self._segment_ts)

        return None

    def _trim_idle_buffer(self) -> None:
        """Keep only a tiny tail when idle to avoid unbounded silent-buffer growth."""
        if self._speech_start >= 0:
            return

        keep_tail = WINDOW_SAMPLES
        if len(self._pcm) <= keep_tail:
            return

        # Trim only after enough analyzed data has accumulated to avoid frequent copies.
        if self._vad_analyzed_up_to < WINDOW_SAMPLES * 10:
            return

        drop = len(self._pcm) - keep_tail
        self._pcm = self._pcm[drop:].copy()
        self._vad_analyzed_up_to = max(0, self._vad_analyzed_up_to - drop)

    def _extract_segment(self) -> np.ndarray:
        """Extract speech segment from buffer, trim silence tail, reset state."""
        end = len(self._pcm) - self._silence_count
        audio = self._pcm[self._speech_start : end].copy()

        rms = np.sqrt(np.mean(audio ** 2))
        logger.info(
            f"[AudioBuffer] segment: {len(audio)} samples, "
            f"{len(audio) / SAMPLE_RATE:.2f}s, "
            f"rms={rms:.6f}"
        )

        self._reset_state()
        return audio

    def _discard_segment(self) -> None:
        """Discard current speech region and reset state."""
        self._reset_state()

    def _reset_state(self) -> None:
        """Clear buffer and reset all tracking state."""
        self._pcm = np.empty(0, dtype=np.float32)
        self._speech_start = -1
        self._silence_count = 0
        self._last_interim_time = 0.0
        self._segment_ts = 0
        self._vad_analyzed_up_to = 0
        if self._vad_model is not None:
            self._vad_model.reset_states()

    def flush(self):
        """Force-emit any remaining speech (called on recording stop)."""
        if self._speech_start < 0 or len(self._pcm) == 0:
            self._reset_state()
            return None

        actual_speech = len(self._pcm) - self._speech_start - self._silence_count
        if actual_speech < self._min_speech_samples:
            self._reset_state()
            return None

        seg_ts = self._segment_ts
        return (self._extract_segment(), True, seg_ts)
