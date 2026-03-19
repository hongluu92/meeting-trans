interface LoadingScreenProps {
  status: string;
}

export function LoadingScreen({ status }: LoadingScreenProps) {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
      <h2 className="text-xl font-medium">Loading SeamlessM4T v2</h2>
      <p className="text-gray-400 text-sm">{status}</p>
      <p className="text-gray-600 text-xs">~3GB download on first run</p>
    </div>
  );
}
