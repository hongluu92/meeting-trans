import { useCallback, useEffect, useRef, useState } from "react";
import type { Language, SourceLanguage, TranslationResult } from "../types";

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 2000;

interface UseWebSocketOptions {
  sourceLang: SourceLanguage;
  targetLang: Language;
  onResult: (result: TranslationResult) => void;
}

export function useWebSocket({ sourceLang, targetLang, onResult }: UseWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const sourceLangRef = useRef(sourceLang);
  const targetLangRef = useRef(targetLang);
  const onResultRef = useRef(onResult);
  const connectRef = useRef<() => void>();

  // Keep refs current
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    sourceLangRef.current = sourceLang;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ source_lang: sourceLang }));
    }
  }, [sourceLang]);

  useEffect(() => {
    targetLangRef.current = targetLang;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ target_lang: targetLang }));
    }
  }, [targetLang]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      reconnectCountRef.current = MAX_RECONNECT_ATTEMPTS;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const url = `${protocol}//${host}/ws/translate?target_lang=${targetLangRef.current}&source_lang=${sourceLangRef.current}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      reconnectCountRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.error) {
          console.error("[WS] server error:", data.error);
          setIsProcessing(false);
          return;
        }
        if (data.status === "no_speech") {
          setIsProcessing(false);
          return;
        }
        setIsProcessing(false);
        onResultRef.current(data as TranslationResult);
      } catch {
        console.error("[WS] failed to parse message");
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;

      if (reconnectCountRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectCountRef.current++;
        setTimeout(() => connectRef.current?.(), RECONNECT_DELAY_MS);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  // Store connect in ref for self-referencing in reconnect
  connectRef.current = connect;

  const disconnect = useCallback(() => {
    reconnectCountRef.current = MAX_RECONNECT_ATTEMPTS;
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnected(false);
    setIsProcessing(false);
  }, []);

  const sendAudio = useCallback((blob: Blob) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      setIsProcessing(true);
      wsRef.current.send(blob);
    }
  }, []);

  return { isConnected, isProcessing, connect, disconnect, sendAudio };
}
