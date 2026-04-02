import { LANG_COLORS } from "../types";
import type { TranslationResult } from "../types";

interface SubtitleEntryProps {
  entry: TranslationResult;
}

export function SubtitleEntry({ entry }: SubtitleEntryProps) {
  const sourceColor = LANG_COLORS[entry.source_lang] ?? "text-[var(--text-muted)]";
  const showTranslation = entry.source_lang !== entry.target_lang && (Boolean(entry.translated_text) || Boolean(entry.translating));
  const time = new Date(entry.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className={`group px-5 py-3 ${entry.partial ? "opacity-50" : "animate-fade-in"}`}>
      <div className="flex items-start gap-3">
        {/* Timestamp */}
        <span className="text-[10px] text-[var(--text-muted)] pt-1.5 shrink-0 tabular-nums opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          {time}
        </span>

        <div className="flex-1 min-w-0 space-y-0.5">
          {/* Source text */}
          <div className="flex items-baseline gap-2">
            <span className={`text-[9px] font-semibold uppercase tracking-widest shrink-0 ${sourceColor}`}>
              {entry.source_lang}
            </span>
            <span className={`text-[15px] leading-relaxed ${
              entry.partial ? "text-[var(--text-secondary)] italic" : "text-[var(--text-primary)]"
            }`}>
              {entry.source_text}{entry.partial ? "..." : ""}
            </span>
          </div>

          {/* Translation */}
          {showTranslation && (
            <div className="pl-[calc(2ch+0.5rem)]">
              {entry.translating ? (
                <span className="text-[var(--text-muted)] text-sm italic">translating...</span>
              ) : (
                <span className="text-[var(--text-secondary)] text-sm leading-relaxed">
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
