# Code Review: stt-1 Full Codebase

**Date:** 2026-03-19
**Reviewer:** code-reviewer
**Scope:** Backend (5 files) + Frontend (12 files), ~530 LOC total

---

## Overall Assessment

Clean, well-structured project with good separation of concerns. The codebase is concise and readable. However, there are several security issues, correctness bugs, and edge cases that need attention before production use.

---

## Critical Issues

### C1. CORS Wildcard with Credentials (Security)

**File:** `/Users/kiwi/Work/Me/stt-1/backend/app/main.py`, lines 15-21

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    ...
)
```

`allow_origins=["*"]` with `allow_credentials=True` is insecure -- browsers reject this combination per the CORS spec, but even if relaxed by framework behavior, it exposes the API to any origin with credentials. Either restrict origins to the frontend's actual origin or remove `allow_credentials=True`.

**Fix:** Use an env var for allowed origins:
```python
import os
ALLOWED_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_credentials=True, ...)
```

### C2. Temp File Path Injection via Race Condition (Security)

**File:** `/Users/kiwi/Work/Me/stt-1/backend/app/audio_processor.py`, lines 16-20

```python
with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp_in:
    tmp_in.write(webm_bytes)
    tmp_in_path = tmp_in.name

tmp_out_path = tmp_in_path.replace(".webm", ".wav")
```

`str.replace(".webm", ".wav")` on the full path is fragile. If the temp directory contains ".webm" in its path, the replacement corrupts the output path. Use `Path.with_suffix()` instead:

```python
tmp_out_path = str(Path(tmp_in_path).with_suffix(".wav"))
```

### C3. Model Loader Race Condition (Correctness)

**File:** `/Users/kiwi/Work/Me/stt-1/backend/app/model_loader.py`, lines 18-52

`load_translator()` is called from a background thread but uses bare globals with no locking. If two WebSocket connections arrive while loading is in progress, `_translator is not None` guard is insufficient -- both could see `None` and start loading concurrently.

**Fix:** Add a threading lock:
```python
import threading
_lock = threading.Lock()

def load_translator():
    global _translator, _model_loading, _model_loaded
    with _lock:
        if _translator is not None:
            return _translator
        _model_loading = True
        ...
```

---

## High Priority

### H1. WebSocket Reconnect References Self Before Declaration (Correctness / Lint Error)

**File:** `/Users/kiwi/Work/Me/stt-1/frontend/src/hooks/use-websocket.ts`, line 63

ESLint reports `connect` is accessed before declared. The `ws.onclose` handler calls `setTimeout(connect, RECONNECT_DELAY_MS)` inside the same `useCallback` that defines `connect`. While this works at runtime due to closure hoisting in `useCallback`, the React Compiler cannot optimize it.

**Fix:** Use a ref for the connect function:
```typescript
const connectRef = useRef<(() => void) | null>(null);
// Inside connect:
ws.onclose = () => {
  ...
  if (reconnectCountRef.current < MAX_RECONNECT_ATTEMPTS) {
    reconnectCountRef.current++;
    setTimeout(() => connectRef.current?.(), RECONNECT_DELAY_MS);
  }
};
// After useCallback:
connectRef.current = connect;
```

### H2. useCallback Dependency Mismatch (Correctness)

**File:** `/Users/kiwi/Work/Me/stt-1/frontend/src/App.tsx`, lines 21-24

```typescript
const onChunk = useCallback(
  (blob: Blob) => ws.sendAudio(blob),
  [ws.sendAudio],
);
```

ESLint/React Compiler flags this: the inferred dependency is `ws` (the whole object), not `ws.sendAudio`. Since `useWebSocket` returns a new object on every render, `ws.sendAudio` as a dep is correct functionally (it's stable via its own useCallback), but the compiler cannot verify this.

**Fix:** Destructure at call site:
```typescript
const { sendAudio, ...wsRest } = useWebSocket({ targetLang, onResult: addEntry });
const onChunk = useCallback((blob: Blob) => sendAudio(blob), [sendAudio]);
```

### H3. No WebSocket Cleanup on Unmount (Resource Leak)

**File:** `/Users/kiwi/Work/Me/stt-1/frontend/src/hooks/use-websocket.ts`

The hook never closes the WebSocket on component unmount. If `AppInner` remounts (e.g., error boundary recovery), orphaned connections remain open.

**Fix:** Add a cleanup effect:
```typescript
useEffect(() => {
  return () => {
    wsRef.current?.close();
    wsRef.current = null;
  };
}, []);
```

### H4. Error Leaks Internal Details to Client (Security)

**File:** `/Users/kiwi/Work/Me/stt-1/backend/app/websocket_handler.py`, line 57

```python
await ws.send_json({"error": f"Translation failed: {str(e)}"})
```

Exception messages may expose internal paths, model details, or stack info. Send a generic message instead; log the details server-side.

**Fix:**
```python
logger.error(f"Translation error: {e}", exc_info=True)
await ws.send_json({"error": "Translation failed. Please try again."})
```

### H5. Translator Performance -- Redundant ASR Passes (Performance)

**File:** `/Users/kiwi/Work/Me/stt-1/backend/app/translator.py`, lines 44-76

Each audio chunk runs S2TT (1 pass) + ASR for each source language (up to 3 passes). That's 4 model inferences per chunk. On CPU, this will be extremely slow (possibly 10+ seconds per 3-second audio chunk).

**Recommendations:**
- Skip the ASR detection loop; use S2TT result as both source detection and translation
- Or cache the detected language and only re-detect periodically
- Consider adding a language selection for source language to avoid detection entirely

---

## Medium Priority

### M1. Deprecated `@app.on_event("startup")` (Maintainability)

**File:** `/Users/kiwi/Work/Me/stt-1/backend/app/main.py`, line 24

FastAPI deprecated `on_event` in favor of lifespan context managers.

**Fix:**
```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(asyncio.to_thread(load_translator))
    yield

app = FastAPI(title="STT Translator", lifespan=lifespan)
```

### M2. No Input Validation on `target_lang` (Correctness)

**File:** `/Users/kiwi/Work/Me/stt-1/backend/app/websocket_handler.py`, line 18

`target_lang` is taken directly from query params with no validation. An invalid value silently defaults to "eng" in `LANG_MAP.get(target_lang, "eng")`, but should be validated and rejected with an error.

**File:** `/Users/kiwi/Work/Me/stt-1/backend/app/websocket_handler.py`, lines 31-33

Same issue when target_lang is updated via WebSocket text message -- no validation.

### M3. AudioBuffer Accumulates Without Bound (Resource)

**File:** `/Users/kiwi/Work/Me/stt-1/backend/app/audio_processor.py`, line 77

`add_chunk()` appends to `self.chunks` without any size limit. A malicious client could send audio data faster than it's processed (since `get_audio_and_clear` only runs after each chunk), accumulating memory.

**Fix:** Add a max buffer size check:
```python
MAX_BUFFER_BYTES = 50 * 1024 * 1024  # 50MB

def add_chunk(self, chunk: bytes):
    total = sum(len(c) for c in self.chunks) + len(chunk)
    if total > MAX_BUFFER_BYTES:
        self.chunks.clear()
        raise ValueError("Audio buffer overflow")
    self.chunks.append(chunk)
```

### M4. Processing State Never Resets on Error (UI Bug)

**File:** `/Users/kiwi/Work/Me/stt-1/frontend/src/hooks/use-websocket.ts`, lines 43-54

`setIsProcessing(false)` only runs on successful message parse. If the server sends an error JSON (`data.error` is truthy), the function returns early on line 48 without resetting `isProcessing`. The UI will show "Processing..." indefinitely.

**Fix:**
```typescript
ws.onmessage = (event) => {
  setIsProcessing(false); // Always reset
  try {
    const data = JSON.parse(event.data);
    if (data.error) {
      console.error("Server error:", data.error);
      return;
    }
    onResult(data as TranslationResult);
  } catch {
    console.error("Failed to parse message");
  }
};
```

### M5. `downloadTranscript` Doesn't Clean Up Anchor Element (Minor Leak)

**File:** `/Users/kiwi/Work/Me/stt-1/frontend/src/utils/export-transcript.ts`, lines 17-19

The created `<a>` element is never appended to or removed from DOM. While `a.click()` works without appending in most browsers, Safari may require it. Also, `URL.revokeObjectURL` is called synchronously after `click()` which may revoke before download starts.

**Fix:**
```typescript
document.body.appendChild(a);
a.click();
setTimeout(() => {
  URL.revokeObjectURL(url);
  document.body.removeChild(a);
}, 100);
```

---

## Low Priority

### L1. `toggleRecording` Has Stale Closure Risk

**File:** `/Users/kiwi/Work/Me/stt-1/frontend/src/App.tsx`, lines 58-66

Dependencies are `[audio, ws]` which are object references. Since hooks return new objects each render, this callback recreates every render anyway. Consider using refs or individual stable function references.

### L2. Health Endpoint Has No Meaningful Check

**File:** `/Users/kiwi/Work/Me/stt-1/backend/app/main.py`, lines 30-32

`/health` always returns ok. Consider checking if the event loop is responsive or if critical dependencies (ffmpeg, model) are available.

### L3. Missing `aria-live` for Accessibility

**File:** `/Users/kiwi/Work/Me/stt-1/frontend/src/components/subtitle-display.tsx`

Subtitles appear dynamically but have no `aria-live` region, making them invisible to screen readers.

---

## Positive Observations

- Clean separation: hooks for state, components for UI, utils for logic
- Good use of `useCallback` to stabilize function references
- AudioBuffer with VAD is a smart approach to avoid sending silence
- Error boundary wraps the app properly
- TypeScript types are clean and well-defined
- MAX_ENTRIES cap prevents unbounded memory in subtitle list
- ffmpeg timeout prevents hanging subprocesses
- Temp file cleanup in `finally` block is correct

---

## Recommended Actions (Priority Order)

1. **Fix CORS configuration** -- restrict origins (C1)
2. **Add threading lock to model loader** -- prevent race condition (C3)
3. **Fix temp file path construction** with `Path.with_suffix()` (C2)
4. **Fix `isProcessing` state reset** on error/all messages (M4)
5. **Fix WebSocket hook lint errors** -- reconnect ref pattern (H1) and dependency destructure (H2)
6. **Add WebSocket cleanup on unmount** (H3)
7. **Sanitize error messages** sent to client (H4)
8. **Validate `target_lang` input** on server (M2)
9. **Add buffer size limit** to AudioBuffer (M3)
10. **Reduce ASR passes** for performance (H5)
11. **Migrate to lifespan** context manager (M1)

---

## Metrics

| Metric | Value |
|--------|-------|
| Total LOC | ~530 |
| TypeScript type coverage | High (all props typed, interfaces defined) |
| Lint errors | 2 errors, 1 warning (React Compiler / hooks) |
| Python compile | All files compile cleanly |
| Test coverage | No tests found |
| Security issues | 3 (CORS, error leaks, buffer overflow) |

---

## Unresolved Questions

- Is this intended for local-only use or will it be deployed publicly? CORS and security fixes are critical if public.
- What is the expected latency budget per audio chunk? The 4-pass inference strategy (H5) may be unacceptable on CPU.
- Is there a plan for tests? Neither backend nor frontend have test files.
