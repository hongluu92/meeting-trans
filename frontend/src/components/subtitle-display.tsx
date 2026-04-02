import { useEffect, useRef } from "react";
import type { TranslationResult } from "../types";
import { SubtitleEntry } from "./subtitle-entry";

interface SubtitleDisplayProps {
  entries: TranslationResult[];
}

export function SubtitleDisplay({ entries }: SubtitleDisplayProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [entries.length]);

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <img src="/logo.svg" alt="" className="w-12 h-12 mx-auto opacity-20" />
          <div className="space-y-1">
            <p className="text-[var(--text-muted)] text-sm">
              Press the mic button to start
            </p>
            <p className="text-[var(--text-muted)] text-[10px] opacity-50">
              or press Space / Cmd+Shift+T
            </p>
          </div>
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
