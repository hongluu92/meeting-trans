import {
  AUDIO_SOURCE_LABELS,
  LANG_LABELS,
  SOURCE_LANG_LABELS,
  type AudioSource,
  type Language,
  type SourceLanguage,
} from "../types";

interface ControlBarProps {
  isConnected: boolean;
  sourceLang: SourceLanguage;
  targetLang: Language;
  audioSource: AudioSource;
  isRecording: boolean;
  onSourceLangChange: (lang: SourceLanguage) => void;
  onLangChange: (lang: Language) => void;
  onAudioSourceChange?: (source: AudioSource) => void;
  onClear: () => void;
  onExport?: () => void;
  onPopOut?: () => void;
}

/** Mic icon */
function MicIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

/** Monitor/system audio icon */
function MonitorIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  );
}

/** Download icon for export */
function DownloadIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  );
}

/** Pop-out / external window icon */
function PopOutIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" x2="21" y1="14" y2="3" />
    </svg>
  );
}

/** Trash icon for clear */
function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

const selectClass =
  "bg-gray-800 text-white border border-gray-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed";

const iconBtnClass =
  "text-gray-400 hover:text-white p-1.5 rounded border border-gray-700 hover:border-gray-500 transition-colors";

export function ControlBar({
  isConnected,
  sourceLang,
  targetLang,
  audioSource,
  isRecording,
  onSourceLangChange,
  onLangChange,
  onAudioSourceChange,
  onClear,
  onExport,
  onPopOut,
}: ControlBarProps) {
  return (
    <header className="shrink-0 bg-gray-950 flex items-center justify-between px-3 py-2 border-b border-gray-800 gap-2">
      {/* Left: audio source + language selects */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Connection status dot */}
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? "bg-green-500" : "bg-red-500"}`}
          title={isConnected ? "Connected" : "Disconnected"}
        />

        {/* Audio source: icon + select */}
        {onAudioSourceChange && (
          <div className="flex items-center gap-1 shrink-0" title="Audio input">
            {audioSource === "mic" ? <MicIcon /> : <MonitorIcon />}
            <select
              value={audioSource}
              onChange={(e) => onAudioSourceChange(e.target.value as AudioSource)}
              disabled={isRecording}
              className={selectClass}
            >
              {(Object.entries(AUDIO_SOURCE_LABELS) as [AudioSource, string][]).map(
                ([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ),
              )}
            </select>
          </div>
        )}

        {/* Language: from → to */}
        <select
          value={sourceLang}
          onChange={(e) => onSourceLangChange(e.target.value as SourceLanguage)}
          className={selectClass}
          title="Source language"
        >
          {(Object.entries(SOURCE_LANG_LABELS) as [SourceLanguage, string][]).map(
            ([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ),
          )}
        </select>

        <span className="text-gray-500 text-xs shrink-0">→</span>

        <select
          value={targetLang}
          onChange={(e) => onLangChange(e.target.value as Language)}
          className={selectClass}
          title="Target language"
        >
          {(Object.entries(LANG_LABELS) as [Language, string][]).map(
            ([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ),
          )}
        </select>
      </div>

      {/* Right: action buttons */}
      <div className="flex items-center gap-1.5 shrink-0">
        {onPopOut && (
          <button onClick={onPopOut} className={iconBtnClass} title="Pop out captions">
            <PopOutIcon />
          </button>
        )}
        {onExport && (
          <button onClick={onExport} className={iconBtnClass} title="Export transcript">
            <DownloadIcon />
          </button>
        )}
        <button onClick={onClear} className={iconBtnClass} title="Clear all">
          <TrashIcon />
        </button>
      </div>
    </header>
  );
}
