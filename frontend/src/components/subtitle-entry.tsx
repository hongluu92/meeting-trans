import { LANG_COLORS } from "../types";
import type { TranslationResult } from "../types";

interface SubtitleEntryProps {
  entry: TranslationResult;
}

export function SubtitleEntry({ entry }: SubtitleEntryProps) {
  const sourceColor = LANG_COLORS[entry.source_lang] ?? "text-gray-400";
  const targetColor = LANG_COLORS[entry.target_lang] ?? "text-gray-400";
  const time = new Date(entry.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-lg px-4 py-3 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-medium uppercase tracking-wider ${sourceColor}`}
            >
              {entry.source_lang}
            </span>
            <span className="text-gray-100">{entry.source_text}</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-medium uppercase tracking-wider ${targetColor}`}
            >
              {entry.target_lang}
            </span>
            <span className="text-gray-300">
              → {entry.translated_text}
            </span>
          </div>
        </div>
        <span className="text-xs text-gray-600 whitespace-nowrap">{time}</span>
      </div>
    </div>
  );
}
