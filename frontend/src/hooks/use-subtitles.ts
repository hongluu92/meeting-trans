import { useCallback, useRef, useState } from "react";
import type { TranslationResult } from "../types";

const MAX_ENTRIES = 100;

// BroadcastChannel for syncing subtitles to caption popup windows
const SUBTITLE_CHANNEL = "subtitle-sync";

export function useSubtitles() {
  const [entries, setEntries] = useState<TranslationResult[]>([]);
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Lazy-init BroadcastChannel (avoids creating in caption window)
  const getChannel = useCallback(() => {
    if (!channelRef.current) {
      channelRef.current = new BroadcastChannel(SUBTITLE_CHANNEL);
    }
    return channelRef.current;
  }, []);

  const addEntry = useCallback((entry: TranslationResult) => {
    if (!entry.source_text?.trim() && !entry.translated_text?.trim()) return;
    setEntries((prev) => {
      const existingIdx = prev.findIndex((e) => e.timestamp === entry.timestamp);
      if (existingIdx !== -1) {
        const next = [...prev];
        next[existingIdx] = entry;
        return next;
      }
      const next = [...prev, entry];
      return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
    });
    // Broadcast to caption popup
    try { getChannel().postMessage(entry); } catch { /* popup closed */ }
  }, [getChannel]);

  const clearEntries = useCallback(() => {
    setEntries([]);
    try { getChannel().postMessage({ _clear: true }); } catch { /* noop */ }
  }, [getChannel]);

  return { entries, addEntry, clearEntries };
}

export { SUBTITLE_CHANNEL };
