# Local/Open-Source Translation Models: EN / JA / VI
**Date:** 2026-03-19
**Focus:** Free/offline-capable solutions; JA↔VI quality; M2 Mac viability

---

## TL;DR Decision Table

| Model | JA↔VI Quality | M2 Latency | RAM | Local? | Browser? | License |
|-------|--------------|-----------|-----|--------|----------|---------|
| **SeamlessM4T v2** (2.3B) | Good | ~1–3s/sentence | ~5GB fp16 | Yes (Python) | No | CC-BY-NC 4.0 |
| **NLLB-200-distilled-600M** | Good | ~200–500ms | ~1.2GB | Yes | Yes (transformers.js) | CC-BY-NC 4.0 |
| **NLLB-200 3.3B** | Better | ~1–2s | ~7GB | Yes (CTranslate2) | No (too large) | CC-BY-NC 4.0 |
| **MADLAD-400 3B** | Good | ~1–2s | ~6GB (fp16) / ~1.5GB (q2) | Yes | No | Apache 2.0 |
| **Opus-MT ja-vi / vi-ja** | Poor–Fair | <100ms | ~300MB | Yes | Yes (transformers.js) | Apache 2.0 |
| **Qwen2.5:7b (Ollama)** | Very Good | 500ms–2s TTFT | 8GB | Yes | No | Apache 2.0 |
| **Qwen3:8b (Ollama)** | Very Good | 500ms–2s TTFT | 8GB | Yes | No | Apache 2.0 |
| **Gemma3:9b (Ollama)** | Good | ~1–2s TTFT | 9–10GB | Yes | No | Gemma ToS |

---

## 1. Ollama LLMs for Translation

### Best Models (ranked for JA/VI)

**Qwen2.5:7b / Qwen3:8b** — top choice for JA↔VI
- Both natively support JA + VI (confirmed, see MEMORY.md)
- Qwen-MT (Alibaba's specialized version) outperforms GPT-4.1-mini on translation benchmarks; Qwen3 is the open-weight base of that line
- On M2: ~18–22 tok/s (Q4_K_M), TTFT ~500ms–1.5s
- 7B Q4 needs ~4.5GB RAM; 7B Q8 needs ~8GB — runs fine on 16GB M2 Mac
- `ollama pull qwen2.5:7b` or `qwen3:8b`

**Gemma3:9b** — Google's multilingual model, 140+ languages
- Good quality, slightly less optimized for CJK/VI than Qwen
- 9B needs ~10GB RAM — tight on 16GB M2

**NOT recommended via Ollama:**
- Llama 3.x — limited Japanese tokenization; VI support inconsistent
- Mistral — weak JA/VI; primarily EN/EU languages

### Latency on M2 Mac
- Q4_K_M 7B: 18–22 tok/s → ~100-char translation ≈ 2–3s total (with streaming)
- MLX backend (via `mlx-lm`) is 30–50% faster than Ollama on Apple Silicon
- NOT suitable for keystroke real-time; use 500ms+ debounce at sentence level

---

## 2. SeamlessM4T v2 (Meta)

### The "One Model Does All" Answer: YES, with caveats

SeamlessM4T v2 is a single model capable of:
- **Speech input → language auto-detected → text translation → speech output**
- Tasks supported: S2ST (speech-to-speech), S2TT (speech-to-text), T2ST, T2TT, ASR
- **JA and VI: both confirmed in 101-language speech input list**
- Speech OUTPUT supports 35 languages — **EN, JA, VI are all included**

### So: Can it replace STT + translate in one shot?

Yes. `model.generate(audio_inputs, tgt_lang="vie")` returns translated text (or audio).
No separate STT or translation step needed. Language detection is implicit from the encoder.

### Sizes and RAM

| Variant | Params | RAM (fp16) | RAM (int8 CT2) |
|---------|--------|-----------|----------------|
| seamless-m4t-v2-large | 2.3B | ~5–6GB | ~3GB |
| seamless-m4t-medium | 1.2B | ~3GB | ~1.5GB |

- **M2 Mac: large variant runs on CPU with ~6GB RAM** — slow but feasible
- GPU/MPS via PyTorch: considerably faster (~3–5x)
- No ONNX / browser-capable export as of 2026-03

### Translation Quality (JA↔VI)
- Trained on massive multilingual corpus including CommonVoice, VoxPopuli
- Quality for EN↔JA and EN↔VI: competitive with NLLB-3.3B
- JA↔VI direct: limited parallel training data — expect NLLB-3.3B level quality (~BLEU 20–30 range), not LLM-level

### Verdict
Best for: **Speech → translated text (or speech) in one call.** Eliminates the Whisper + translation model stack.
Not for: browser deployment; commercial use (NC license); production without GPU.

---

## 3. NLLB-200 (Meta No Language Left Behind)

### Overview
- 200 languages including JA and VI
- Direct JA↔VI translation (not pivot through EN)
- HuggingFace's most-downloaded translation model (600M variant)

### Variants

| Model | Params | Size | RAM | Best For |
|-------|--------|------|-----|---------|
| distilled-600M | 600M | ~1.2GB | ~2GB | Browser, edge, fast local |
| distilled-1.3B | 1.3B | ~2.5GB | ~4GB | Balanced quality/speed |
| 3.3B | 3.3B | ~7GB | ~8GB | Best quality, server |

### JA↔VI Quality
- 600M: BLEU ~20–25 for JA↔VI (estimated from Flores-200 results)
- 3.3B: BLEU ~25–32 — best in class for pure NMT on this pair
- Outperforms Opus-MT significantly for JA↔VI (direct model vs. pivot)

### Local Inference (M2 Mac)

**With CTranslate2 (recommended for Python server):**
- `pip install ctranslate2`; convert once: `ct2-opus-mt-converter` / `ct2-nllb-converter`
- int8 quantization: 2–4x speedup vs. raw HuggingFace, 50% RAM reduction
- 600M int8: ~500ms/sentence on M2 CPU; ~100ms with MPS (Metal)
- 1.3B int8: ~800ms CPU; ~200ms MPS

**In browser via transformers.js:**
- `Xenova/nllb-200-distilled-600M` — confirmed working (ONNX quantized)
- First load: downloads ~300MB to IndexedDB (cached after)
- Inference: ~1–3s/sentence on CPU (WASM); ~500ms–1s with WebGPU
- WebGPU: still crashy on translation pipeline as of early 2026 (GitHub issue #1380, #1518)
- **Recommendation: use WASM fallback for stability**

### License: CC-BY-NC 4.0 — **no commercial use**

---

## 4. MADLAD-400 (Google)

### Overview
- 400+ languages; T5 architecture
- Variants: 3B, 7B, 10B
- Apache 2.0 license — **commercially usable**

### Quality vs. NLLB
- MADLAD-400-3B slightly outperforms NLLB-3.3B on entity/named-noun transfer accuracy
- For general translation quality: roughly equivalent to NLLB-3.3B on high-resource pairs
- JA↔VI: similar BLEU range (~25–30 for 3B)
- NOT available in browser (no ONNX conversion publicly maintained)

### Local Inference (M2 Mac)
- 3B fp16: ~6GB RAM, ~1–2s/sentence CPU
- 3B GGUF q2: ~1.5GB RAM (significant quality loss at q2)
- q4 GGUF: ~2GB RAM, acceptable quality — use via llama.cpp or Ollama (if GGUF available)
- **No official GGUF — conversion required; community GGUFs exist on HuggingFace**

### Verdict
Best for: production server deployment where commercial license matters. Comparable quality to NLLB-3.3B.
Skip if: you need browser runtime or have RAM < 8GB.

---

## 5. Opus-MT (Helsinki-NLP)

### Overview
- 1,500+ directional models (one model per language pair, ~300MB each)
- MarianMT architecture, Apache 2.0

### JA↔VI Availability
- `Helsinki-NLP/opus-mt-ja-vi` — **exists** (BLEU 20.3, chrF 0.38)
- `Helsinki-NLP/opus-mt-vi-ja` — **exists** (similar metrics, direction reversed)
- Both available on HuggingFace, ONNX-converted versions via `@xenova/transformers`

### Quality Assessment
- BLEU 20.3 for JA→VI is mediocre — comparable to NLLB-600M but likely lower quality per-sentence due to smaller model size (~300MB, ~65M params)
- Trained on sparse JA↔VI parallel data (Tatoeba corpus is limited for this pair)
- EN↔JA and EN↔VI: better quality (more training data)
- **Do NOT use for JA↔VI if quality matters** — NLLB-600M or LLM is strictly better

### Local Inference
- ~300MB per model, ~100ms/sentence on CPU — **fastest option**
- Browser: ONNX quantized via transformers.js, ~100–300ms, ~100MB download
- Two separate models needed (ja-vi AND vi-ja for bidirectional)

### Verdict
Only use if: size/speed is paramount over quality, and you can accept BLEU ~20 for JA↔VI. Fine for EN↔JA or EN↔VI with dedicated models (much more training data).

---

## 6. Browser-Based (transformers.js)

### What Works (2026-03)

| Model | Size (ONNX quantized) | JA↔VI | Latency (WASM) | WebGPU |
|-------|----------------------|-------|---------------|--------|
| `Xenova/nllb-200-distilled-600M` | ~300MB | Good | 1–3s | Crashy |
| `Xenova/opus-mt-ja-en` | ~100MB | JA→EN only | <300ms | Stable |
| LLMs (Qwen, Gemma) | 4GB+ | Good | 10s+ | Needs 4GB VRAM |

### Practical Reality
- NLLB-600M in browser: viable for low-traffic local apps, first-load delay is UX pain
- Caches in IndexedDB after first download — subsequent loads instant
- WebGPU gives 5–10x speedup but translation pipeline crashes frequently (known upstream bugs)
- LLMs in browser: not practical for translation — too large, too slow

### Recommended Pattern for Browser
```js
// transformers.js v3 with WASM (stable)
import { pipeline } from '@huggingface/transformers';
const translator = await pipeline('translation', 'Xenova/nllb-200-distilled-600M');
const result = await translator(text, { src_lang: 'jpn_Jpan', tgt_lang: 'vie_Latn' });
```

---

## 7. CTranslate2 + NLLB/Opus-MT

**What it is:** C++/Python inference engine with int8/int4 quantization, beam search optimization, layer fusion. Best tool for running MarianMT / NLLB efficiently on CPU.

### Setup (NLLB example)
```bash
pip install ctranslate2
ct2-opus-mt-converter --model facebook/nllb-200-distilled-1.3B --output_dir nllb-1.3B-int8 --quantization int8
```

### Performance Gains
- 6–10x speedup vs. raw HuggingFace transformers on CPU
- int8: 50% RAM reduction (1.3B → ~1.5GB RAM)
- BLEU loss: ~5% (acceptable)
- MPS (Metal) backend available: use `device="mps"` for 3–5x over CPU

### When to Use
- Building a local Python/Node.js translation server (no Ollama required)
- Need sub-500ms latency for NLLB-1.3B
- Prefer dedicated NMT over general-purpose LLM

---

## Architecture Recommendation for the STT Web App

### Option A: Pure Local, No Internet Required
```
Mic → Whisper.cpp (STT, M2) → NLLB-1.3B via CTranslate2 (translate) → display
```
- STT: ~500ms; Translation: ~300ms → total ~800ms per utterance
- RAM: Whisper base ~150MB + NLLB-1.3B int8 ~1.5GB = ~1.7GB
- Quality: Good for EN, acceptable for JA↔VI

### Option B: One-Model Pipeline (Simplest)
```
Mic → SeamlessM4T v2 (STT + translate in one call) → display
```
- Eliminates separate STT model
- RAM: ~5–6GB for large variant
- Latency: ~1.5–3s/utterance on M2 CPU; ~500ms with MPS
- Best for: minimal code, acceptable latency

### Option C: Best Quality Local (Recommended for dev)
```
Mic → Whisper.cpp (STT) → Qwen3:8b via Ollama (translate) → display
```
- Best JA↔VI quality
- Latency: 500ms STT + 1–2s translation = ~2s total (streaming helps)
- Use 500ms+ debounce; show STT text immediately, translate after pause

### Option D: Hybrid (Best for production-like local app)
```
Mic → Whisper.cpp → @vitalets/google-translate-api (dev) / Google Cloud NMT (prod)
```
- ~300ms translation, highest reliability
- Requires internet; not truly offline

---

## License Summary (Critical)

| Model | License | Commercial? |
|-------|---------|------------|
| NLLB-200 | CC-BY-NC 4.0 | **NO** |
| SeamlessM4T | CC-BY-NC 4.0 | **NO** |
| Opus-MT | Apache 2.0 | Yes |
| MADLAD-400 | Apache 2.0 | Yes |
| Qwen2.5/3 | Apache 2.0 | Yes |
| Gemma3 | Gemma ToS | Restricted (needs approval >1M users) |
| Whisper | MIT | Yes |

---

## Unresolved Questions

1. SeamlessM4T MPS (Metal) support: PyTorch MPS backend exists but seamless_communication library may not fully leverage it — needs testing on M2.
2. WebGPU translation crashes (#1380, #1518): no confirmed fix as of 2026-03; monitor transformers.js releases.
3. MADLAD-400 GGUF community quantizations: quality at q4 vs NLLB-600M unclear; no head-to-head for JA↔VI.
4. Qwen-MT specialized model: available as Alibaba Cloud API only — no confirmed open-weight local release as of 2026-03.
5. SeamlessStreaming variant: designed for real-time streaming translation; worth investigating for <500ms latency target but complex setup.

---

## Sources

- [SeamlessM4T v2 HuggingFace](https://huggingface.co/facebook/seamless-m4t-v2-large)
- [SeamlessM4T Meta Research](https://ai.meta.com/research/seamless-communication/)
- [seamless_communication GitHub](https://github.com/facebookresearch/seamless_communication)
- [NLLB-200 distilled 600M](https://huggingface.co/facebook/nllb-200-distilled-600M)
- [NLLB-200 3.3B](https://huggingface.co/facebook/nllb-200-3.3B)
- [NLLB CTranslate2 OpenNMT Forum](https://forum.opennmt.net/t/nllb-200-with-ctranslate2/5090)
- [MADLAD-400 7B HuggingFace](https://huggingface.co/google/madlad400-7b-mt)
- [MADLAD-400 3B HuggingFace](https://huggingface.co/google/madlad400-3b-mt)
- [Helsinki-NLP opus-mt-ja-vi](https://huggingface.co/Helsinki-NLP/opus-mt-ja-vi)
- [transformers.js GitHub](https://github.com/huggingface/transformers.js/)
- [transformers.js v3 WebGPU blog](https://huggingface.co/blog/transformersjs-v3)
- [WebGPU translation crash issue #1380](https://github.com/huggingface/transformers.js/issues/1380)
- [CTranslate2 GitHub](https://github.com/OpenNMT/CTranslate2)
- [Offline multilingual translator with Opus-MT](https://github.com/harisnae/multilingual-translator-offline)
- [NLLB vs MADLAD vs Opus-MT comparison (Spikeseed)](https://blog.spikeseed.ai/luxembourgish-translators/)
- [Qwen3 translation quality (Shisa.AI)](https://shisa.ai/posts/qwen3-japanese-performance/)
- [Qwen-MT blog](https://qwenlm.github.io/blog/qwen-mt/)
- [Best open-source translation 2025 (Picovoice)](https://picovoice.ai/blog/open-source-translation/)
