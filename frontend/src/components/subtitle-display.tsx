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
        <p className="text-gray-500 text-lg">
          Press the mic button to start translating
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto py-2 divide-y divide-gray-800/50">
      {entries.map((entry, i) => (
        <SubtitleEntry key={entry.timestamp || i} entry={entry} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
