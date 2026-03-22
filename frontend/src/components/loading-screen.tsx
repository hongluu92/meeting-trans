interface LoadingScreenProps {
  status: string;
  step: string;
}

export function LoadingScreen({ status, step }: LoadingScreenProps) {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
      <h2 className="text-xl font-medium">Loading models</h2>
      {step && <p className="text-blue-400 text-sm">{step}</p>}
      <p className="text-gray-400 text-sm">{status}</p>
      <p className="text-gray-600 text-xs">First run downloads ~1.5GB of models</p>
    </div>
  );
}
