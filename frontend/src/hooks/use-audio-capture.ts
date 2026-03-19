import { useCallback, useRef, useState } from "react";

interface UseAudioCaptureOptions {
  onChunk: (blob: Blob) => void;
  timeslice?: number;
}

export function useAudioCapture({
  onChunk,
  timeslice = 3000,
}: UseAudioCaptureOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const createRecorder = () => {
        const recorder = new MediaRecorder(stream, { mimeType });
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) onChunk(e.data);
        };
        recorder.onerror = (ev) => console.error("[AudioCapture] recorder error:", ev);
        recorder.start();
        mediaRecorderRef.current = recorder;
      };

      createRecorder();

      // Stop and restart recorder each interval so every blob
      // is a self-contained WebM file with its own EBML header
      intervalRef.current = setInterval(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
          createRecorder();
        }
      }, timeslice);

      setIsRecording(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to access microphone";
      setError(message);
    }
  }, [onChunk, timeslice]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    mediaRecorderRef.current = null;
    streamRef.current = null;
    setIsRecording(false);
  }, []);

  return { isRecording, error, start, stop };
}
