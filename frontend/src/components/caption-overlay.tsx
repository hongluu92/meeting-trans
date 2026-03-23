import { useCallback, useEffect, useRef, useState } from "react";
import type { TranslationResult } from "../types";
import { LANG_COLORS } from "../types";
import { SUBTITLE_CHANNEL } from "../hooks/use-subtitles";

const MAX_VISIBLE = 3;

/**
 * Native-style floating caption overlay.
 * Dark translucent background, close button, drag to move.
 */
export function CaptionOverlay() {
  const [entries, setEntries] = useState<TranslationResult[]>([]);
  const [hovered, setHovered] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const handleMessage = useCallback((event: MessageEvent) => {
    const data = event.data;
    if (data?._clear) {
      setEntries([]);
      return;
    }
    const entry = data as TranslationResult;
    if (!entry.source_text?.trim() && !entry.translated_text?.trim()) return;

    setEntries((prev) => {
      const existingIdx = prev.findIndex((e) => e.timestamp === entry.timestamp);
      if (existingIdx !== -1) {
        const next = [...prev];
        next[existingIdx] = entry;
        return next;
      }
      const next = [...prev, entry];
      return next.length > MAX_VISIBLE ? next.slice(-MAX_VISIBLE) : next;
    });
  }, []);

  useEffect(() => {
    const channel = new BroadcastChannel(SUBTITLE_CHANNEL);
    channel.onmessage = handleMessage;
    return () => channel.close();
  }, [handleMessage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  const closeWindow = useCallback(async () => {
    if ("__TAURI_INTERNALS__" in window) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
    } else {
      window.close();
    }
  }, []);

  return (
    <div
      className="h-screen flex flex-col select-none"
      style={{ background: "rgba(15, 15, 18, 0.92)" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Header: drag area + close button */}
      <div
        className="shrink-0 flex items-center justify-between px-3 py-1.5"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <span className={`text-[10px] uppercase tracking-widest transition-opacity duration-200 ${
          hovered ? "text-white/40" : "text-white/15"
        }`}>
          Live Captions
        </span>
        <button
          onClick={closeWindow}
          className={`w-5 h-5 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 ${
            hovered
              ? "bg-white/10 text-white/60 hover:bg-red-500/80 hover:text-white"
              : "text-transparent"
          }`}
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          title="Close captions"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Captions area */}
      <div className="flex-1 flex flex-col justify-end px-3 pb-3 overflow-hidden">
        {entries.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-white/20 text-xs">Waiting for captions...</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry, i) => (
              <CaptionLine key={`${entry.timestamp}-${i}`} entry={entry} />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function CaptionLine({ entry }: { entry: TranslationResult }) {
  const sourceColor = LANG_COLORS[entry.source_lang] ?? "text-white/50";

  return (
    <div
      className={`rounded-xl px-4 py-3 ${
        entry.partial ? "opacity-50" : "animate-fade-in"
      }`}
      style={{ background: "rgba(255, 255, 255, 0.06)" }}
    >
      {/* Source text */}
      <p className={`text-[15px] leading-relaxed font-medium ${
        entry.partial ? "text-white/40 italic" : "text-white/95"
      }`}>
        <span className={`text-[9px] font-semibold uppercase tracking-widest mr-2 ${sourceColor}`}>
          {entry.source_lang}
        </span>
        {entry.source_text}{entry.partial ? "..." : ""}
      </p>

      {/* Translation */}
      {(entry.translated_text || entry.translating) && (
        <p className="text-[14px] text-white/60 leading-relaxed mt-1">
          {entry.translating ? (
            <span className="text-white/25 italic">translating...</span>
          ) : (
            entry.translated_text
          )}
        </p>
      )}
    </div>
  );
}
