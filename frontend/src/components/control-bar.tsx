import { LANG_LABELS, type Language } from "../types";

interface ControlBarProps {
  isRecording: boolean;
  isConnected: boolean;
  targetLang: Language;
  onToggleRecording: () => void;
  onLangChange: (lang: Language) => void;
  onClear: () => void;
  onExport?: () => void;
}

export function ControlBar({
  isRecording,
  isConnected,
  targetLang,
  onToggleRecording,
  onLangChange,
  onClear,
  onExport,
}: ControlBarProps) {
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleRecording}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
            isRecording
              ? "bg-red-600 hover:bg-red-700 animate-pulse"
              : "bg-gray-700 hover:bg-gray-600"
          }`}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
        >
          {isRecording ? (
            <div className="w-5 h-5 bg-white rounded-sm" />
          ) : (
            <div className="w-5 h-5 bg-red-400 rounded-full" />
          )}
        </button>

        <div className="flex flex-col">
          <span className="text-sm text-gray-400">Translate to</span>
          <select
            value={targetLang}
            onChange={(e) => onLangChange(e.target.value as Language)}
            className="bg-gray-800 text-white border border-gray-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
          >
            {(Object.entries(LANG_LABELS) as [Language, string][]).map(
              ([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ),
            )}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {!isConnected && (
          <span className="text-xs text-yellow-400">Disconnected</span>
        )}
        {onExport && (
          <button
            onClick={onExport}
            className="text-sm text-gray-400 hover:text-white px-3 py-1.5 rounded border border-gray-700 hover:border-gray-500 transition-colors"
          >
            Export
          </button>
        )}
        <button
          onClick={onClear}
          className="text-sm text-gray-400 hover:text-white px-3 py-1.5 rounded border border-gray-700 hover:border-gray-500 transition-colors"
        >
          Clear
        </button>
      </div>
    </header>
  );
}
