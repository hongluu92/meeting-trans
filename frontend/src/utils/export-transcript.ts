import type { TranslationResult } from "../types";

export function exportAsText(entries: TranslationResult[]): string {
  return entries
    .map(
      (e) =>
        `[${e.source_lang.toUpperCase()}] ${e.source_text}\n→ [${e.target_lang.toUpperCase()}] ${e.translated_text}`,
    )
    .join("\n\n");
}

export function downloadTranscript(entries: TranslationResult[]) {
  const text = exportAsText(entries);
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `transcript-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
