# Phase 2: Build Backend — FastAPI + SeamlessM4T v2

## Context Links
- [SeamlessM4T v2 HuggingFace](https://huggingface.co/facebook/seamless-m4t-v2-large)
- [seamless_communication GitHub](https://github.com/facebookresearch/seamless_communication)
- [Brainstorm Summary](./brainstorm-summary.md)

## Overview
- **Priority:** P1
- **Status:** Complete
- **Effort:** 4h
- Build FastAPI WebSocket server that receives audio chunks, runs SeamlessM4T v2 for STT + language detection + translation, returns bilingual results as JSON.

## Key Insights
- SeamlessM4T v2 `Translator` class from `seamless_communication` does speech-to-text translation in one call
- Model auto-downloads on first use (~3GB); cache at `~/.cache/huggingface/`
- int8 quantization via `torch.quantization.quantize_dynamic` or load with `dtype=torch.float16`
- Audio input: 16kHz mono WAV/PCM; browser sends WebM/Opus → server must convert
- `silero-vad` for voice activity detection — split audio by speech segments

## Requirements

### Functional
- WebSocket endpoint `/ws/translate` accepts binary audio chunks
- Detect source language automatically (EN/JA/VI)
- Transcribe source speech to text
- Translate to user-specified target language
- Return JSON: `{source_lang, source_text, target_lang, translated_text, timestamp}`

### Non-functional
- Latency < 3s per utterance on 8GB RAM machine
- Model loads once at startup, stays in memory
- Graceful error handling (corrupted audio, unsupported language, etc.)

## Architecture

```
Client WebSocket ──binary audio──► /ws/translate
                                      │
                                      ▼
                              ┌──────────────┐
                              │ Audio Buffer  │
                              │ + VAD check   │
                              └──────┬───────┘
                                     │ speech segment
                                     ▼
                              ┌──────────────┐
                              │ SeamlessM4T  │
                              │ v2 Translator│
                              │ (int8/fp16)  │
                              └──────┬───────┘
                                     │
                                     ▼
                              ┌──────────────┐
                              │ JSON result  │
                              │ {src, tgt,   │
                              │  text, trans} │
                              └──────────────┘
                                     │
Client WebSocket ◄──JSON response────┘
```

## Related Code Files

### Files to Create
- `/backend/app/main.py` — FastAPI app with WebSocket endpoint (modify skeleton)
- `/backend/app/model-loader.py` — Load & cache SeamlessM4T model
- `/backend/app/audio-processor.py` — Audio format conversion + VAD
- `/backend/app/translator.py` — Translation pipeline wrapper
- `/backend/app/websocket-handler.py` — WebSocket message handling logic

## Implementation Steps

1. **Model loader** (`model-loader.py`):
   ```python
   from seamless_communication.inference import Translator

   _translator = None

   def get_translator():
       global _translator
       if _translator is None:
           _translator = Translator(
               model_name_or_card="seamlessM4T_v2_large",
               vocoder_name_or_card="vocoder_v2",
               device=torch.device("cpu"),  # or "mps" for Apple Silicon
               dtype=torch.float16,
           )
       return _translator
   ```

2. **Audio processor** (`audio-processor.py`):
   - Accept WebM/Opus binary from browser
   - Convert to 16kHz mono PCM using `torchaudio` or `ffmpeg`
   - Buffer audio chunks until VAD detects speech end
   - Use `silero-vad` for voice activity detection:
     ```python
     model, utils = torch.hub.load('snakers4/silero-vad', 'silero_vad')
     ```
   - Return speech segments as tensors

3. **Translator wrapper** (`translator.py`):
   ```python
   LANG_MAP = {"en": "eng", "ja": "jpn", "vi": "vie"}

   async def translate_audio(audio_tensor, target_lang: str):
       translator = get_translator()
       # SeamlessM4T auto-detects source language
       translated_text, wav, meta = translator.predict(
           input=audio_tensor,
           task_str="s2tt",  # speech-to-text translation
           tgt_lang=LANG_MAP[target_lang],
       )
       source_text, _, src_meta = translator.predict(
           input=audio_tensor,
           task_str="asr",  # just transcribe (source lang)
           tgt_lang=meta.src_lang,
       )
       return {
           "source_lang": meta.src_lang,
           "source_text": str(source_text),
           "target_lang": target_lang,
           "translated_text": str(translated_text),
       }
   ```

4. **WebSocket handler** (`websocket-handler.py`):
   - Accept connection with `target_lang` query param
   - Receive binary audio chunks
   - Buffer in `AudioProcessor` until speech segment ready
   - Run translation, send JSON result back
   - Handle disconnect gracefully

5. **Main app** (`main.py`):
   ```python
   from fastapi import FastAPI, WebSocket
   import asyncio

   app = FastAPI()

   @app.on_event("startup")
   async def load_model():
       # Pre-load model to avoid first-request latency
       get_translator()

   @app.websocket("/ws/translate")
   async def websocket_translate(ws: WebSocket):
       await ws.accept()
       target_lang = ws.query_params.get("target_lang", "en")
       # ... handle audio stream
   ```

6. **Add CORS middleware** for local dev:
   ```python
   app.add_middleware(CORSMiddleware, allow_origins=["*"])
   ```

7. Test with a WAV file:
   ```bash
   python -c "
   from app.translator import translate_audio
   import torchaudio
   wav, sr = torchaudio.load('test.wav')
   result = translate_audio(wav, 'vi')
   print(result)
   "
   ```

## Todo List

- [x] Implement model loader with lazy init + dtype optimization
- [x] Implement audio processor (WebM→PCM conversion)
- [x] Integrate silero-vad for speech segmentation
- [x] Implement translator wrapper (s2tt + asr)
- [x] Implement WebSocket handler with audio buffering
- [x] Wire up FastAPI main.py with startup model loading
- [x] Add CORS middleware
- [x] Test with sample WAV file for each language (EN/JA/VI)
- [x] Verify RAM usage stays under 5GB
- [x] Handle edge cases (silence, very short audio, bad format)

## Success Criteria

- WebSocket accepts audio and returns translation JSON
- Auto-detects EN, JA, VI correctly
- Translation output makes sense (manual check)
- RAM usage ≤ 5GB with model loaded
- No crashes on malformed audio input

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| SeamlessM4T v2 doesn't fit 8GB RAM | Medium | Critical | Use fp16 or distilled model; test `seamlessM4T_medium` as fallback |
| `fairseq2` incompatible with macOS ARM | Medium | High | Build from source or use Docker |
| Audio conversion breaks (WebM→PCM) | Low | Medium | Use `ffmpeg` as subprocess fallback |
| VAD too aggressive (cuts mid-word) | Medium | Medium | Tune VAD threshold; add overlap buffer |
| Model inference blocks event loop | High | High | Run in `asyncio.to_thread()` or process pool |

## Security Considerations
- Audio stays local (no external API calls)
- WebSocket accepts only from localhost (CORS restriction)
- No user auth needed (local tool)
- Validate audio size to prevent OOM (max 30s per chunk)

## Implementation Notes

**Deviations from plan:**
- Used float32 on CPU instead of float16 (float16 requires CUDA, only CPU available)
- Language detection implemented via multi-language ASR comparison (no auto-detect in SeamlessM4T API)
- `predict()` returns 2 values (translated_text, wav) not 3 (corrected from plan spec)
- Task strings are uppercase: "S2TT" (speech-to-text translation), "ASR" (automatic speech recognition)

## Next Steps
- After backend works standalone, integrate with frontend (Phase 3)
- If RAM too high, try `seamlessM4T_medium` model
