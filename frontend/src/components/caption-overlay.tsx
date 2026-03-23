import { useCallback, useEffect, useRef, useState } from "react";
import type { TranslationResult } from "../types";
import { LANG_COLORS } from "../types";
import { SUBTITLE_CHANNEL } from "../hooks/use-subtitles";

const MAX_VISIBLE = 3;

/**
 * Native-style floating caption overlay.
 * Transparent background, shows only the last few bilingual lines.
 * Designed for always-on-top borderless window.
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

  // Make the entire window draggable
  useEffect(() => {
    document.body.style.background = "transparent";
    document.documentElement.style.background = "transparent";
  }, []);

  return (
    <div
      className="h-screen flex flex-col justify-end p-3 select-none"
      style={{ background: "transparent", WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {entries.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-white/30 text-xs">Waiting for captions...</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {entries.map((entry, i) => (
            <CaptionLine key={`${entry.timestamp}-${i}`} entry={entry} />
          ))}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function CaptionLine({ entry }: { entry: TranslationResult }) {
  const sourceColor = LANG_COLORS[entry.source_lang] ?? "text-white/60";

  return (
    <div
      className={`rounded-xl px-4 py-2.5 backdrop-blur-xl ${
        entry.partial ? "opacity-60" : "animate-fade-in"
      }`}
      style={{
        background: "rgba(0, 0, 0, 0.75)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
      }}
    >
      {/* Source text — larger, white */}
      <p className={`text-[15px] leading-snug font-medium ${
        entry.partial ? "text-white/50 italic" : "text-white"
      }`}>
        <span className={`text-[9px] uppercase tracking-wider mr-1.5 opacity-60 ${sourceColor}`}>
          {entry.source_lang}
        </span>
        {entry.source_text}{entry.partial ? "..." : ""}
      </p>

      {/* Translation — smaller, muted */}
      {(entry.translated_text || entry.translating) && (
        <p className="text-[13px] text-white/70 leading-snug mt-0.5">
          {entry.translating ? (
            <span className="text-white/30 italic">translating...</span>
          ) : (
            entry.translated_text
          )}
        </p>
      )}
    </div>
  );
}
