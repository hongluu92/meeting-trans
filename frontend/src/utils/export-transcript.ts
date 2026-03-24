import type { TranslationResult } from "../types";

/** Format milliseconds as HH:MM:SS,mmm (SRT format) */
function formatSrtTime(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mill = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(mill).padStart(3, "0")}`;
}

/** Format milliseconds as HH:MM:SS.mmm (VTT format) */
function formatVttTime(ms: number): string {
  return formatSrtTime(ms).replace(",", ".");
}

/** Plain text export: source + translation pairs */
export function exportAsText(entries: TranslationResult[]): string {
  return entries
    .filter((e) => !e.partial)
    .map(
      (e) =>
        `[${e.source_lang.toUpperCase()}] ${e.source_text}` +
        (e.translated_text ? `\n→ [${e.target_lang.toUpperCase()}] ${e.translated_text}` : ""),
    )
    .join("\n\n");
}

/** SRT subtitle export (bilingual: source on line 1, translation on line 2) */
export function exportAsSrt(entries: TranslationResult[]): string {
  const finals = entries.filter((e) => !e.partial);
  const firstTs = finals[0]?.timestamp ?? 0;

  return finals
    .map((e, i) => {
      const startMs = e.timestamp - firstTs;
      const endMs = (finals[i + 1]?.timestamp ?? e.timestamp + 5000) - firstTs;
      const text = e.translated_text
        ? `${e.source_text}\n${e.translated_text}`
        : e.source_text;
      return `${i + 1}\n${formatSrtTime(startMs)} --> ${formatSrtTime(endMs)}\n${text}`;
    })
    .join("\n\n");
}

/** WebVTT subtitle export (bilingual) */
export function exportAsVtt(entries: TranslationResult[]): string {
  const finals = entries.filter((e) => !e.partial);
  const firstTs = finals[0]?.timestamp ?? 0;

  const cues = finals
    .map((e, i) => {
      const startMs = e.timestamp - firstTs;
      const endMs = (finals[i + 1]?.timestamp ?? e.timestamp + 5000) - firstTs;
      const text = e.translated_text
        ? `${e.source_text}\n${e.translated_text}`
        : e.source_text;
      return `${formatVttTime(startMs)} --> ${formatVttTime(endMs)}\n${text}`;
    })
    .join("\n\n");

  return `WEBVTT\n\n${cues}`;
}

/** JSON export with all metadata */
export function exportAsJson(entries: TranslationResult[]): string {
  return JSON.stringify(
    entries.filter((e) => !e.partial),
    null,
    2,
  );
}

export type ExportFormat = "txt" | "srt" | "vtt" | "json";

/** Download transcript in the specified format */
export function downloadTranscript(entries: TranslationResult[], format: ExportFormat = "txt") {
  const exporters: Record<ExportFormat, { fn: (e: TranslationResult[]) => string; mime: string; ext: string }> = {
    txt: { fn: exportAsText, mime: "text/plain", ext: "txt" },
    srt: { fn: exportAsSrt, mime: "text/plain", ext: "srt" },
    vtt: { fn: exportAsVtt, mime: "text/vtt", ext: "vtt" },
    json: { fn: exportAsJson, mime: "application/json", ext: "json" },
  };

  const { fn, mime, ext } = exporters[format];
  const content = fn(entries);
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `transcript-${Date.now()}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}
