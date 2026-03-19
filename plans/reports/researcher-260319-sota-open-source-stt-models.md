# SOTA Open-Source STT Models — Early 2026

Report date: 2026-03-19
Focus: Real-time multilingual interpreter app (EN / JA / VI)

---

## Model Inventory

### 1. OpenAI Whisper large-v3 / large-v3-turbo
- **Architecture**: Encoder-decoder Transformer. large-v3 = 1.5B params; turbo = 809M (decoder pruned from 32→4 layers)
- **Languages**: 99+ incl. EN, JA, VI
- **Real-time/Streaming**: Not natively — requires chunking (faster-whisper or WhisperLiveKit layers). Turbo RTFx ~216x
- **Auto-detect language**: YES (per-segment lid token)
- **WER (HF Open ASR, avg)**: large-v3 ~7.4%, turbo ~7.75% — <1% gap
- **Browser (WebGPU/WASM)**: YES via transformers.js v3/v4; whisper-tiny/small practical; large slow
- **License**: MIT
- **Notes**: Whisper v4 reported late 2025 — adds native diarization + streaming, EN WER ~3.2%; treat as unverified until official OpenAI release confirmed

### 2. Faster-Whisper (SYSTRAN)
- **Architecture**: Whisper weights via CTranslate2 int8 quantization; same model quality
- **Languages**: Inherits Whisper — 99+ incl. EN, JA, VI
- **Real-time/Streaming**: Up to 8x faster than openai/whisper; supports streaming via chunked VAD. ~16s to transcribe 13min audio
- **Auto-detect language**: YES (Whisper LID)
- **WER**: Same as underlying Whisper model
- **Browser**: NO — Python/server only
- **License**: MIT
- **Notes**: De-facto production deployment choice for Whisper on CPU/GPU. Works with WhisperLiveKit

### 3. WhisperLiveKit / whisper-streaming
- **Architecture**: Wrapper around faster-whisper + SimulStreaming (AlignAtt policy) + optional Sortformer diarization
- **Languages**: Inherits Whisper — EN, JA, VI supported
- **Real-time/Streaming**: YES — <200ms latency with large-v3 + SimulStreaming backend; self-adaptive buffering
- **Auto-detect language**: YES (Whisper LID passed through)
- **WER**: Same as underlying model
- **Browser**: NO — Python WebSocket server; browser connects via WS
- **License**: MIT (WhisperLiveKit); Apache 2.0 (whisper-streaming core)
- **Notes**: Best open-source real-time streaming solution as of early 2026. Multi-user FastAPI server. Production-ready with Docker

### 4. NVIDIA NeMo Canary-1b-v2 / Canary Qwen 2.5B
- **Architecture**: FastConformer encoder + multi-task decoder. Canary-1b-v2 = 1B; Canary Qwen = 2.5B
- **Languages**: 25 European languages — **NO JA, NO VI**
- **Real-time/Streaming**: RTFx ~418x (Canary Qwen); not a streaming-first model
- **Auto-detect language**: Limited to 25 supported langs
- **WER**: Canary Qwen 5.63% (leaderboard #1 overall); Canary-1b-v2 ~6.67%
- **Browser**: NO
- **License**: CC-BY-4.0
- **Notes**: Best accuracy for EN only. DISQUALIFIED for JA/VI use case

### 5. NVIDIA NeMo Parakeet-TDT-0.6b-v3 / 1.1B
- **Architecture**: TDT (Token-and-Duration Transducer). 0.6B and 1.1B variants
- **Languages**: EN primary; specialized Vietnamese+English code-switch variant exists separately
- **Real-time/Streaming**: RTFx >2,000x — fastest open-source model; designed for real-time
- **Auto-detect language**: NO
- **WER**: ~6.05–8.0% EN
- **Browser**: NO
- **License**: CC-BY-4.0
- **Notes**: Extreme speed for EN. VI code-switch variant exists but is separate fine-tune, not general multilingual. NO native JA

### 6. Meta SeamlessM4T-v2-large
- **Architecture**: UnitY2 — unified speech+text encoder/decoder. ~2.3B params
- **Languages**: 100+ speech input langs incl. EN, JA, VI; outputs speech+text in 35 languages
- **Real-time/Streaming**: NOT designed for streaming; batch-oriented
- **Auto-detect language**: YES (built-in LID)
- **WER**: Outperforms Whisper-large-v3 on low-resource languages; no specific JA/VI public WER
- **Browser**: NO — Python/server
- **License**: CC-BY-NC-4.0 (non-commercial restriction)
- **Notes**: Unique: ASR + speech translation in one model. NC license limits commercial use. High VRAM (~8–12GB). Better for translation pipeline than pure STT

### 7. Meta MMS (Massively Multilingual Speech)
- **Architecture**: wav2vec 2.0 fine-tuned; 300M–1B params
- **Languages**: 1,107 languages ASR; 1,406 pretrained; EN, JA, VI all covered
- **Real-time/Streaming**: NO streaming support; batch inference
- **Auto-detect language**: YES (4,017-lang LID model)
- **WER**: Halves Whisper WER on 54 FLEURS languages on average; low-resource lang focus
- **Browser**: NO
- **License**: CC-BY-NC-4.0 (non-commercial)
- **Notes**: Breadth model, not accuracy leader for EN/JA/VI specifically. NC license. Best for rare languages, not priority here

### 8. SenseVoice-Small (FunAudioLLM / Alibaba)
- **Architecture**: Custom encoder; 26M params (Small)
- **Languages**: ZH, EN, JA, KO, Cantonese — **NO VI**
- **Real-time/Streaming**: Partial — 5–15x faster than Whisper; supports chunked inference; not a true streaming solution
- **Auto-detect language**: YES (built-in LID for 5 langs)
- **WER**: Claims to surpass Whisper; specific JA WER not publicly published
- **Browser**: Possible via ONNX export but not officially supported
- **License**: Apache 2.0
- **Notes**: Unique: outputs emotion tags (happy/sad/angry/neutral) + audio event detection alongside transcript. Excellent for JA. DISQUALIFIED for VI (not supported)

### 9. Moonshine (Useful Sensors)
- **Architecture**: Custom lightweight encoder-decoder; tiny=27M, base=~60M
- **Languages**: EN only (moonshine-tiny-vi is a separate community fine-tune for VI)
- **Real-time/Streaming**: YES — designed for edge/real-time; outperforms Whisper Tiny/Small at same size
- **Auto-detect language**: NO
- **WER**: Beats Whisper tiny/small on EN
- **Browser**: YES — runs in browser via ONNX/WASM; transformers.js compatible
- **License**: Apache 2.0
- **Notes**: Excellent for EN edge/embedded. Base model not multilingual. Separate VI fine-tune unvetted for production

### 10. IBM Granite Speech 3.3 8B / 2B
- **Architecture**: Speech encoder + Granite LLM decoder; 8B and 2B variants
- **Languages**: EN, FR, DE, ES, PT (ASR); EN↔JA and EN↔ZH translation only (not JA ASR natively)
- **Real-time/Streaming**: Not streaming-first; batch-oriented LLM-based approach
- **Auto-detect language**: Limited to supported 5 ASR langs
- **WER**: ~5.85% HF leaderboard (near top for EN)
- **Browser**: NO — 8B requires GPU server
- **License**: Apache 2.0
- **Notes**: DISQUALIFIED — no native JA/VI ASR. Only translation to/from those languages

---

## Comparison Table

| Model | EN WER | JA | VI | Streaming | Lang Auto-detect | Browser | License |
|---|---|---|---|---|---|---|---|
| **Whisper large-v3** | ~7.4% | YES | YES | via wrapper | YES | YES (small only) | MIT |
| **Whisper large-v3-turbo** | ~7.75% | YES | YES | via wrapper | YES | YES (small only) | MIT |
| **Faster-Whisper** | same as Whisper | YES | YES | YES (chunked) | YES | NO | MIT |
| **WhisperLiveKit** | same as Whisper | YES | YES | YES <200ms | YES | NO (server) | MIT/Apache |
| Canary Qwen 2.5B | 5.63% | NO | NO | NO | NO | NO | CC-BY-4.0 |
| Parakeet-TDT 1.1B | ~6-8% | NO | partial* | YES (fast) | NO | NO | CC-BY-4.0 |
| SeamlessM4T-v2 | competitive | YES | YES | NO | YES | NO | CC-BY-NC |
| Meta MMS | low-resource best | YES | YES | NO | YES | NO | CC-BY-NC |
| **SenseVoice-Small** | surpasses Whisper | YES | NO | partial | YES (5 langs) | partial | Apache 2.0 |
| **Moonshine base** | beats Whisper tiny | NO | community | YES | NO | YES | Apache 2.0 |
| IBM Granite 3.3 8B | 5.85% | translate only | NO | NO | NO | NO | Apache 2.0 |

*Parakeet VI = separate fine-tune, not the main model

**Bold** = viable for EN/JA/VI real-time app

---

## Recommendation for EN/JA/VI Real-Time Multilingual Interpreter

### Winner: faster-whisper + WhisperLiveKit (large-v3-turbo model)

Rationale:
1. **Only stack that covers EN + JA + VI with real-time streaming** in a single model
2. large-v3-turbo hits <200ms latency via WhisperLiveKit SimulStreaming; acceptable for interpreter UX
3. MIT license — no commercial restrictions
4. Whisper's language auto-detection works per-segment — critical for multilingual scenarios where speaker switches language mid-stream
5. Proven in production; Docker deployment; multi-user WebSocket server

### Runner-up: SenseVoice-Small (JA/EN legs only)
If VI is not needed or handled separately, SenseVoice adds emotion detection and is significantly faster. But VI absence is a hard blocker for a JA/EN/VI interpreter.

### For browser-only (offline/private) deployment:
- transformers.js v4 + Whisper large-v3-turbo via WebGPU — viable on modern desktop (Chrome/Edge); latency ~500–1500ms per chunk; not true real-time but acceptable for async transcription
- Moonshine base (EN only) for fastest browser performance on English leg

### Avoid for this use case:
- Canary/Parakeet: No JA, no VI
- SeamlessM4T / MMS: Non-commercial license; batch-only
- IBM Granite: No native JA/VI ASR
- Moonshine base: English only

---

## Architecture Decision (Server vs Browser)

For a real-time interpreter app:
- **Server-side (recommended)**: faster-whisper + WhisperLiveKit WebSocket server → best latency, full model quality, all 3 languages
- **Browser-only fallback**: transformers.js v4 + Whisper turbo via WebGPU → works on ~85-90% of browsers (Chrome/Edge/Safari); ~1-2s latency; no server cost; acceptable for async mode

---

## Unresolved Questions

1. **Whisper v4 accuracy**: Claimed 3.2% EN WER + native streaming/diarization, but OpenAI has not published an official release page or paper as of this writing. Treat as unconfirmed.
2. **SenseVoice JA WER**: Claims to "surpass Whisper" for JA but no independent benchmark published for JA specifically.
3. **VI accuracy gap**: Whisper large-v3-turbo VI WER not published in isolation. Tonal language background noise sensitivity (noted in memory) means VI may be significantly worse than EN in noisy conditions — needs empirical testing.
4. **Moonshine-tiny-vi**: Community fine-tune quality unvetted; unknown if production-suitable.
5. **WhisperLiveKit multi-language mid-stream**: Per-segment language switching (EN→JA→VI) not confirmed working correctly — needs testing with interleaved multilingual audio.

---

## Sources
- [Northflank: Best open-source STT 2026 benchmarks](https://northflank.com/blog/best-open-source-speech-to-text-stt-model-in-2026-benchmarks)
- [HF: whisper-large-v3-turbo](https://huggingface.co/openai/whisper-large-v3-turbo)
- [SYSTRAN/faster-whisper GitHub](https://github.com/SYSTRAN/faster-whisper)
- [QuentinFuxa/WhisperLiveKit GitHub](https://github.com/QuentinFuxa/WhisperLiveKit)
- [nvidia/canary-1b-v2 HF](https://huggingface.co/nvidia/canary-1b-v2)
- [nvidia/parakeet-tdt-0.6b-v3 HF](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3)
- [NVIDIA Blog: Canary/Parakeet multilingual](https://developer.nvidia.com/blog/new-standard-for-speech-recognition-and-translation-from-the-nvidia-nemo-canary-model/)
- [facebook/seamless-m4t-v2-large HF](https://huggingface.co/facebook/seamless-m4t-v2-large)
- [FunAudioLLM/SenseVoice GitHub](https://github.com/FunAudioLLM/SenseVoice)
- [UsefulSensors/moonshine GitHub](https://github.com/usefulsensors/moonshine)
- [IBM Granite Speech 3.3](https://www.ibm.com/new/announcements/ibm-granite-3-3-speech-recognition-refined-reasoning-rag-loras)
- [transformers.js v4 preview](https://huggingface.co/blog/transformersjs-v4)
- [Realtime Whisper WebGPU demo](https://github.com/huggingface/transformers.js-examples/tree/main/realtime-whisper-webgpu)
