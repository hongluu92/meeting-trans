# Brainstorm: Real-Time Multilingual Speech Translator

**Date:** 2026-03-19
**Status:** Agreed

---

## Problem Statement

Build a local web app that:
- Captures speech from microphone in real-time
- Auto-detects language (English, Japanese, Vietnamese)
- Translates to a user-selected target language (1 of the 3)
- Displays bilingual subtitles (original + translated)

**Use case:** Real-time interpreter for multilingual conversations.
**Deployment:** Local only (personal tool).

---

## Evaluated Approaches

### STT Options Evaluated

| Option | Verdict | Why |
|--------|---------|-----|
| Web Speech API | Rejected | No auto-detect, Chrome-only, sends audio to Google |
| Whisper v3-turbo + WhisperLiveKit | Viable | Real-time, auto-detect, MIT. But needs separate translation model |
| SenseVoice | Rejected | No Vietnamese support |
| Deepgram API | Rejected | Requires paid API, audio leaves device |
| **SeamlessM4T v2** | **Chosen** | Single model does STT + detect + translate. Simplest architecture |

### Translation Options Evaluated

| Option | Verdict | Why |
|--------|---------|-----|
| google-translate-api (unofficial) | Backup | Free, good quality, but needs internet + risk of blocking |
| Ollama + Qwen2.5:8b | Too heavy | Best JA↔VI quality but needs 8GB RAM for model alone |
| NLLB-200 CTranslate2 | Viable | Fast, good quality, but separate model = more complexity |
| GPT-4o mini | Rejected | Needs internet + API key |
| **SeamlessM4T v2** | **Chosen** | Handles translation in same model as STT |

### Architecture Options Evaluated

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **A: SeamlessM4T v2** | 1 model, simplest | 1-3s latency, CC-BY-NC | **Chosen** |
| B: Whisper + Ollama | Best quality | 13GB RAM, won't fit 8GB | Rejected |
| C: Whisper + NLLB | Fast (~800ms) | 2 services, more complexity | Backup |
| D: Full browser | Zero server | 2-5s latency, WebGPU crashes | Rejected |

---

## Final Recommended Solution

### Architecture: SeamlessM4T v2 (Single Model Pipeline)

```
Browser (React+Vite+TS) ←WebSocket→ FastAPI (Python) + SeamlessM4T v2
```

**Frontend:** React + Vite + TypeScript
- Subtitle/caption-style UI: running text with original + translation per utterance
- MediaRecorder API captures mic audio → sends binary chunks via WebSocket
- Target language selector dropdown (EN / JA / VI)
- Dark theme, minimal design

**Backend:** FastAPI + Python
- SeamlessM4T v2 with int8 quantization (~3GB RAM)
- WebSocket endpoint receives audio chunks
- Model processes: audio → detect language → transcribe → translate
- Returns JSON: `{detected_lang, source_text, translated_text, target_lang}`

**Communication:** WebSocket
- Binary audio upstream (16kHz PCM or WAV chunks)
- JSON text downstream

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + Vite + TypeScript |
| Styling | Tailwind CSS |
| Audio capture | MediaRecorder API (browser native) |
| Transport | WebSocket (native) |
| Backend | FastAPI (Python 3.11+) |
| ML Model | SeamlessM4T v2 large (int8 quantized) |
| ML Runtime | PyTorch + fairseq2 / seamless_communication |

---

## Implementation Considerations

### Performance
- Latency: ~1-3s per sentence (acceptable for interpreter use case)
- RAM: ~3GB for model (int8), fits 8GB machine with headroom
- First load: model download ~3GB (one-time, cached)
- MPS (Metal) acceleration on M-series Mac for faster inference

### Audio Handling
- Chunk audio by silence detection (VAD) or fixed intervals (~3-5s)
- 16kHz sample rate, mono channel
- Browser MediaRecorder → WebM/Opus → server converts to PCM
- Consider `silero-vad` for voice activity detection (cut silence)

### UI/UX
- Subtitle scroll: newest at bottom, auto-scroll
- Color-code by detected language (e.g., blue=EN, red=JA, green=VI)
- Show detected language label per utterance
- Interim/partial results while processing (spinner or "...")
- Export transcript button (save as .txt or .srt)

### Risks
1. **8GB RAM constraint** — int8 model + Python + browser may be tight. Mitigation: close other apps, use `torch.no_grad()`, set `max_input_audio_length`
2. **Vietnamese accuracy** — SeamlessM4T trained on less VI data than EN/JA. Mitigation: test early, consider NLLB fallback for VI translation
3. **JA↔VI quality** — hardest pair, less training data. Mitigation: test, fallback to Ollama if user upgrades RAM
4. **Audio chunking** — bad chunk boundaries cut words. Mitigation: use VAD (voice activity detection)
5. **CC-BY-NC license** — cannot commercialize. Fine for personal tool.

---

## Success Metrics

- [ ] App starts with single command (`make run` or similar)
- [ ] Mic capture works in Chrome/Edge
- [ ] Auto-detects EN, JA, VI speech correctly >90% of time
- [ ] Translates to selected target language
- [ ] Displays bilingual subtitles within 3s of speaking
- [ ] Runs on 8GB RAM Mac without crashing
- [ ] Clean, readable subtitle UI

---

## Next Steps

1. Create implementation plan with phases
2. Setup Python backend with SeamlessM4T v2
3. Build React frontend with mic capture + WebSocket
4. Integrate and test with real speech

---

## Research Reports

- [Web Speech API Research](./research/../reports/researcher-260319-web-speech-api.md)
- [Translation API Comparison](./research/../reports/researcher-260319-translation-api-comparison.md)
- [SOTA Open-Source STT Models](./research/../reports/researcher-260319-sota-open-source-stt-models.md)
- [Local Translation Models](./research/../reports/researcher-260319-local-translation-models.md)
