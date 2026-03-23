import { useCallback, useEffect, useState } from "react";
import { CaptionOverlay } from "./components/caption-overlay";
import { ControlBar } from "./components/control-bar";
import { ErrorBoundary } from "./components/error-boundary";
import { LoadingScreen } from "./components/loading-screen";
import { RecordButton } from "./components/record-button";
import { SubtitleDisplay } from "./components/subtitle-display";
import { useAudioCapture } from "./hooks/use-audio-capture";
import { useSubtitles } from "./hooks/use-subtitles";
import { useWebSocket } from "./hooks/use-websocket";
import type { AudioSource, Language, SourceLanguage } from "./types";
import { downloadTranscript } from "./utils/export-transcript";

function AppInner() {
  const [sourceLang, setSourceLang] = useState<SourceLanguage>("auto");
  const [targetLang, setTargetLang] = useState<Language>("vi");
  const [audioSource, setAudioSource] = useState<AudioSource>("mic");
  const [modelReady, setModelReady] = useState(false);
  const [modelStatus, setModelStatus] = useState("Checking model status...");
  const [loadingStep, setLoadingStep] = useState("");

  const { entries, addEntry, clearEntries } = useSubtitles();
  const ws = useWebSocket({ sourceLang, targetLang, onResult: addEntry });
  const { sendAudio } = ws;

  const onChunk = useCallback(
    (blob: Blob) => sendAudio(blob),
    [sendAudio],
  );
  const audio = useAudioCapture({ onChunk, audioSource });

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
          setLoadingStep(data.loading_step || "");
          setModelStatus(
            data.model_loading
              ? "This may take a minute on first run"
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

  const popOutCaptions = useCallback(async () => {
    // Use Tauri native always-on-top window when available, fallback to browser popup
    if ("__TAURI_INTERNALS__" in window) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_caption_overlay");
    } else {
      window.open(
        "/caption",
        "live-captions",
        "width=480,height=320,menubar=no,toolbar=no,location=no,status=no",
      );
    }
  }, []);

  if (!modelReady) {
    return <LoadingScreen status={modelStatus} step={loadingStep} />;
  }

  return (
    <div className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden">
      <ControlBar
        isConnected={ws.isConnected}
        sourceLang={sourceLang}
        targetLang={targetLang}
        audioSource={audioSource}
        isRecording={audio.isRecording}
        onSourceLangChange={setSourceLang}
        onLangChange={setTargetLang}
        onAudioSourceChange={setAudioSource}
        onClear={clearEntries}
        onExport={
          entries.length > 0 ? () => downloadTranscript(entries) : undefined
        }
        onPopOut={popOutCaptions}
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
  // Render caption-only overlay for popup window
  if (window.location.pathname === "/caption") {
    return <CaptionOverlay />;
  }

  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}

export default App;
