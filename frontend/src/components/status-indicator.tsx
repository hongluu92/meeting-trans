interface StatusIndicatorProps {
  isRecording: boolean;
  isConnected: boolean;
  isProcessing: boolean;
  error: string | null;
}

export function StatusIndicator({
  isRecording,
  isConnected,
  isProcessing,
  error,
}: StatusIndicatorProps) {
  return (
    <footer className="flex items-center justify-center gap-4 px-6 py-3 border-t border-gray-800 text-xs">
      {error && <span className="text-red-400">{error}</span>}

      <div className="flex items-center gap-1.5">
        <div
          className={`w-2 h-2 rounded-full ${
            isConnected ? "bg-green-500" : "bg-red-500"
          }`}
        />
        <span className="text-gray-500">
          {isConnected ? "Connected" : "Disconnected"}
        </span>
      </div>

      {isRecording && (
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-gray-500">Recording</span>
        </div>
      )}

      {isProcessing && (
        <span className="text-gray-500">Processing...</span>
      )}

      <span className="text-gray-600 ml-auto">Space to toggle mic</span>
    </footer>
  );
}
