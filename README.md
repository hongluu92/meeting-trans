# Real-Time Multilingual Speech Translator

Local web app: speak into mic (or capture system audio) → auto-detect language → transcribe → translate → bilingual subtitles.

Uses Whisper (faster-whisper or mlx-whisper) for STT and NLLB (CTranslate2) for offline translation.

![Demo](demo.png)

## Supported Languages

English, Japanese (日本語), Vietnamese (Tiếng Việt), Korean (한국어)

## Prerequisites

- Python 3.10+
- Node.js 20+ with pnpm
- 8GB RAM minimum
- ~2GB disk for Whisper + NLLB models (auto-download on first run)
- Chrome/Edge browser (mic access)

## Quick Start

```bash
cp .env.example .env   # API_URL=http://0.0.0.0:8000
make install           # Install Python + Node dependencies
make dev               # Start backend (port 8000) + frontend (port 5173)
```

Open http://localhost:5173, grant mic permission, select target language, and start speaking.

## Usage

1. Click the mic button (or press Space) to start recording
2. Speak in any supported language (or set source language manually)
3. Select target language from dropdown
4. Bilingual subtitles appear in real-time (interim partials + final results)
5. Click "Export" to download transcript as .txt
6. Click "Clear" to reset

## Architecture

```
Browser (React + Vite + TS) ←WebSocket→ FastAPI (Python)
                                          ├── Whisper (STT + language detection)
                                          └── NLLB via CTranslate2 (translation)
```

- Frontend captures mic audio, resamples to 16kHz float32 PCM via AudioWorklet
- Streams binary chunks over WebSocket
- On speech end: Whisper transcribes → NLLB translates → JSON result sent back

## Configuration

Edit `backend/config.yaml`:

| Section | Key Options |
|---------|------------|
| `whisper` | `engine` (`mlx` or `faster-whisper`), `model_size`, `device`, `compute_type` |
| `vad` | `threshold`, `silence_duration_ms`, `max_segment_s`, `interim_interval_s` |
| `translation` | NLLB model, beam_size, max_decoding_length |
| `languages` | List of supported language codes |

## Development

```bash
make backend   # Run FastAPI only (port 8000)
make frontend  # Run Vite only (port 5173)
make clean     # Remove .venv and node_modules
```

## Project Structure

```
backend/
  app/
    main.py              # FastAPI app, lifespan, routes
    config.py            # YAML config loader with defaults
    model_loader.py      # Whisper model loading (faster-whisper / mlx)
    audio_processor.py   # VAD-based streaming audio buffer
    translator.py        # Whisper STT + NLLB translation
    websocket_handler.py # WebSocket connection handler
  config.yaml            # Runtime configuration
  requirements.txt

frontend/
  src/
    App.tsx                          # Main app with recording + subtitle display
    hooks/use-audio-capture.ts       # Mic/system audio capture
    hooks/use-websocket.ts           # WebSocket connection management
    hooks/use-subtitles.ts           # Subtitle state management
    components/control-bar.tsx       # Language selectors, export, clear
    components/record-button.tsx     # Recording toggle button
    components/subtitle-display.tsx  # Bilingual subtitle renderer
    components/subtitle-entry.tsx    # Single subtitle entry
    components/loading-screen.tsx    # Model loading indicator
    components/error-boundary.tsx    # Error boundary wrapper
    utils/export-transcript.ts       # Transcript export to .txt
    types.ts                         # TypeScript types
```

## Troubleshooting

- **Model download slow**: First run downloads Whisper (~150MB) + NLLB (~1.3GB). Be patient.
- **Mic not working**: Ensure browser has mic permission. HTTPS required for system audio capture.
- **High RAM usage**: NLLB 1.3B requires ~2GB. Use a smaller Whisper model if constrained.
- **Apple Silicon (M1/M2/M3/M4)**: Set `whisper.engine: "mlx"` in config.yaml for native acceleration via mlx-whisper.
- **Mac Intel**: Set `whisper.engine: "faster-whisper"` in config.yaml. Remove `mlx-whisper` from requirements.txt as it only supports Apple Silicon. Use `device: "cpu"` and `compute_type: "int8"` for best performance.
