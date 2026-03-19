# Phase 3: Build Frontend — React + Mic Capture + WebSocket

## Context Links
- [MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [Brainstorm Summary](./brainstorm-summary.md)

## Overview
- **Priority:** P1
- **Status:** Complete
- **Effort:** 3h
- Build React frontend with mic capture, WebSocket connection to backend, subtitle-style bilingual display.

## Key Insights
- `MediaRecorder` API captures mic audio as WebM/Opus chunks
- Use `timeslice` param in `MediaRecorder.start(3000)` for 3s chunks
- WebSocket sends binary audio, receives JSON translation results
- Subtitle UI: scrolling list, newest at bottom, color-coded by language

## Requirements

### Functional
- Mic permission request + start/stop button
- Target language selector (EN/JA/VI dropdown)
- Real-time bilingual subtitle display
- Auto-scroll to newest entry
- Visual indicator: recording status, processing status

### Non-functional
- Responsive layout (works on various screen sizes)
- Dark theme
- Smooth scroll animation
- Accessible (keyboard nav, screen reader labels)

## Architecture

```
┌─────────────────────────────────────────────┐
│  App.tsx                                     │
│  ├── ControlBar (mic button + lang selector) │
│  ├── SubtitleDisplay (scrolling entries)     │
│  │   └── SubtitleEntry[] (src + translated)  │
│  └── StatusIndicator (recording/processing)  │
└─────────────────────────────────────────────┘

Hooks:
  useAudioCapture()  — MediaRecorder + mic permission
  useWebSocket()     — WS connection + reconnect
  useSubtitles()     — state management for entries
```

## Related Code Files

### Files to Create
- `/frontend/src/App.tsx` — Root layout (modify skeleton)
- `/frontend/src/components/control-bar.tsx` — Mic button + language selector
- `/frontend/src/components/subtitle-display.tsx` — Scrolling subtitle list
- `/frontend/src/components/subtitle-entry.tsx` — Single bilingual entry
- `/frontend/src/components/status-indicator.tsx` — Recording/processing badge
- `/frontend/src/hooks/use-audio-capture.ts` — MediaRecorder hook
- `/frontend/src/hooks/use-websocket.ts` — WebSocket hook
- `/frontend/src/hooks/use-subtitles.ts` — Subtitle state management
- `/frontend/src/types.ts` — TypeScript interfaces
- `/frontend/src/styles/index.css` — Tailwind base + custom styles

## Implementation Steps

1. **Types** (`types.ts`):
   ```typescript
   export interface TranslationResult {
     source_lang: string;
     source_text: string;
     target_lang: string;
     translated_text: string;
     timestamp: number;
   }

   export type Language = 'en' | 'ja' | 'vi';

   export const LANG_LABELS: Record<Language, string> = {
     en: 'English',
     ja: '日本語',
     vi: 'Tiếng Việt',
   };

   export const LANG_COLORS: Record<string, string> = {
     eng: 'text-blue-400',
     jpn: 'text-red-400',
     vie: 'text-green-400',
   };
   ```

2. **useAudioCapture hook**:
   - Request mic permission via `navigator.mediaDevices.getUserMedia({ audio: true })`
   - Create `MediaRecorder` with `mimeType: 'audio/webm;codecs=opus'`
   - `start(3000)` — emit chunk every 3s
   - `ondataavailable` → callback with Blob
   - Expose: `startRecording()`, `stopRecording()`, `isRecording`

3. **useWebSocket hook**:
   - Connect to `ws://localhost:8000/ws/translate?target_lang={lang}`
   - Send binary Blobs from audio capture
   - Receive JSON messages → parse as `TranslationResult`
   - Auto-reconnect on disconnect (3 attempts, 2s delay)
   - Expose: `sendAudio(blob)`, `isConnected`, `lastResult`

4. **useSubtitles hook**:
   - Maintain `TranslationResult[]` state
   - Add new entries from WebSocket
   - Max 100 entries (trim oldest)
   - Expose: `entries`, `addEntry()`, `clearEntries()`

5. **ControlBar component**:
   - Large mic button (toggle start/stop), pulsing animation when recording
   - Target language dropdown
   - Clear transcript button

6. **SubtitleDisplay component**:
   - Scrollable container, dark background
   - Map entries to `SubtitleEntry` components
   - Auto-scroll to bottom on new entry via `useEffect` + `scrollIntoView`

7. **SubtitleEntry component**:
   ```
   ┌──────────────────────────────────────┐
   │ 🔵 EN  Hello, how are you?          │
   │       → Xin chào, bạn khỏe không?   │
   └──────────────────────────────────────┘
   ```
   - Language badge (color-coded dot + code)
   - Source text (original)
   - Translated text (indented with →)
   - Timestamp (subtle, right-aligned)

8. **App.tsx** — wire everything:
   ```tsx
   function App() {
     const [targetLang, setTargetLang] = useState<Language>('vi');
     const { entries, addEntry, clearEntries } = useSubtitles();
     const ws = useWebSocket(targetLang, addEntry);
     const audio = useAudioCapture((blob) => ws.sendAudio(blob));

     return (
       <div className="min-h-screen bg-gray-950 text-white flex flex-col">
         <ControlBar
           isRecording={audio.isRecording}
           onToggle={() => audio.isRecording ? audio.stop() : audio.start()}
           targetLang={targetLang}
           onLangChange={setTargetLang}
           onClear={clearEntries}
         />
         <SubtitleDisplay entries={entries} />
         <StatusIndicator
           isRecording={audio.isRecording}
           isConnected={ws.isConnected}
         />
       </div>
     );
   }
   ```

9. **Tailwind styles** — dark theme:
   - Background: `bg-gray-950`
   - Text: `text-gray-100`
   - Subtitle entries: `bg-gray-900/50` with border
   - Mic button: large circle, red when recording

## Todo List

- [x] Define TypeScript types and constants
- [x] Implement useAudioCapture hook (MediaRecorder)
- [x] Implement useWebSocket hook (connect, send, receive)
- [x] Implement useSubtitles hook (state management)
- [x] Build ControlBar component (mic + lang selector)
- [x] Build SubtitleDisplay component (scrolling list)
- [x] Build SubtitleEntry component (bilingual entry)
- [x] Build StatusIndicator component
- [x] Wire everything in App.tsx
- [x] Style with Tailwind (dark theme, responsive)
- [x] Test mic permission flow in Chrome

## Success Criteria

- Mic permission requested on first click
- Audio chunks sent via WebSocket every 3s while recording
- Translation results render as subtitle entries
- Auto-scroll works
- Language selector changes target language
- Responsive on different screen widths
- Dark theme looks clean

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| MediaRecorder codec not supported | Low | Medium | Fallback to `audio/webm` without codec spec |
| WebSocket drops frequently | Low | Medium | Auto-reconnect with backoff |
| Audio chunks too large | Low | Low | Limit `timeslice` to 3s max |
| No mic on device | Low | Low | Show clear error message |

## Security Considerations
- Mic permission handled by browser (user consent required)
- Audio only sent to localhost (no external)
- No sensitive data stored
