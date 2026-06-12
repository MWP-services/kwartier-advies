import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center">
      {icon ? <div className="mb-3 flex justify-center text-slate-400">{icon}</div> : null}
      <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      {description ? <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

