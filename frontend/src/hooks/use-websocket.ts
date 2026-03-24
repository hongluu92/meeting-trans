import { useCallback, useEffect, useRef, useState } from "react";
import type { Domain, Language, SourceLanguage, TranslationResult } from "../types";

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 2000;

interface UseWebSocketOptions {
  sourceLang: SourceLanguage;
  targetLang: Language;
  domain: Domain;
  onResult: (result: TranslationResult) => void;
}

export function useWebSocket({ sourceLang, targetLang, domain, onResult }: UseWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const sourceLangRef = useRef(sourceLang);
  const targetLangRef = useRef(targetLang);
  const domainRef = useRef(domain);
  const onResultRef = useRef(onResult);
  const connectRef = useRef<() => void>(undefined);

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

  useEffect(() => {
    domainRef.current = domain;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ domain }));
    }
  }, [domain]);

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
    const hostname = window.location.hostname;
    const apiPort = import.meta.env.VITE_API_PORT || "8000";
    const url = `${protocol}//${hostname}:${apiPort}/ws/translate?target_lang=${targetLangRef.current}&source_lang=${sourceLangRef.current}&domain=${domainRef.current}`;

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
        onResultRef.current(data as TranslationResult);
        // Only clear processing when translation is done (or not needed)
        if (!data.translating) {
          setIsProcessing(false);
        }
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
    // Signal backend to flush remaining audio before closing
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "stop" }));
    }
    reconnectCountRef.current = MAX_RECONNECT_ATTEMPTS;
    // Small delay to let the stop message send before closing
    setTimeout(() => {
      wsRef.current?.close();
      wsRef.current = null;
      setIsConnected(false);
      setIsProcessing(false);
    }, 100);
  }, []);

  const sendAudio = useCallback((blob: Blob) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      setIsProcessing(true);
      wsRef.current.send(blob);
    }
  }, []);

  return { isConnected, isProcessing, connect, disconnect, sendAudio };
}
