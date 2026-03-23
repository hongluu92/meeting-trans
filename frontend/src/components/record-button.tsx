interface RecordButtonProps {
  isRecording: boolean;
  onToggle: () => void;
  isConnected: boolean;
  isProcessing: boolean;
  error: string | null;
}

export function RecordButton({
  isRecording,
  onToggle,
  isConnected,
  isProcessing,
  error,
}: RecordButtonProps) {
  return (
    <footer className="shrink-0 flex items-center justify-center gap-5 px-4 py-4 border-t border-[var(--border)]">
      {/* Left status */}
      <div className="flex items-center gap-2 text-xs w-32 justify-end">
        {error && <span className="text-[var(--red)] truncate">{error}</span>}
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
    </footer>
  );
}
