import { useCallback, useEffect, useRef, useState } from "react";
import type { TranslationResult } from "../types";
import { LANG_COLORS } from "../types";
import { SUBTITLE_CHANNEL } from "../hooks/use-subtitles";

const MAX_VISIBLE = 4;

/**
 * Minimal floating caption display for popup window.
 * Listens to BroadcastChannel for subtitle entries from the main window.
 * Shows only the last few bilingual lines on a dark semi-transparent background.
 */
export function CaptionOverlay() {
  const [entries, setEntries] = useState<TranslationResult[]>([]);
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

  return (
    <div className="h-screen bg-gray-950/95 text-white flex flex-col overflow-hidden select-none">
      {/* Draggable titlebar area */}
      <div
        className="shrink-0 h-7 flex items-center justify-center text-[10px] text-gray-600 uppercase tracking-widest"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        Live Captions
      </div>

      {/* Subtitles */}
      <div className="flex-1 overflow-y-auto px-3 pb-2">
        {entries.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-600 text-sm">Waiting for captions...</p>
          </div>
        ) : (
          entries.map((entry, i) => (
            <CaptionLine key={`${entry.timestamp}-${i}`} entry={entry} />
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function CaptionLine({ entry }: { entry: TranslationResult }) {
  const sourceColor = LANG_COLORS[entry.source_lang] ?? "text-gray-400";

  return (
    <div className={`py-1.5 ${entry.partial ? "opacity-50" : "animate-fade-in"}`}>
      {/* Source text */}
      <p className={`text-base leading-snug ${entry.partial ? "text-gray-400 italic" : "text-white"}`}>
        <span className={`text-[9px] font-medium uppercase mr-1.5 ${sourceColor}`}>
          {entry.source_lang}
        </span>
        {entry.source_text}{entry.partial ? "..." : ""}
      </p>

      {/* Translation */}
      {(entry.translated_text || entry.translating) && (
        <p className="text-sm text-gray-400 leading-snug mt-0.5 pl-[2px]">
          {entry.translating ? (
            <span className="italic text-gray-600">...</span>
          ) : (
            entry.translated_text
          )}
        </p>
      )}
    </div>
  );
}
