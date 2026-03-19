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
    <footer className="shrink-0 bg-gray-950 flex items-center justify-center gap-4 px-4 py-3 border-t border-gray-800">
      <div className="flex items-center gap-2 text-xs text-gray-600 w-28 justify-end">
        {error && <span className="text-red-400 truncate">{error}</span>}
        {!error && isProcessing && <span className="text-gray-500">Processing...</span>}
      </div>

      <button
        onClick={onToggle}
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

      <div className="flex items-center gap-2 text-xs w-28">
        <div
          className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}
        />
        <span className="text-gray-600">
          {isRecording ? "Recording" : "Space to start"}
        </span>
      </div>
    </footer>
  );
}
