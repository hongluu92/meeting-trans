import { useCallback, useEffect, useState } from "react";
import { ControlBar } from "./components/control-bar";
import { ErrorBoundary } from "./components/error-boundary";
import { LoadingScreen } from "./components/loading-screen";
import { RecordButton } from "./components/record-button";
import { SubtitleDisplay } from "./components/subtitle-display";
import { useAudioCapture } from "./hooks/use-audio-capture";
import { useSubtitles } from "./hooks/use-subtitles";
import { useWebSocket } from "./hooks/use-websocket";
import type { Language, SourceLanguage } from "./types";
import { downloadTranscript } from "./utils/export-transcript";

function AppInner() {
  const [sourceLang, setSourceLang] = useState<SourceLanguage>("auto");
  const [targetLang, setTargetLang] = useState<Language>("vi");
  const [modelReady, setModelReady] = useState(false);
  const [modelStatus, setModelStatus] = useState("Checking model status...");

  const { entries, addEntry, clearEntries } = useSubtitles();
  const ws = useWebSocket({ sourceLang, targetLang, onResult: addEntry });
  const { sendAudio } = ws;

  const onChunk = useCallback(
    (blob: Blob) => sendAudio(blob),
    [sendAudio],
  );
  const audio = useAudioCapture({ onChunk });

  // Poll model status on mount
  useEffect(() => {
    let cancelled = false;

    async function checkStatus() {
      while (!cancelled) {
        try {
          const res = await fetch("/api/status");
          const data = await res.json();
          if (data.model_loaded) {
            setModelReady(true);
            return;
          }
          setModelStatus(
            data.model_loading
              ? "Loading model... this may take a minute"
              : "Waiting for backend...",
          );
        } catch {
          setModelStatus("Waiting for backend...");
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    checkStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleRecording = useCallback(() => {
    if (audio.isRecording) {
      audio.stop();
      ws.disconnect();
    } else {
      ws.connect();
      audio.start();
    }
  }, [audio, ws]);

  // Space to toggle recording
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.target === document.body) {
        e.preventDefault();
        toggleRecording();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleRecording]);

  if (!modelReady) {
    return <LoadingScreen status={modelStatus} />;
  }

  return (
    <div className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden">
      <ControlBar
        isConnected={ws.isConnected}
        sourceLang={sourceLang}
        targetLang={targetLang}
        onSourceLangChange={setSourceLang}
        onLangChange={setTargetLang}
        onClear={clearEntries}
        onExport={
          entries.length > 0 ? () => downloadTranscript(entries) : undefined
        }
      />
      <SubtitleDisplay entries={entries} />
      <RecordButton
        isRecording={audio.isRecording}
        onToggle={toggleRecording}
        isConnected={ws.isConnected}
        isProcessing={ws.isProcessing}
        error={audio.error}
      />
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}

export default App;
