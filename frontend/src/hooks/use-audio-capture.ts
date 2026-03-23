import { useCallback, useRef, useState } from "react";
import type { AudioSource } from "../types";

interface UseAudioCaptureOptions {
  onChunk: (blob: Blob) => void;
  audioSource: AudioSource;
}

/**
 * Captures audio as raw Float32 PCM at 16kHz using AudioWorklet.
 * Supports microphone or system audio (via getDisplayMedia).
 * Posts binary chunks (~256ms each) via onChunk callback.
 */
export function useAudioCapture({
  onChunk,
  audioSource,
}: UseAudioCaptureOptions) {
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

      let stream: MediaStream;

      if (audioSource === "system") {
        // getDisplayMedia captures screen + system audio
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true, // required by browser, but we only need audio
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });

        // Stop video tracks immediately — we only need audio
        for (const track of displayStream.getVideoTracks()) {
          track.stop();
        }

        const audioTracks = displayStream.getAudioTracks();
        if (audioTracks.length === 0) {
          throw new Error(
            "No audio track found. Make sure to check 'Share audio' when selecting the screen/tab.",
          );
        }

        // Create a new stream with only audio tracks
        stream = new MediaStream(audioTracks);

        // Listen for user stopping the share via browser UI
        audioTracks[0].onended = () => {
          stop();
        };
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            channelCount: 1,
          },
        });
      }

      streamRef.current = stream;

      // Create AudioContext at 16kHz — browser resamples for us
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      await audioContext.audioWorklet.addModule("/audio-worklet-processor.js");

      const source = audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(
        audioContext,
        "pcm-capture-processor",
      );
      workletNodeRef.current = workletNode;

      workletNode.port.onmessage = (event: MessageEvent) => {
        const { pcm } = event.data as { pcm: Float32Array };
        if (pcm && pcm.length > 0) {
          const buf = new ArrayBuffer(pcm.byteLength);
          new Uint8Array(buf).set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
          const blob = new Blob([buf], { type: "application/octet-stream" });
          onChunkRef.current(blob);
        }
      };

      source.connect(workletNode);
      workletNode.connect(audioContext.destination);

      setIsRecording(true);
    } catch (err) {
      let message = "Failed to access audio source";
      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError") {
          message = "Microphone permission denied. Check System Settings > Privacy > Microphone.";
        } else if (err.name === "NotFoundError") {
          message = "No microphone found.";
        } else {
          message = err.message || message;
        }
      } else if (err instanceof Error && err.message) {
        message = err.message;
      }
      setError(message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioSource]);

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
