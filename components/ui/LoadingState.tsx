interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label = 'Laden...' }: LoadingStateProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
      <span className="h-2.5 w-2.5 rounded-full bg-emerald-600 motion-safe:animate-pulse" />
      <span>{label}</span>
    </div>
  );
}

