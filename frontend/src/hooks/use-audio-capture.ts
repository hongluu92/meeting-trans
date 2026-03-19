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

  const start = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          onChunk(e.data);
        }
      };

      recorder.start(timeslice);
      setIsRecording(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to access microphone";
      setError(message);
    }
  }, [onChunk, timeslice]);

  const stop = useCallback(() => {
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
