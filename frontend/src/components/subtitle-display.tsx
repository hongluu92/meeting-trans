import { useEffect, useRef } from "react";
import type { TranslationResult } from "../types";
import { SubtitleEntry } from "./subtitle-entry";

interface SubtitleDisplayProps {
  entries: TranslationResult[];
}

export function SubtitleDisplay({ entries }: SubtitleDisplayProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-[var(--text-muted)] text-base">
            Press the mic button to start
          </p>
          <p className="text-[var(--text-muted)] text-xs opacity-50">
            or press Space
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)]/30">
      {entries.map((entry, i) => (
        <SubtitleEntry key={`${entry.timestamp}-${i}`} entry={entry} />
      ))}
      <div ref={bottomRef} className="pb-20" />
    </div>
  );
}
