# Real-Time Multilingual Speech Translator

Local web app: speak into mic → auto-detect EN/JA/VI → translate → bilingual subtitles.

Uses SeamlessM4T v2 for STT + language detection + translation in a single model.

## Prerequisites

- Python 3.10+
- Node.js 20+ with pnpm
- ffmpeg (for audio conversion)
- 8GB RAM minimum
- ~3GB disk for SeamlessM4T v2 model (auto-downloads on first run)
- Chrome/Edge browser (mic access)

## Quick Start

```bash
make install   # Install Python + Node dependencies
make dev       # Start backend (port 8000) + frontend (port 5173)
```

Open http://localhost:5173, grant mic permission, select target language, and start speaking.

## Usage

1. Click the mic button (or press Space) to start recording
2. Speak in English, Japanese, or Vietnamese
3. Select target language from dropdown
4. Bilingual subtitles appear in real-time
5. Click "Export" to download transcript as .txt
6. Click "Clear" to reset

## Architecture

```
Browser (React+Vite+TS) ←WebSocket→ FastAPI (Python) + SeamlessM4T v2
```

- Frontend captures mic audio as WebM/Opus via MediaRecorder
- Sends binary chunks over WebSocket every 3s
- Backend converts to 16kHz WAV, runs VAD (silero-vad), then SeamlessM4T v2
- Returns JSON with source text + translated text

## Development

```bash
make backend   # Run FastAPI only (port 8000)
make frontend  # Run Vite only (port 5173)
make clean     # Remove .venv and node_modules
```

## Troubleshooting

- **Model download slow**: First run downloads ~3GB. Be patient.
- **ffmpeg not found**: Install via `brew install ffmpeg` (macOS) or `apt install ffmpeg` (Linux).
- **Mic not working**: Ensure Chrome has mic permission. Check browser settings.
- **High RAM usage**: SeamlessM4T v2 large requires ~4GB. Close other apps if needed.
