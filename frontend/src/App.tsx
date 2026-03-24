import { useCallback, useEffect, useState } from "react";
import { CaptionOverlay } from "./components/caption-overlay";
import { ControlBar } from "./components/control-bar";
import { ErrorBoundary } from "./components/error-boundary";
import { LoadingScreen } from "./components/loading-screen";
import { RecordButton } from "./components/record-button";
import { SubtitleDisplay } from "./components/subtitle-display";
import { useAudioCapture } from "./hooks/use-audio-capture";
import { useSubtitles } from "./hooks/use-subtitles";
import { useSystemAudio } from "./hooks/use-system-audio";
import { useWebSocket } from "./hooks/use-websocket";
import type { AudioSource, Domain, Language, SourceLanguage } from "./types";
import { downloadTranscript } from "./utils/export-transcript";
import type { ExportFormat } from "./utils/export-transcript";

const isTauri = "__TAURI_INTERNALS__" in window;

function AppInner() {
  const [sourceLang, setSourceLang] = useState<SourceLanguage>("auto");
  const [targetLang, setTargetLang] = useState<Language>("vi");
  const [audioSource, setAudioSource] = useState<AudioSource>("mic");
  const [domain, setDomain] = useState<Domain>("general");
  const [modelReady, setModelReady] = useState(false);
  const [modelStatus, setModelStatus] = useState("Checking model status...");
  const [loadingStep, setLoadingStep] = useState("");

  const { entries, addEntry, clearEntries } = useSubtitles();
  const ws = useWebSocket({ sourceLang, targetLang, domain, onResult: addEntry });
  const { sendAudio } = ws;

  const onChunk = useCallback(
    (blob: Blob) => sendAudio(blob),
    [sendAudio],
  );

  // Mic capture (browser API — works in both browser and Tauri)
  const micAudio = useAudioCapture({ onChunk, audioSource: "mic" });

  // System audio capture (Tauri-only, via ScreenCaptureKit)
  const sysAudio = useSystemAudio({
    onChunk,
    enabled: isTauri && audioSource === "system",
  });

  // Unified recording state
  const isRecording = audioSource === "system" ? sysAudio.isCapturing : micAudio.isRecording;
  const audioError = audioSource === "system" ? sysAudio.error : micAudio.error;
  const { needsPermission, openPermissionSettings } = sysAudio;

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
    if (isRecording) {
      if (audioSource === "system") {
        sysAudio.stop();
      } else {
        micAudio.stop();
      }
      ws.disconnect();
    } else {
      ws.connect();
      if (audioSource === "system") {
        sysAudio.start();
      } else {
        micAudio.start();
      }
    }
  }, [isRecording, audioSource, micAudio, sysAudio, ws]);

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
    if (isTauri) {
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
    <div className="h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex flex-col overflow-hidden">
      <ControlBar
        isConnected={ws.isConnected}
        sourceLang={sourceLang}
        targetLang={targetLang}
        audioSource={audioSource}
        domain={domain}
        isRecording={isRecording}
        onSourceLangChange={setSourceLang}
        onLangChange={setTargetLang}
        onAudioSourceChange={setAudioSource}
        onDomainChange={setDomain}
        onClear={clearEntries}
        onExport={
          entries.length > 0
            ? (format: ExportFormat) => downloadTranscript(entries, format)
            : undefined
        }
        onPopOut={popOutCaptions}
      />
      <SubtitleDisplay entries={entries} />
      <RecordButton
        isRecording={isRecording}
        onToggle={toggleRecording}
        isConnected={ws.isConnected}
        isProcessing={ws.isProcessing}
        error={audioError}
        needsPermission={needsPermission}
        onOpenSettings={openPermissionSettings}
      />
    </div>
  );
}

function App() {
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
