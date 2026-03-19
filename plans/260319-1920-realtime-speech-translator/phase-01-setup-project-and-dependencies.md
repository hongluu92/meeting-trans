# Phase 1: Setup Project Structure & Dependencies

## Context Links
- [Brainstorm Summary](./brainstorm-summary.md)
- [SeamlessM4T v2 docs](https://github.com/facebookresearch/seamless_communication)

## Overview
- **Priority:** P1
- **Status:** Complete
- **Effort:** 2h
- Setup monorepo structure with Python backend + React frontend. Install all deps, verify SeamlessM4T loads.

## Key Insights
- SeamlessM4T v2 requires `fairseq2`, `seamless_communication` packages
- int8 quantization via `torch.quantization` or `bitsandbytes` to fit 8GB RAM
- Vite dev server proxies WebSocket to FastAPI backend

## Requirements

### Functional
- Project structure with clear backend/frontend separation
- Python venv with all ML dependencies
- React app scaffolded with Tailwind
- Single startup command (Makefile or script)

### Non-functional
- Total dependency install < 10 min
- Model download handled gracefully (progress indicator)

## Related Code Files

### Files to Create
- `/Makefile` — dev commands (install, run, dev)
- `/backend/pyproject.toml` — Python project config
- `/backend/requirements.txt` — Python deps
- `/backend/app/__init__.py` — package init
- `/backend/app/main.py` — FastAPI entry point (skeleton)
- `/frontend/package.json` — Node deps
- `/frontend/vite.config.ts` — Vite config with WebSocket proxy
- `/frontend/tsconfig.json` — TypeScript config
- `/frontend/tailwind.config.js` — Tailwind config
- `/frontend/src/main.tsx` — React entry
- `/frontend/src/App.tsx` — Root component (skeleton)
- `/frontend/index.html` — HTML entry
- `/README.md` — Setup instructions

## Implementation Steps

1. Create directory structure: `backend/app/`, `frontend/src/`
2. Init Python project with `pyproject.toml`:
   - deps: `fastapi`, `uvicorn[standard]`, `websockets`, `torch`, `torchaudio`, `fairseq2`, `seamless_communication`
   - python requires: `>=3.11`
3. Create `requirements.txt` from pyproject.toml
4. Setup Python venv: `python3 -m venv backend/.venv`
5. Install Python deps: `pip install -r backend/requirements.txt`
6. Scaffold FastAPI skeleton in `backend/app/main.py`:
   ```python
   from fastapi import FastAPI
   app = FastAPI(title="STT Translator")

   @app.get("/health")
   async def health():
       return {"status": "ok"}
   ```
7. Scaffold React app with Vite:
   ```bash
   cd frontend && pnpm create vite . --template react-ts
   pnpm add -D tailwindcss @tailwindcss/vite
   ```
8. Configure Vite proxy for WebSocket:
   ```typescript
   // vite.config.ts
   server: {
     proxy: {
       '/ws': { target: 'ws://localhost:8000', ws: true }
     }
   }
   ```
9. Create Makefile with targets:
   - `make install` — install all deps
   - `make dev` — run backend + frontend concurrently
   - `make backend` — run FastAPI only
   - `make frontend` — run Vite only
10. Verify: `make install && make dev` starts both servers

## Todo List

- [x] Create directory structure
- [x] Setup Python project with deps
- [x] Create & activate venv, install deps
- [x] Scaffold FastAPI skeleton with health endpoint
- [x] Scaffold React + Vite + TypeScript app
- [x] Configure Tailwind CSS
- [x] Configure Vite WebSocket proxy
- [x] Create Makefile with install/dev targets
- [x] Verify both servers start successfully
- [x] Write README with setup instructions

## Success Criteria

- `make install` completes without errors
- `make dev` starts both backend (port 8000) and frontend (port 5173)
- `/health` endpoint returns `{"status": "ok"}`
- React app loads in browser at localhost:5173
- Tailwind styles applied correctly

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `fairseq2` install fails on macOS | Medium | High | Use conda if pip fails; check Apple Silicon compatibility |
| PyTorch MPS issues | Low | Medium | Fallback to CPU; set `PYTORCH_ENABLE_MPS_FALLBACK=1` |
| Node/Python version mismatch | Low | Low | Document exact versions in README |

## Security Considerations
- No secrets needed in Phase 1
- `.gitignore` must exclude `.venv/`, `node_modules/`, `__pycache__/`, `.env`
