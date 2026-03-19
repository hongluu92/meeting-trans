# SeamlessM4T v2 API Research Report

**Date:** 2026-03-19
**Scope:** `seamless_communication` Python library — Translator class, s2tt, ASR, audio format, lang detection, quantization, silero-vad integration

---

## 1. Import Paths and Class Names

```python
# Primary high-level API (use this)
from seamless_communication.inference import Translator

# Low-level HuggingFace Transformers alternative
from transformers import AutoProcessor, SeamlessM4Tv2Model
from transformers import SeamlessM4Tv2ForTextToText
```

The `Translator` class lives in `seamless_communication.inference`. It extends `torch.nn.Module`.

---

## 2. Model Loading — Translator.__init__

Full signature (from source):

```python
def __init__(
    self,
    model_name_or_card: Union[str, AssetCard],
    vocoder_name_or_card: Union[str, AssetCard, None],
    device: Device,
    text_tokenizer: Optional[TextTokenizer] = None,
    apply_mintox: bool = False,
    dtype: DataType = torch.float16,
    input_modality: Optional[Modality] = None,
    output_modality: Optional[Modality] = None,
)
```

**Minimal instantiation for v2 (GPU):**

```python
import torch
from seamless_communication.inference import Translator

translator = Translator(
    model_name_or_card="seamlessM4T_v2_large",
    vocoder_name_or_card="vocoder_v2",
    device=torch.device("cuda:0"),
    dtype=torch.float16,
)
```

**CPU fallback:**

```python
translator = Translator(
    model_name_or_card="seamlessM4T_v2_large",
    vocoder_name_or_card="vocoder_v2",
    device=torch.device("cpu"),
    dtype=torch.float32,   # float16 auto-converts to float32 on CPU
)
```

**Model name / vocoder pairing:**

| Model card string       | Vocoder card string  | Notes              |
|-------------------------|----------------------|--------------------|
| `seamlessM4T_v2_large`  | `vocoder_v2`         | 2.3B, recommended  |
| `seamlessM4T_large`     | `vocoder_36langs`    | v1, 2.3B           |
| `seamlessM4T_medium`    | `vocoder_36langs`    | v1, 1.2B           |

**`apply_mintox=True`** enables built-in toxicity filter — used in Meta's demo, optional.

---

## 3. Speech-to-Text Translation (S2TT) — Exact Signature

```python
def predict(
    self,
    input: Union[str, Tensor, SequenceData],   # file path, tensor, or SequenceData
    task_str: str,                              # "S2TT", "ASR", "S2ST", "T2ST", "T2TT"
    tgt_lang: str,                             # ISO 639-3 target language code
    src_lang: Optional[str] = None,            # ISO 639-3 source lang (text tasks only)
    text_generation_opts: Optional[SequenceGeneratorOptions] = None,
    unit_generation_opts: Optional[SequenceGeneratorOptions] = None,
    spkr: Optional[int] = -1,
    sample_rate: int = 16000,                  # used when input is a Tensor
    unit_generation_ngram_filtering: bool = False,
    duration_factor: float = 1.0,
    prosody_encoder_input: Optional[SequenceData] = None,
    src_text: Optional[StringLike] = None,
) -> Tuple[List[StringLike], Optional[BatchedSpeechOutput]]
```

**S2TT usage:**

```python
text_output, _ = translator.predict(
    input="path/to/audio.wav",   # or Tensor
    task_str="S2TT",
    tgt_lang="vie",              # translate speech -> Vietnamese text
)
# text_output is List[StringLike]; get string via str(text_output[0])
translated_text = str(text_output[0])
```

**Return values:**
- `text_output`: `List[StringLike]` — translated/transcribed text segments
- second element: `Optional[BatchedSpeechOutput]` — audio output (None for S2TT/ASR)
  - `speech_output.audio_wavs[0][0]` — waveform tensor when present
  - `speech_output.sample_rate` — output sample rate

---

## 4. ASR (Automatic Speech Recognition / Transcription)

```python
text_output, _ = translator.predict(
    input="path/to/audio.wav",
    task_str="ASR",
    tgt_lang="jpn",   # NOTE: for ASR, tgt_lang = source language of the speech
)
transcription = str(text_output[0])
```

**Critical quirk:** For ASR, `tgt_lang` is set to the **source** language (the language being spoken). This is NOT the translation target — it tells the model what language to transcribe in. No separate `src_lang` param is used for speech tasks.

CLI equivalent: `m4t_predict audio.wav --task asr --tgt_lang jpn`

---

## 5. Audio Input Format

**Required:** 16 kHz mono waveform.

**From file path (simplest):**

```python
# Just pass the file path string — Translator handles loading internally
text_output, _ = translator.predict("audio.wav", "S2TT", tgt_lang="vie")
```

**From tensor (e.g., live microphone buffer):**

```python
import torchaudio

# Load and resample
waveform, orig_sr = torchaudio.load("audio.wav")
waveform = torchaudio.functional.resample(waveform, orig_freq=orig_sr, new_freq=16_000)
# waveform shape: (channels, samples) or (samples,)

text_output, _ = translator.predict(
    input=waveform,       # Tensor accepted directly
    task_str="S2TT",
    tgt_lang="vie",
    sample_rate=16000,    # must match the tensor's actual rate
)
```

**Tensor shape:** accepts both `(samples,)` and `(1, samples)` — internally handles transposition. Audio is converted to Mel filterbank features internally via `AudioDecoder`.

**Max recommended duration:** 60 seconds per chunk (enforced in Meta's demo; longer audio may degrade quality).

---

## 6. Language Detection — Does Auto-Detect Work?

**No native auto-detection.** `src_lang` is `Optional[str] = None` but it is only used for **text input tasks** (T2ST, T2TT). For speech input (S2TT, ASR, S2ST), the model infers the source language from the audio internally via its encoder — you never pass `src_lang` for speech tasks.

**Practical implication:**
- S2TT: no need to specify `src_lang` — encoder handles it
- ASR: pass the known language as `tgt_lang` (must be known upfront)
- T2TT / T2ST: `src_lang` is **required** (text has no audio signal to detect from)

**Language codes (ISO 639-3) for target languages:**

| Language   | Code  | Speech input | Text input | Speech output | Text output |
|------------|-------|:---:|:---:|:---:|:---:|
| English    | `eng` | Y   | Y   | Y   | Y   |
| Japanese   | `jpn` | Y   | Y   | Y   | Y   |
| Vietnamese | `vie` | Y   | Y   | Y   | Y   |

All three are fully supported in v2 for all modalities.

---

## 7. Quantization Options

**Built-in `seamless_communication` library:** No int8/4-bit quantization support. Only dtype options:
- `torch.float16` — default, GPU recommended
- `torch.float32` — required for CPU (auto-applied if float16 on CPU)
- `torch.bfloat16` — theoretically passable as `dtype` but untested officially

**Via HuggingFace Transformers API (alternative path):**

```python
from transformers import AutoProcessor, SeamlessM4Tv2Model, BitsAndBytesConfig

quantization_config = BitsAndBytesConfig(load_in_8bit=True)
model = SeamlessM4Tv2Model.from_pretrained(
    "facebook/seamless-m4t-v2-large",
    quantization_config=quantization_config,
    device_map="auto",
)
```

This uses `bitsandbytes` int8 — reduces VRAM from ~10GB to ~5GB but requires GPU. The Transformers API has a lower-level interface (requires manual processor calls) compared to the `Translator` class.

**Practical trade-off:**
- `Translator` (seamless_communication): simpler API, float16 only, ~10GB VRAM
- `SeamlessM4Tv2Model` (transformers): int8 possible, more boilerplate, same quality

---

## 8. Silero-VAD Integration Pattern

Silero-VAD is used as a **pre-processing gate** — detect speech segments, extract them, then pass each segment to SeamlessM4T for S2TT/ASR. There is no native integration; it's a manual pipeline.

### 8a. Silero-VAD API

```python
import torch

# Load model (downloads ~1.8MB ONNX, runs on CPU)
model, utils = torch.hub.load(
    repo_or_dir='snakers4/silero-vad',
    model='silero_vad',
    force_reload=False,
)
(get_speech_timestamps, _, read_audio, *_) = utils

# Batch mode: detect all speech segments in a file
wav = read_audio('audio.wav', sampling_rate=16000)
# wav shape: (samples,), float32, range [-1, 1]

speech_timestamps = get_speech_timestamps(
    wav,
    model,
    sampling_rate=16000,
    threshold=0.5,              # speech probability threshold
    min_silence_duration_ms=100,
    speech_pad_ms=30,
)
# Returns: [{'start': int, 'end': int}, ...] in samples (not ms)
```

### 8b. Streaming VAD (real-time)

```python
from silero_vad import VADIterator  # or via torch.hub utils

vad_iterator = VADIterator(
    model,
    threshold=0.5,
    sampling_rate=16000,
    min_silence_duration_ms=250,
    speech_pad_ms=30,
)

# chunk_size must be 512 samples at 16kHz (= 32ms per chunk)
CHUNK_SIZE = 512

for chunk in audio_stream:    # chunk: Tensor of shape (512,)
    speech_dict = vad_iterator(chunk, return_seconds=True)
    if speech_dict:
        if 'start' in speech_dict:
            # speech started — begin buffering
            buffer = []
        if 'end' in speech_dict:
            # speech ended — send buffer to SeamlessM4T
            audio_segment = torch.cat(buffer)
            text_output, _ = translator.predict(
                input=audio_segment,
                task_str="S2TT",
                tgt_lang="vie",
                sample_rate=16000,
            )
            print(str(text_output[0]))
```

### 8c. Full Pipeline: VAD → SeamlessM4T

```python
import torch, torchaudio
from seamless_communication.inference import Translator

# 1. Load models
vad_model, utils = torch.hub.load('snakers4/silero-vad', 'silero_vad')
(get_speech_timestamps, _, read_audio, *_) = utils

translator = Translator(
    "seamlessM4T_v2_large",
    "vocoder_v2",
    device=torch.device("cuda:0"),
    dtype=torch.float16,
)

# 2. Load and detect speech
wav = read_audio("input.wav", sampling_rate=16000)  # (samples,)
segments = get_speech_timestamps(wav, vad_model, sampling_rate=16000)

# 3. Translate each segment
for seg in segments:
    chunk = wav[seg['start']:seg['end']]  # slice by sample index
    text_output, _ = translator.predict(
        input=chunk.unsqueeze(0),  # (1, samples)
        task_str="S2TT",
        tgt_lang="vie",
        sample_rate=16000,
    )
    print(str(text_output[0]))
```

---

## Summary Table

| Topic | Detail |
|---|---|
| Import | `from seamless_communication.inference import Translator` |
| Model (v2) | `"seamlessM4T_v2_large"` |
| Vocoder (v2) | `"vocoder_v2"` |
| GPU dtype | `torch.float16` |
| CPU dtype | `torch.float32` (auto-converted) |
| Audio rate | 16000 Hz required |
| Audio shape | `(samples,)` or `(1, samples)` |
| S2TT call | `predict(audio, "S2TT", tgt_lang="vie")` |
| ASR call | `predict(audio, "ASR", tgt_lang="jpn")` — tgt_lang = spoken language |
| Lang detect | No auto-detect for ASR; S2TT encoder infers src implicitly |
| EN code | `"eng"` |
| JA code | `"jpn"` |
| VI code | `"vie"` |
| Int8 quant | Not in Translator API; possible via HF Transformers + bitsandbytes |
| VAD chunk | 512 samples @ 16kHz = 32ms per VADIterator call |
| VAD return | `[{'start': int, 'end': int}]` in sample indices |

---

## Unresolved Questions

1. **S2TT with multilingual audio (EN+JA mixed):** Does the encoder correctly switch language per-segment or does it assume uniform language throughout a clip? Not documented.
2. **ASR without knowing src language:** No path to auto-detect source language for transcription — must be known upfront. No language-ID API exposed in `seamless_communication` library (would need separate langid step).
3. **`torch.bfloat16` support:** Passable as `dtype` but not officially tested or documented; may behave like float32 fallback on some hardware.
4. **int8 via bitsandbytes + Translator class:** No evidence this combination works. Only the HF Transformers path has confirmed int8 support.
5. **Max tensor length for predict():** Demo enforces 60s cap in preprocessing. Whether the model hard-fails or degrades beyond 60s is unverified.

---

## Sources

- [facebookresearch/seamless_communication GitHub](https://github.com/facebookresearch/seamless_communication)
- [docs/m4t/README.md (raw)](https://raw.githubusercontent.com/facebookresearch/seamless_communication/main/docs/m4t/README.md)
- [demo/m4tv2/app.py](https://github.com/facebookresearch/seamless_communication/blob/main/demo/m4tv2/app.py)
- [facebook/seamless-m4t-v2-large — HuggingFace](https://huggingface.co/facebook/seamless-m4t-v2-large)
- [SeamlessM4T-v2 — HuggingFace Transformers docs](https://huggingface.co/docs/transformers/en/model_doc/seamless_m4t_v2)
- [snakers4/silero-vad GitHub](https://github.com/snakers4/silero-vad)
- [Silero VAD — PyTorch Hub](https://pytorch.org/hub/snakers4_silero-vad_vad/)
