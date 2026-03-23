"""Silero VAD wrapper using ONNX runtime (no torch dependency).

Downloads the Silero VAD ONNX model on first use and runs inference
via onnxruntime. Maintains LSTM hidden state across calls for
streaming audio processing.
"""

import logging
import os

import numpy as np

logger = logging.getLogger(__name__)

# Silero VAD ONNX model URL and cache location
_ONNX_URL = (
    "https://github.com/snakers4/silero-vad/raw/master/"
    "src/silero_vad/data/silero_vad.onnx"
)
_MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
_ONNX_PATH = os.path.join(_MODEL_DIR, "silero_vad.onnx")

# 16kHz: 512 samples per window, 64 samples context
SAMPLE_RATE = 16000
WINDOW_SAMPLES = 512
CONTEXT_SAMPLES = 64


def _download_onnx_model():
    """Download Silero VAD ONNX model if not cached locally."""
    if os.path.exists(_ONNX_PATH):
        return _ONNX_PATH

    os.makedirs(_MODEL_DIR, exist_ok=True)
    logger.info(f"[VAD] Downloading Silero VAD ONNX model to {_ONNX_PATH}")

    from urllib.request import urlretrieve
    urlretrieve(_ONNX_URL, _ONNX_PATH)
    logger.info("[VAD] Silero VAD ONNX model downloaded")
    return _ONNX_PATH


class SileroVAD:
    """Silero VAD using ONNX runtime. Drop-in replacement for torch version.

    Accepts 512-sample float32 windows at 16kHz and returns speech probability.
    Maintains internal LSTM state for streaming use.
    """

    def __init__(self):
        import onnxruntime
        model_path = _download_onnx_model()
        opts = onnxruntime.SessionOptions()
        opts.inter_op_num_threads = 1
        opts.intra_op_num_threads = 1
        self._session = onnxruntime.InferenceSession(
            model_path, sess_options=opts
        )
        self.reset_states()
        logger.debug("[VAD] Silero VAD ONNX model loaded")

    def reset_states(self):
        """Reset LSTM hidden state and context buffer."""
        self._state = np.zeros((2, 1, 128), dtype=np.float32)
        self._context = np.zeros((1, CONTEXT_SAMPLES), dtype=np.float32)
        self._sr = np.array(SAMPLE_RATE, dtype=np.int64)

    def __call__(self, audio_window: np.ndarray) -> float:
        """Run VAD on a single 512-sample window. Returns speech probability [0, 1].

        Args:
            audio_window: float32 numpy array of exactly 512 samples.
        """
        if audio_window.ndim == 1:
            audio_window = audio_window.reshape(1, -1)

        # Prepend context (last 64 samples from previous window)
        x = np.concatenate([self._context, audio_window], axis=1).astype(np.float32)

        ort_inputs = {
            "input": x,
            "state": self._state,
            "sr": self._sr,
        }
        out, state = self._session.run(None, ort_inputs)

        # Update state and context for next call
        self._state = state
        self._context = audio_window[:, -CONTEXT_SAMPLES:]

        return float(out[0][0])
