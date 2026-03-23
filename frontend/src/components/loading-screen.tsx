interface LoadingScreenProps {
  status: string;
  step: string;
}

export function LoadingScreen({ status, step }: LoadingScreenProps) {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-white flex flex-col items-center justify-center gap-5">
      {/* Minimal spinner */}
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 border-2 border-[var(--border)] rounded-full" />
        <div className="absolute inset-0 border-2 border-transparent border-t-[var(--accent)] rounded-full animate-spin" />
      </div>

      <div className="text-center space-y-2">
        <h2 className="text-base font-medium text-[var(--text-primary)]">Loading models</h2>
        {step && <p className="text-[var(--accent)] text-sm">{step}</p>}
        <p className="text-[var(--text-secondary)] text-sm">{status}</p>
      </div>

      <p className="text-[var(--text-muted)] text-xs mt-4">
        First run downloads ~1.5GB of models
      </p>
    </div>
  );
}
