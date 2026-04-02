import { useCallback, useEffect, useRef, useState } from "react";
import type { Domain, Language, SourceLanguage, TranslationEngine, TranslationResult } from "../types";

const MAX_RECONNECT_ATTEMPTS = 8;
const RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 15000;
const HEARTBEAT_INTERVAL_MS = 15000;
const MAX_WS_BUFFERED_BYTES = 2 * 1024 * 1024;
const RESUME_WS_BUFFERED_BYTES = 512 * 1024;

interface UseWebSocketOptions {
  sourceLang: SourceLanguage;
  targetLang: Language;
  domain: Domain;
  engine: TranslationEngine;
  onResult: (result: TranslationResult) => void;
}

export function useWebSocket({ sourceLang, targetLang, domain, engine, onResult }: UseWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const sourceLangRef = useRef(sourceLang);
  const targetLangRef = useRef(targetLang);
  const domainRef = useRef(domain);
  const engineRef = useRef(engine);
  const onResultRef = useRef(onResult);
  const connectRef = useRef<() => void>(undefined);
  const heartbeatRef = useRef<number | null>(null);
  const droppingAudioRef = useRef(false);

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

  useEffect(() => {
    engineRef.current = engine;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ engine }));
    }
  }, [engine]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      reconnectCountRef.current = MAX_RECONNECT_ATTEMPTS;
      if (heartbeatRef.current !== null) {
        window.clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const hostname = window.location.hostname;
    const apiPort = import.meta.env.VITE_API_PORT || "8000";
    const url = `${protocol}//${hostname}:${apiPort}/ws/translate?target_lang=${targetLangRef.current}&source_lang=${sourceLangRef.current}&domain=${domainRef.current}&engine=${engineRef.current}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      reconnectCountRef.current = 0;
      droppingAudioRef.current = false;
      if (heartbeatRef.current !== null) {
        window.clearInterval(heartbeatRef.current);
      }
      heartbeatRef.current = window.setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ action: "ping" }));
        }
      }, HEARTBEAT_INTERVAL_MS);
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
        if (data.action === "pong") {
          return;
        }
        onResultRef.current(data as TranslationResult);
        // Only clear processing when translation is done (or not needed)
        if (!data.translating) {
          setIsProcessing(false);
        }
      } catch {
        console.error("[WS] failed to parse message");
        setIsProcessing(false);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      setIsProcessing(false);
      droppingAudioRef.current = false;
      if (heartbeatRef.current !== null) {
        window.clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      wsRef.current = null;

      if (reconnectCountRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectCountRef.current++;
        const delay = Math.min(
          MAX_RECONNECT_DELAY_MS,
          RECONNECT_DELAY_MS * 2 ** (reconnectCountRef.current - 1),
        );
        setTimeout(() => connectRef.current?.(), delay);
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
    if (heartbeatRef.current !== null) {
      window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    // Small delay to let the stop message send before closing
    setTimeout(() => {
      wsRef.current?.close();
      wsRef.current = null;
      setIsConnected(false);
      setIsProcessing(false);
    }, 100);
  }, []);

  const sendAudio = useCallback((blob: Blob) => {
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) return;

    const buffered = ws.bufferedAmount;
    if (buffered > MAX_WS_BUFFERED_BYTES) {
      droppingAudioRef.current = true;
      return;
    }
    if (droppingAudioRef.current && buffered > RESUME_WS_BUFFERED_BYTES) {
      return;
    }
    if (droppingAudioRef.current && buffered <= RESUME_WS_BUFFERED_BYTES) {
      droppingAudioRef.current = false;
    }

    setIsProcessing(true);
    ws.send(blob);
  }, []);

  return { isConnected, isProcessing, connect, disconnect, sendAudio };
}
