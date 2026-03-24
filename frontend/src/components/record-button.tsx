interface RecordButtonProps {
  isRecording: boolean;
  onToggle: () => void;
  isConnected: boolean;
  isProcessing: boolean;
  error: string | null;
  needsPermission?: boolean;
  onOpenSettings?: () => void;
}

export function RecordButton({
  isRecording,
  onToggle,
  isConnected,
  isProcessing,
  error,
  needsPermission,
  onOpenSettings,
}: RecordButtonProps) {
  return (
    <footer className="shrink-0 flex flex-col items-center gap-2 px-4 py-4 border-t border-[var(--border)]">
      {/* Permission error banner */}
      {needsPermission && error && (
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs cursor-pointer hover:bg-amber-500/20 transition-colors duration-150"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>Screen Recording permission required — click to open Settings</span>
        </button>
      )}

      {/* Main row: status + button + status */}
      <div className="flex items-center gap-5">
        {/* Left status */}
        <div className="flex items-center gap-2 text-xs w-32 justify-end">
          {error && !needsPermission && (
            <span className="text-[var(--red)] truncate">{error}</span>
          )}
          {!error && isProcessing && (
            <span className="text-[var(--text-muted)]">Processing...</span>
          )}
        </div>

        {/* Record button */}
        <button
          onClick={onToggle}
          className={`relative w-14 h-14 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 ${
            isRecording
              ? "bg-[var(--red)] animate-pulse-ring"
              : "bg-[var(--bg-elevated)] hover:bg-zinc-700"
          }`}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
        >
          {isRecording ? (
            <div className="w-5 h-5 bg-white rounded-sm" />
          ) : (
            <div className="w-5 h-5 bg-[var(--red)] rounded-full" />
          )}
        </button>

        {/* Right status */}
        <div className="flex items-center gap-2 text-xs w-32">
          <div
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              isConnected ? "bg-emerald-500" : "bg-[var(--red)]"
            }`}
          />
          <span className="text-[var(--text-muted)]">
            {isRecording ? "Recording" : "Space to start"}
          </span>
        </div>
      </div>
    </footer>
  );
}
