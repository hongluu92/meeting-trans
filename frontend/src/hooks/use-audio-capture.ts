import { useCallback, useRef, useState } from "react";

interface UseAudioCaptureOptions {
  onChunk: (blob: Blob) => void;
}

/**
 * Captures mic audio as raw Float32 PCM at 16kHz using AudioWorklet.
 * Posts binary chunks (~256ms each) via onChunk callback.
 */
export function useAudioCapture({ onChunk }: UseAudioCaptureOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onChunkRef = useRef(onChunk);
  onChunkRef.current = onChunk;

  const start = useCallback(async () => {
    try {
      setError(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      // Create AudioContext at 16kHz — browser resamples for us
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      await audioContext.audioWorklet.addModule("/audio-worklet-processor.js");

      const source = audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioContext, "pcm-capture-processor");
      workletNodeRef.current = workletNode;

      workletNode.port.onmessage = (event: MessageEvent) => {
        const { pcm } = event.data as { pcm: Float32Array };
        if (pcm && pcm.length > 0) {
          // Send raw Float32 bytes — use slice() to get exact byte range
          const blob = new Blob(
            [pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength)],
            { type: "application/octet-stream" },
          );
          onChunkRef.current(blob);
        }
      };

      source.connect(workletNode);
      workletNode.connect(audioContext.destination);

      setIsRecording(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to access microphone";
      setError(message);
    }
  }, []);

  const stop = useCallback(() => {
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;

    audioContextRef.current?.close();
    audioContextRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    setIsRecording(false);
  }, []);

  return { isRecording, error, start, stop };
}
