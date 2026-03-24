interface LoadingScreenProps {
  status: string;
  step: string;
}

export function LoadingScreen({ status, step }: LoadingScreenProps) {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-white flex flex-col items-center justify-center gap-6">
      {/* Logo */}
      <img src="/logo.svg" alt="Meeting Trans" className="w-16 h-16" />

      {/* Spinner below logo */}
      <div className="relative w-8 h-8">
        <div className="absolute inset-0 border-2 border-[var(--border)] rounded-full" />
        <div className="absolute inset-0 border-2 border-transparent border-t-[var(--accent)] rounded-full animate-spin" />
      </div>

      <div className="text-center space-y-1.5">
        <h2 className="text-sm font-medium text-[var(--text-primary)]">Loading models</h2>
        {step && <p className="text-[var(--accent)] text-xs">{step}</p>}
        <p className="text-[var(--text-secondary)] text-xs">{status}</p>
      </div>

      <p className="text-[var(--text-muted)] text-[10px] mt-2">
        First run downloads ~1.5GB of models
      </p>
    </div>
  );
}
