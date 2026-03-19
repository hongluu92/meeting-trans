# Translation API Comparison: EN / JA / VI Real-Time Web App
**Date:** 2026-03-19
**Focus:** Quality for JA↔VI, real-time latency, cost, dev setup ease

---

## Summary Table

| Option | JA↔VI Quality | Latency | Cost | Dev Setup |
|--------|--------------|---------|------|-----------|
| Google Cloud Translation (NMT) | Good | ~100–300ms | $20/M chars; 500K free/mo | Easy (REST) |
| DeepL API | Good (new, VI added Jun 2025) | ~100–250ms | 500K free/mo; $5.49/mo + $25/M chars | Easy (REST) |
| LibreTranslate (self-hosted) | Poor for JA↔VI | ~200–500ms local | Free | Medium (Docker) |
| Ollama + local LLM (Qwen2.5-7B) | Good–Very Good | ~500ms–2s TTFT | Free (compute cost) | Medium-Hard |
| google-translate-api (npm) | Good (same Google NMT) | ~100–300ms | Free (unofficial) | Very Easy |
| Claude Haiku / GPT-4o mini | Very Good | ~500ms TTFT | $1/$5 per M tokens (Haiku) / $0.15/$0.60 (4o-mini) | Easy (REST) |

---

## Per-Option Analysis

### 1. Google Cloud Translation API (NMT v2/v3)

**Quality**
- EN↔JA and EN↔VI: production-grade, widely used
- JA↔VI: supported but indirect (likely pivots through EN internally); acceptable quality
- Not ideal for nuanced JA context (honorifics, implied subjects) but best-in-class for MT

**Latency**
- ~100–300ms for short strings; NMT recommended for low-latency chat
- LLM-based model (v3 option) adds latency but improves nuance

**Cost**
- $20/M chars (NMT); first 500K chars/mo free
- LLM-based variant: $10/M input + $10/M output
- For real-time typing (estimating ~500 chars/req × 100 req/session): very cheap

**Setup**
- Official Node.js SDK (`@google-cloud/translate`), REST, simple auth via API key or service account
- Reliable, production-grade SLA

**Verdict:** Solid default. Great reliability, reasonable cost, known quality floor.

---

### 2. DeepL API

**Quality**
- Vietnamese added June 2025 — currently limited to DeepL Pro plan and next-gen API
- EN↔JA: historically DeepL's strongest suit (highest BLEU for formal/structured text)
- JA↔VI: new addition, no independent benchmarks yet; likely pivots through EN; quality unknown for this specific pair
- No glossary support for VI yet (limitation noted at launch)

**Latency**
- ~100–250ms; generally faster than Google for European languages, comparable for Asian

**Cost**
- Free tier: 500K chars/mo
- Pro: $5.49/mo base + $25/M chars — more expensive than Google at scale

**Setup**
- Official SDK (`deepl` npm package), straightforward REST

**Verdict:** Promising for EN↔JA (best quality), but VI support is brand-new (Jun 2025) and untested for JA↔VI. Worth testing but not yet proven for this pair.

---

### 3. LibreTranslate (Self-Hosted)

**Quality**
- Powered by Argos Translate (OpenNMT, ~65M param models)
- JA↔VI: NO direct model — must pivot through English (JA→EN→VI), double translation error compounds
- Community reports: Vietnamese model quality "needs improvement"; known open issue
- Adequate only for EN↔JA or EN↔VI individually; JA↔VI will be noticeably degraded

**Latency**
- ~200–500ms locally (depends on hardware); CPU-only is slow
- No cold start once running

**Cost**
- Free; Docker image available

**Setup**
- Docker: `docker run -p 5000:5000 libretranslate/libretranslate`
- Must download language models (~500MB–1GB per pair)
- Public API available at libretranslate.com (1K req/day free limit)

**Verdict:** Not recommended for JA↔VI. Acceptable only if purely offline + EN-only pairs + zero budget.

---

### 4. Ollama + Local LLM

**Best models for JA/VI translation:**
- `qwen2.5:7b` — strong multilingual (JA, VI, EN); 18–22 tok/s on M2 Mac Mini
- `gemma3:9b` or `gemma3-translator` variant — good quality, translation-tuned
- `llamax3-8b` — 100+ language support including JA and VI

**Quality**
- Qwen2.5 handles JA context (honorifics, particles) better than NMT systems
- JA↔VI: LLMs generally outperform traditional MT for low-resource pairs like this
- With a system prompt: "You are a professional translator. Translate from [lang] to [lang]. Output only the translation." — quality is competitive with DeepL

**Latency**
- TTFT: ~500ms–1.5s on M2 (7B Q4_K_M); streaming makes it feel faster
- 18–22 tok/s → ~100-char translation finishes in ~2–3s total
- NOT suitable for keystroke-by-keystroke real-time; OK for sentence/paragraph-level
- MLX backend is 30–50% faster on Apple Silicon vs Ollama's llama.cpp

**Cost**
- Free (electricity + hardware)
- Requires 16GB RAM minimum for 7B models

**Setup**
- `ollama pull qwen2.5:7b` then REST at `localhost:11434`
- Offline, private, no API keys

**Verdict:** Best quality for JA↔VI if latency is tolerable. Ideal for privacy-sensitive or offline use. Not suitable for true keystroke real-time — use debounce (500ms+ after typing stops).

---

### 5. google-translate-api (npm, Unofficial)

**Packages:**
- `@vitalets/google-translate-api` — most popular, uses same NMT as paid API
- `google-translate-api-x` — uses batch endpoint (less rate-limited)

**Quality**
- Identical to Google Cloud NMT — same underlying model, same quality for JA/VI

**Latency**
- ~100–300ms (same infrastructure)

**Cost**
- Free — but unofficial, reverse-engineered

**Reliability Risks:**
- Rate limiting: 429/503 errors under high load or many requests from same IP
- Google can break the interface without warning (ToS violation use)
- Not suitable for production or commercial apps
- Fine for local dev / personal projects / prototyping

**Setup**
- `npm install @vitalets/google-translate-api` — dead simple, no API key needed

**Verdict:** Perfect for local dev/prototyping. Do NOT use in production. Swap for official API before launch.

---

### 6. Claude API (Haiku) / OpenAI API (GPT-4o mini)

**Quality**
- Claude 3.5 ranked #1 in WMT24 (9/11 language pairs), rated "good" by pros 78% of the time
- Both excellent for JA↔VI: understand context, honorifics, tone — best available quality
- Claude Haiku 4.5: optimized for speed/cost while retaining strong multilingual ability

**Latency**
- TTFT: ~500ms (Haiku) / ~560ms (4o-mini) — both designed for real-time
- Haiku: ~165 tok/s throughput; 4o-mini: ~80 tok/s
- With streaming: feels near-instant for short translations

**Cost (2025)**
- Claude Haiku 4.5: ~$1/M input, $5/M output tokens
- GPT-4o mini: ~$0.15/M input, $0.60/M output — ~8x cheaper than Haiku
- A 50-word translation ≈ ~80 tokens in + ~80 tokens out
- At 1000 translations/day: GPT-4o mini ≈ $0.024/day; Haiku ≈ $0.48/day

**Setup**
- OpenAI: `npm install openai`; Claude: `npm install @anthropic-ai/sdk`
- Both: simple REST, streaming supported, well-documented

**Verdict:** Best quality ceiling, especially for JA↔VI. GPT-4o mini is cheapest LLM option. Use with a tight system prompt and streaming for best real-time UX.

---

## Recommendation by Use Case

### Local dev / prototype (now)
**Use `@vitalets/google-translate-api` (unofficial).**
Zero setup, no API key, same NMT quality. Accept 429 risk on heavy use.

### Production / launch
**Primary: Google Cloud Translation NMT** — proven, cheap, fast, all 3 languages.
**If JA↔VI quality matters most: GPT-4o mini** — best JA↔VI, streaming, very cheap.

### Privacy / offline required
**Ollama + Qwen2.5:7b** — best offline quality. Add 500ms+ debounce for real-time feel.

### Best JA↔EN specifically
**DeepL** — but verify JA↔VI quality (launched Jun 2025, unvetted for this pair).

---

## JA↔VI Ranking (hardest pair)

1. GPT-4o mini / Claude Haiku — context-aware, handles JA honorifics
2. Qwen2.5:7b (Ollama) — strong multilingual local model
3. Google Cloud NMT — acceptable, likely pivots through EN
4. DeepL — new, promising, unverified
5. LibreTranslate — double-pivot degradation, avoid

---

## Architecture Note for Real-Time UX

For keystroke-level real-time translation:
- Debounce user input: fire API only after 300–500ms idle
- Use streaming (SSE) for LLM-based options to show progressive output
- Cache translations by source text hash to avoid duplicate API calls
- NMT APIs (Google/DeepL) are best fit: ~150–250ms, stateless, per-request

---

## Unresolved Questions

1. DeepL JA↔VI quality: no independent benchmarks exist yet (language added Jun 2025). Needs manual testing.
2. Ollama latency on the target dev machine — depends on hardware. Needs profiling.
3. Rate limits for `@vitalets/google-translate-api` per IP — varies unpredictably; test under realistic request cadence.
4. Whether DeepL's next-gen model handles JA→VI better than Google's NMT — unknown without head-to-head test.

---

## Sources

- [Google Cloud Translation Pricing](https://cloud.google.com/translate/pricing)
- [DeepL Vietnamese Language Launch](https://www.deepl.com/en/blog/vietnamese-thai-hebrew-launch)
- [DeepL Supported Languages](https://developers.deepl.com/docs/resources/supported-languages)
- [DeepL API Pricing Guide 2025](https://www.eesel.ai/blog/deepl-pricing)
- [LibreTranslate GitHub](https://github.com/LibreTranslate/LibreTranslate)
- [LibreTranslate Vietnamese Quality Issue](https://community.libretranslate.com/t/improving-vietnamese-to-english-model/1103)
- [@vitalets/google-translate-api npm](https://www.npmjs.com/package/@vitalets/google-translate-api)
- [google-translate-api-x npm](https://www.npmjs.com/package/google-translate-api-x)
- [Best LLMs for Translation 2025 - Lokalise](https://lokalise.com/blog/what-is-the-best-llm-for-translation/)
- [LLM Translation Benchmark 2026 - IntlPull](https://intlpull.com/blog/llm-translation-quality-benchmark-2026)
- [Claude Haiku 4.5 vs GPT-4o mini latency](https://docsbot.ai/models/compare/claude-haiku-4-5/gpt-4o-mini)
- [Qwen2.5 on Mac benchmark](https://singhajit.com/llm-inference-speed-comparison/)
- [LLM API Pricing Comparison 2025](https://intuitionlabs.ai/articles/llm-api-pricing-comparison-2025)
- [Ollama translator models](https://ollama.com/search?q=translation)
