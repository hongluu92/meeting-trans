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

function IconMic() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function IconMonitor() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function IconPopOut() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" x2="21" y1="14" y2="3" />
    </svg>
  );
}

const selectClass =
  "bg-transparent text-[var(--text-secondary)] border border-[var(--border)] rounded-lg px-2.5 py-1 text-xs cursor-pointer " +
  "focus:outline-none focus:border-[var(--accent)] hover:border-[var(--text-muted)] " +
  "disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150";

const btnClass =
  "text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1.5 rounded-lg cursor-pointer " +
  "hover:bg-[var(--bg-elevated)] transition-colors duration-150";

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
    <header className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)]">
      {/* Left: controls */}
      <div className="flex items-center gap-2.5 min-w-0">
        {/* Connection dot */}
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${isConnected ? "bg-emerald-500" : "bg-[var(--red)]"}`}
          title={isConnected ? "Connected" : "Disconnected"}
        />

        {/* Audio source */}
        {onAudioSourceChange && (
          <div className="flex items-center gap-1.5 shrink-0 text-[var(--text-muted)]">
            {audioSource === "mic" ? <IconMic /> : <IconMonitor />}
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
        <div className="flex items-center gap-1.5">
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

          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0">
            <path d="M5 12h14m-4-4 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>

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
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-0.5 shrink-0">
        {onPopOut && (
          <button onClick={onPopOut} className={btnClass} title="Pop out captions">
            <IconPopOut />
          </button>
        )}
        {onExport && (
          <button onClick={onExport} className={btnClass} title="Export transcript">
            <IconDownload />
          </button>
        )}
        <button onClick={onClear} className={btnClass} title="Clear all">
          <IconTrash />
        </button>
      </div>
    </header>
  );
}
