# Web Speech API Research Report
Date: 2026-03-19

---

## 1. Browser Support (2025-2026)

| Browser | Support | Notes |
|---|---|---|
| Chrome / Chromium | Full | Best support; uses `webkitSpeechRecognition` + `SpeechRecognition` |
| Edge (Chromium) | Full | Same as Chrome engine |
| Safari macOS | Partial | Supported since ~14.1 via `webkitSpeechRecognition`; quirky |
| Safari iOS | Partial | 14.5+ only; broken as PWA; no continuous mode |
| Firefox | None | Behind a flag, not shipped. No timeline for stable support |
| iOS Chrome/Firefox | None | Apple forces WebKit engine on iOS — no SpeechRecognition |

**Reality check:** Chromium-only in practice for reliable production use (~65% desktop market share, but ~0% Firefox users and all iOS users are excluded).

---

## 2. Language Support — EN / JA / VI

All three languages are supported via BCP 47 codes:
- English: `en-US`, `en-GB`, etc.
- Japanese: `ja-JP`
- Vietnamese: `vi-VN`

Chrome's backend (Google's ASR service) supports 100+ languages including all three. **Language must be set via `recognition.lang`** — there is no API for auto-detection.

**Accuracy (anecdotal/community reports):**
- English: Excellent. Google's backend is mature; ~95%+ in clean audio
- Japanese: Good. Well-supported, relatively low WER in practice
- Vietnamese: Moderate. Works but more errors than EN/JA, especially with accents and tones. Tonal languages are harder; background noise hurts VI significantly more than EN

---

## 3. Language Auto-Detection

**Not supported.** `SpeechRecognition.lang` is required. If unset, defaults to page's `<html lang>` attribute or browser's UI language.

No built-in multi-language or language-switching capability. You must set lang before starting, or restart recognition with a new lang.

Workarounds: Some devs run multiple recognizers in parallel (one per lang) and pick the highest-confidence result — hacky and resource-intensive.

---

## 4. Continuous Recognition Mode

Set `recognition.continuous = true` to keep listening across pauses. Key behaviors:

```js
recognition.continuous = true;
recognition.interimResults = true; // get partial results while speaking

recognition.onresult = (e) => {
  // e.results is cumulative — rebuild from scratch each event
  for (let i = e.resultIndex; i < e.results.length; i++) {
    const transcript = e.results[i][0].transcript;
    const isFinal = e.results[i].isFinal;
  }
};
```

**Gotchas with continuous mode:**
- Chrome: fires `onend` after ~60s of silence even with `continuous=true` — must restart manually
- iOS Safari: `continuous` flag is ignored; auto-stops after each utterance
- `e.results` is cumulative in Chrome — if you don't use `resultIndex`, you double-append text
- No guaranteed behavior for "end of sentence" — you rely on isFinal results
- Network timeouts cause `onerror` with `network` code — need retry logic

---

## 5. Accuracy Summary

| Language | Web Speech API | Notes |
|---|---|---|
| English | Excellent (~95%) | Mature Google ASR pipeline |
| Japanese | Good (~88-92%) | Works well, kanji disambiguation can struggle |
| Vietnamese | Moderate (~75-85%) | Tonal language; accents/noise hurt significantly |

These are rough estimates — Google hasn't published benchmarks. Accuracy degrades for all languages with background noise, accents, domain-specific vocab.

---

## 6. Alternatives

### Whisper.js / Transformers.js (Client-Side)
- Runs OpenAI Whisper in browser via WebAssembly + WebGPU (Chrome 113+)
- Fully offline, private — audio never leaves the device
- **Accuracy:** ~90% across languages; excellent for VI/JA (Whisper trained on diverse multilingual data)
- **Limitation:** NOT real-time in practice — Whisper is a batch encoder. "Real-time" is chunked batch processing with ~1-3s latency per chunk
- **Model size:** tiny=75MB, base=145MB, small=465MB — must download on first load
- **WebGPU**: Chrome 113+ fast; Firefox/Safari fall back to WASM (2-5x slower)
- Best library: `@xenova/transformers` (Hugging Face Transformers.js)

### Deepgram (Server-Side Streaming API)
- WebSocket streaming, <300ms latency
- Supports EN/JA/VI (Nova-3 model)
- Cost: ~$0.0077/min (~$0.46/hr) for streaming
- Best real-time accuracy of any option
- Requires backend/API key — not purely client-side
- Good choice if privacy/cost is acceptable

### AssemblyAI / Google Cloud STT / Azure
- Server-side APIs with WebSocket streaming
- All support EN/JA; VI support varies (AssemblyAI multilingual covers VI)
- Higher latency than Deepgram, similar or better accuracy
- Pay-per-use pricing

### Comparison Table

| Solution | Real-time | Offline | VI/JA Quality | Cost | Browser Support |
|---|---|---|---|---|---|
| Web Speech API | Yes | No | Moderate/Good | Free | Chrome/Edge only |
| Whisper.js (client) | Chunked (~1-3s delay) | Yes | Excellent | Free | Chrome (fast), others slow |
| Deepgram | Yes (<300ms) | No | Excellent | $0.46/hr | All (via WebSocket) |
| Google Cloud STT | Yes | No | Excellent | $0.006/min | All (via REST/WS) |

---

## 7. Key Limitations & Gotchas

1. **Requires HTTPS** — microphone access blocked on HTTP (except localhost)
2. **Google-controlled backend** — Chrome's implementation sends audio to Google servers; no privacy guarantees, no offline
3. **Firefox dead-end** — no support, no roadmap. Users on Firefox get nothing
4. **iOS broken** — iOS Chrome, Firefox, and Safari PWA mode all fail or behave differently
5. **Auto-stop at silence** — must restart on `onend` in continuous mode; Chrome stops after ~60s of silence regardless
6. **No punctuation** — results are unpunctuated text; must post-process
7. **No speaker diarization** — single speaker only
8. **Cumulative results bug** — `e.results` grows indefinitely; use `e.resultIndex` correctly or memory grows
9. **Rate limits unknown** — Google doesn't document limits; heavy use may get throttled
10. **No confidence threshold control** — can't reject low-confidence results; only read `result[0].confidence`
11. **Lang switching requires restart** — cannot change language mid-session

---

## Recommendation

| Use Case | Recommended |
|---|---|
| Simple EN-only, Chromium users, zero infra | Web Speech API |
| Privacy-sensitive / offline / multilingual | Whisper.js (transformers.js) |
| Production EN/JA/VI, real-time, quality matters | Deepgram or Google Cloud STT |
| Budget-constrained, mixed traffic | Web Speech API + Deepgram fallback |

---

## Unresolved Questions

- Exact WER benchmarks for VI-VN in Web Speech API vs Whisper (no published 2025 data found)
- Whether Google has updated the Chrome backend to a newer ASR model (post-2023 changes undocumented)
- Whisper V4 real-time streaming claims (late 2025) — need to verify if truly low-latency or still chunked
- iOS 18+ Web Speech API PWA status — some reports it may have improved but not confirmed
