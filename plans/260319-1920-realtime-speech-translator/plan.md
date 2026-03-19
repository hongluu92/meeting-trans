---
title: "Real-Time Multilingual Speech Translator"
description: "Web app: mic → auto-detect EN/JA/VI → translate → bilingual subtitles. SeamlessM4T v2 + FastAPI + React."
status: complete
priority: P1
effort: 12h
tags: [feature, fullstack, ml, speech, translation]
created: 2026-03-19
---

# Real-Time Multilingual Speech Translator

## Overview

Local web app capturing speech from mic, auto-detecting EN/JA/VI, translating to selected target language, displaying bilingual subtitles. Single model (SeamlessM4T v2) handles entire pipeline: STT + language detect + translate.

## Architecture

```
Browser (React+Vite+TS) ←WebSocket→ FastAPI (Python) + SeamlessM4T v2 (int8)
```

- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS
- **Backend:** FastAPI, Python 3.11+, SeamlessM4T v2 int8 (~3GB RAM)
- **Transport:** WebSocket (binary audio up, JSON down)
- **UI:** Subtitle-style, dark theme, language color-coded

## Phases

| # | Phase | Status | Effort | Link |
|---|-------|--------|--------|------|
| 1 | Setup project structure & dependencies | Complete | 2h | [phase-01](./phase-01-setup-project-and-dependencies.md) |
| 2 | Build backend: FastAPI + SeamlessM4T v2 | Complete | 4h | [phase-02](./phase-02-build-backend-seamlessm4t.md) |
| 3 | Build frontend: React + mic capture + WebSocket | Complete | 3h | [phase-03](./phase-03-build-frontend-mic-websocket.md) |
| 4 | Integration, testing & polish | Complete | 3h | [phase-04](./phase-04-integration-testing-polish.md) |

## Dependencies

- Python 3.11+ with pip/uv
- Node.js 20+ with pnpm/npm
- ~3GB disk for SeamlessM4T v2 model (auto-download on first run)
- 8GB RAM minimum
- Chrome/Edge browser (mic access)

## Key Decisions

- SeamlessM4T v2 chosen over Whisper+separate translation: simpler, 1 model
- int8 quantization to fit 8GB RAM
- WebSocket over REST: streaming audio needs persistent connection
- Subtitle-style UI over chat bubbles: better for interpreter UX
- VAD (voice activity detection) for clean audio chunking

## Research Reports

- [Brainstorm Summary](./brainstorm-summary.md)
- [Web Speech API](./reports/researcher-260319-web-speech-api.md)
- [Translation APIs](./reports/researcher-260319-translation-api-comparison.md)
- [SOTA STT Models](./reports/researcher-260319-sota-open-source-stt-models.md)
- [Local Translation](./reports/researcher-260319-local-translation-models.md)
