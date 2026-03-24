import { useCallback, useEffect, useRef, useState } from "react";

const PERMISSION_ERROR =
  "Screen Recording permission required. Click to open System Settings.";

/**
 * Receives system audio PCM from the Rust/Swift ScreenCaptureKit capture
 * via Tauri events and feeds it to the WebSocket as binary blobs.
 * Detects permission errors and provides a way to open System Settings.
 */
export function useSystemAudio({
  onChunk,
  enabled,
}: {
  onChunk: (blob: Blob) => void;
  enabled: boolean;
}) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const onChunkRef = useRef(onChunk);
  onChunkRef.current = onChunk;
  const unlistenRef = useRef<(() => void) | null>(null);

  const openPermissionSettings = useCallback(async () => {
    if ("__TAURI_INTERNALS__" in window) {
      const { invoke } = await import("@tauri-apps/api/core");
      // Open macOS Screen Recording privacy settings
      await invoke("open_screen_recording_settings").catch(() => {
        // Fallback: use shell open
        window.open("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
      });
    }
  }, []);

  const start = useCallback(async () => {
    if (!("__TAURI_INTERNALS__" in window)) {
      setError("System audio capture requires the desktop app.");
      return;
    }

    try {
      setError(null);
      setNeedsPermission(false);
      const { invoke } = await import("@tauri-apps/api/core");
      const { listen } = await import("@tauri-apps/api/event");

      // Listen for PCM chunks from Rust
      const unlisten = await listen<string>("system-audio-chunk", (event) => {
        const binaryStr = atob(event.payload);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const blob = new Blob([bytes.buffer], { type: "application/octet-stream" });
        onChunkRef.current(blob);
      });

      // Listen for capture stop
      const unlistenStop = await listen("system-audio-stopped", () => {
        setIsCapturing(false);
      });

      // Listen for permission errors from Rust
      const unlistenError = await listen<string>("system-audio-error", (event) => {
        if (event.payload === "PERMISSION_DENIED") {
          setError(PERMISSION_ERROR);
          setNeedsPermission(true);
          setIsCapturing(false);
        } else {
          setError(event.payload);
          setIsCapturing(false);
        }
      });

      // Start the Swift capture helper
      await invoke("start_system_audio");
      setIsCapturing(true);

      unlistenRef.current = () => {
        unlisten();
        unlistenStop();
        unlistenError();
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("PERMISSION_DENIED")) {
        setError(PERMISSION_ERROR);
        setNeedsPermission(true);
      } else {
        setError(msg);
      }
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("stop_system_audio");
    } catch {
      // ignore
    }
    unlistenRef.current?.();
    unlistenRef.current = null;
    setIsCapturing(false);
  }, []);

  useEffect(() => {
    return () => {
      if (isCapturing) {
        stop();
      }
    };
  }, [isCapturing, stop]);

  return { isCapturing, error, needsPermission, openPermissionSettings, start, stop, enabled };
}
