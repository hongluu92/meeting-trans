import {
  LANG_LABELS,
  SOURCE_LANG_LABELS,
  type Language,
  type SourceLanguage,
} from "../types";

interface ControlBarProps {
  isConnected: boolean;
  sourceLang: SourceLanguage;
  targetLang: Language;
  onSourceLangChange: (lang: SourceLanguage) => void;
  onLangChange: (lang: Language) => void;
  onClear: () => void;
  onExport?: () => void;
}

export function ControlBar({
  isConnected,
  sourceLang,
  targetLang,
  onSourceLangChange,
  onLangChange,
  onClear,
  onExport,
}: ControlBarProps) {
  return (
    <header className="shrink-0 bg-gray-950 flex items-center justify-between px-4 py-3 border-b border-gray-800">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-white tracking-tight mr-1">Meeting Trans</span>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">From</span>
          <select
            value={sourceLang}
            onChange={(e) => onSourceLangChange(e.target.value as SourceLanguage)}
            className="bg-gray-800 text-white border border-gray-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
          >
            {(Object.entries(SOURCE_LANG_LABELS) as [SourceLanguage, string][]).map(
              ([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ),
            )}
          </select>
        </div>

        <span className="text-gray-600">→</span>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">To</span>
          <select
            value={targetLang}
            onChange={(e) => onLangChange(e.target.value as Language)}
            className="bg-gray-800 text-white border border-gray-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
          >
            {(Object.entries(LANG_LABELS) as [Language, string][]).map(
              ([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ),
            )}
          </select>
        </div>

        {!isConnected && (
          <span className="text-xs text-yellow-400">Disconnected</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {onExport && (
          <button
            onClick={onExport}
            className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded border border-gray-700 hover:border-gray-500 transition-colors"
          >
            Export
          </button>
        )}
        <button
          onClick={onClear}
          className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded border border-gray-700 hover:border-gray-500 transition-colors"
        >
          Clear
        </button>
      </div>
    </header>
  );
}
