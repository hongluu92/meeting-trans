export interface TranslationResult {
  source_lang: string;
  source_text: string;
  target_lang: string;
  translated_text: string;
  duration_ms?: number;
  timestamp: number;
}

export type Language = "en" | "ja" | "vi";
export type SourceLanguage = "auto" | Language;

export const LANG_LABELS: Record<Language, string> = {
  en: "English",
  ja: "日本語",
  vi: "Tiếng Việt",
};

export const SOURCE_LANG_LABELS: Record<SourceLanguage, string> = {
  auto: "Auto-detect",
  en: "English",
  ja: "日本語",
  vi: "Tiếng Việt",
};

export const LANG_COLORS: Record<string, string> = {
  en: "text-blue-400",
  ja: "text-red-400",
  vi: "text-green-400",
};
