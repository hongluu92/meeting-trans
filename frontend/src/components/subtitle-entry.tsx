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
    <div className={`px-4 py-2 ${entry.partial ? "opacity-60" : "animate-fade-in"}`}>
      <div className="flex items-start gap-3">
        <span className="text-xs text-gray-600 pt-1 shrink-0">{time}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span
              className={`text-[10px] font-medium uppercase tracking-wider shrink-0 ${sourceColor}`}
            >
              {entry.source_lang}
            </span>
            <span className={`text-lg leading-snug ${entry.partial ? "text-gray-400 italic" : "text-white"}`}>
              {entry.source_text}{entry.partial ? "..." : ""}
            </span>
          </div>
          {(entry.translated_text || entry.translating) && (
            <div className="flex items-baseline gap-2 mt-0.5">
              <span
                className={`text-[10px] font-medium uppercase tracking-wider shrink-0 ${targetColor}`}
              >
                {entry.target_lang}
              </span>
              {entry.translating ? (
                <span className="text-gray-500 text-sm italic">...</span>
              ) : (
                <span className="text-gray-400 text-sm leading-snug">
                  {entry.translated_text}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
