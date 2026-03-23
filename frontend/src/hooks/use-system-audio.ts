import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Receives system audio PCM from the Rust/Swift ScreenCaptureKit capture
 * via Tauri events and feeds it to the WebSocket as binary blobs.
 *
 * Only active when running inside Tauri.
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
  const onChunkRef = useRef(onChunk);
  onChunkRef.current = onChunk;
  const unlistenRef = useRef<(() => void) | null>(null);

  const start = useCallback(async () => {
    if (!("__TAURI_INTERNALS__" in window)) {
      setError("System audio capture requires the desktop app.");
      return;
    }

    try {
      setError(null);
      const { invoke } = await import("@tauri-apps/api/core");
      const { listen } = await import("@tauri-apps/api/event");

      // Listen for PCM chunks from Rust
      const unlisten = await listen<string>("system-audio-chunk", (event) => {
        // Decode base64 to binary
        const binaryStr = atob(event.payload);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const blob = new Blob([bytes.buffer], { type: "application/octet-stream" });
        onChunkRef.current(blob);
      });
      unlistenRef.current = unlisten;

      // Listen for capture stop
      const unlistenStop = await listen("system-audio-stopped", () => {
        setIsCapturing(false);
      });

      // Start the Swift capture helper
      await invoke("start_system_audio");
      setIsCapturing(true);

      // Combine cleanup
      unlistenRef.current = () => {
        unlisten();
        unlistenStop();
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isCapturing) {
        stop();
      }
    };
  }, [isCapturing, stop]);

  return { isCapturing, error, start, stop, enabled };
}
