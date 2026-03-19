# Phase 4: Integration, Testing & Polish

## Context Links
- [Phase 2: Backend](./phase-02-build-backend-seamlessm4t.md)
- [Phase 3: Frontend](./phase-03-build-frontend-mic-websocket.md)

## Overview
- **Priority:** P1
- **Status:** Complete
- **Effort:** 3h
- End-to-end integration testing, UX polish, error handling, startup script.

## Requirements

### Functional
- Full pipeline works: speak → see bilingual subtitles
- Single `make dev` command starts everything
- Graceful handling of all error states
- Export transcript feature

### Non-functional
- Cold start (model load) shows progress indicator
- No crashes on edge cases
- Clean, professional UI

## Related Code Files

### Files to Modify
- `/backend/app/main.py` — add model loading progress endpoint
- `/frontend/src/App.tsx` — add loading state, error boundaries
- `/frontend/src/components/subtitle-display.tsx` — add export button
- `/Makefile` — finalize all targets

### Files to Create
- `/backend/app/health-check.py` — model readiness endpoint
- `/frontend/src/components/loading-screen.tsx` — model loading indicator
- `/frontend/src/components/error-boundary.tsx` — error fallback UI
- `/frontend/src/utils/export-transcript.ts` — export to .txt/.srt

## Implementation Steps

1. **Model loading state**:
   - Backend: `/api/status` endpoint returns `{model_loaded: bool, loading_progress: str}`
   - Frontend: poll `/api/status` on mount, show loading screen until ready
   - Loading screen: "Loading SeamlessM4T v2... (~3GB, first time only)"

2. **End-to-end integration test** (manual):
   - Start app with `make dev`
   - Open Chrome, grant mic permission
   - Speak English → verify EN detected, translated to selected target
   - Speak Japanese → verify JA detected
   - Speak Vietnamese → verify VI detected
   - Switch target language mid-session → verify new translations use new target

3. **Error handling**:
   - Backend: catch model errors, return error JSON via WebSocket
   - Frontend: display error toast (not crash)
   - Handle: mic denied, WebSocket disconnect, model OOM, bad audio

4. **Export transcript** (`export-transcript.ts`):
   ```typescript
   export function exportAsText(entries: TranslationResult[]): string {
     return entries.map(e =>
       `[${e.source_lang}] ${e.source_text}\n→ [${e.target_lang}] ${e.translated_text}`
     ).join('\n\n');
   }

   export function downloadTranscript(entries: TranslationResult[]) {
     const text = exportAsText(entries);
     const blob = new Blob([text], { type: 'text/plain' });
     const url = URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url;
     a.download = `transcript-${Date.now()}.txt`;
     a.click();
   }
   ```

5. **UI Polish**:
   - Smooth fade-in animation for new subtitle entries
   - Pulsing red dot when recording
   - "Processing..." indicator between audio send and result receive
   - Keyboard shortcut: Space to toggle recording
   - Empty state: "Press the mic button to start translating"

6. **Makefile finalization**:
   ```makefile
   .PHONY: install dev backend frontend clean

   install:
   	cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
   	cd frontend && pnpm install

   dev:
   	make backend & make frontend & wait

   backend:
   	cd backend && .venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

   frontend:
   	cd frontend && pnpm dev

   clean:
   	rm -rf backend/.venv frontend/node_modules
   ```

7. **README update** with:
   - Prerequisites (Python 3.11+, Node 20+, 8GB RAM)
   - Quick start: `make install && make dev`
   - Usage instructions
   - Troubleshooting (common issues)

## Todo List

- [x] Add model loading status endpoint
- [x] Build loading screen component
- [x] Build error boundary component
- [x] Implement transcript export (download as .txt)
- [x] Add keyboard shortcut (Space to toggle mic)
- [x] Add fade-in animation for new entries
- [x] Add "processing" indicator
- [x] Add empty state message
- [x] Test full pipeline: EN speech → translation
- [x] Test full pipeline: JA speech → translation
- [x] Test full pipeline: VI speech → translation
- [x] Test language switching mid-session
- [x] Test error scenarios (mic denied, WS disconnect)
- [x] Finalize Makefile
- [x] Update README with setup + usage docs
- [x] Verify RAM usage on 8GB machine

## Success Criteria

- `make install && make dev` — app starts, model loads, UI ready
- Speak in any of 3 languages → correct bilingual subtitles appear within 3s
- Language auto-detection accuracy > 90% (manual test)
- Export transcript downloads clean .txt file
- No crashes during 10-minute continuous use
- RAM stays under 6GB total (model + Python + browser)
- Clean, professional dark-theme UI

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Model takes too long to load | Medium | Medium | Show progress; cache model locally |
| RAM exceeds 8GB | Medium | High | Use medium model or fp16; monitor with `top` |
| Audio quality varies by mic | Medium | Low | Document recommended mic settings |
| Latency > 3s consistently | Low | Medium | Profile bottleneck; optimize audio chunking |

## Security Considerations
- Transcript export contains conversation content — user responsibility
- No data persisted server-side
- Localhost-only access
