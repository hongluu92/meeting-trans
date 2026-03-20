import { useCallback, useState } from "react";
import type { TranslationResult } from "../types";

const MAX_ENTRIES = 100;

export function useSubtitles() {
  const [entries, setEntries] = useState<TranslationResult[]>([]);

  const addEntry = useCallback((entry: TranslationResult) => {
    if (!entry.source_text?.trim() && !entry.translated_text?.trim()) return;
    setEntries((prev) => {
      // If an entry with the same timestamp exists, update it (e.g. translation arrived)
      const existingIdx = prev.findIndex((e) => e.timestamp === entry.timestamp);
      if (existingIdx !== -1) {
        const next = [...prev];
        next[existingIdx] = entry;
        return next;
      }
      const next = [...prev, entry];
      return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
    });
  }, []);

  const clearEntries = useCallback(() => {
    setEntries([]);
  }, []);

  return { entries, addEntry, clearEntries };
}
