export interface TranslationResult {
  source_lang: string;
  source_text: string;
  target_lang: string;
  translated_text: string;
  translating?: boolean;
  partial?: boolean;
  duration_ms?: number;
  timestamp: number;
}

export type Language =
  | "en" | "ja" | "vi" | "ko"
  | "zh" | "es" | "fr" | "de" | "pt" | "ru"
  | "ar" | "hi" | "th" | "id" | "ms" | "tl"
  | "it" | "nl" | "pl" | "tr" | "uk" | "sv";

export type SourceLanguage = "auto" | Language;
export type AudioSource = "mic" | "system";
export type TranslationEngine = "nllb" | "google";

export const AUDIO_SOURCE_LABELS: Record<AudioSource, string> = {
  mic: "Microphone",
  system: "System Audio",
};

export const TRANSLATION_ENGINE_LABELS: Record<TranslationEngine, string> = {
  nllb: "NLLB (Offline)",
  google: "Google",
};

export const LANG_LABELS: Record<Language, string> = {
  en: "English",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
  vi: "Tiếng Việt",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  ru: "Русский",
  ar: "العربية",
  hi: "हिन्दी",
  th: "ไทย",
  id: "Bahasa Indonesia",
  ms: "Bahasa Melayu",
  tl: "Filipino",
  it: "Italiano",
  nl: "Nederlands",
  pl: "Polski",
  tr: "Türkçe",
  uk: "Українська",
  sv: "Svenska",
};

export const SOURCE_LANG_LABELS: Record<SourceLanguage, string> = {
  auto: "Auto",
  ...LANG_LABELS,
};

export type Domain = "general" | "it" | "medical" | "legal" | "business" | "education";

export const DOMAIN_LABELS: Record<Domain, string> = {
  general: "General",
  it: "IT / Tech",
  medical: "Medical",
  legal: "Legal",
  business: "Business",
  education: "Education",
};

export const LANG_COLORS: Record<string, string> = {
  en: "text-sky-400",
  zh: "text-red-400",
  ja: "text-rose-400",
  ko: "text-violet-400",
  vi: "text-emerald-400",
  es: "text-amber-400",
  fr: "text-blue-300",
  de: "text-yellow-400",
  pt: "text-green-400",
  ru: "text-cyan-400",
  ar: "text-orange-400",
  hi: "text-pink-400",
  th: "text-teal-400",
  id: "text-lime-400",
};
