interface PremiumBadgeProps {
  children: string;
  tone?: 'neutral' | 'success' | 'warning';
}

const toneClass = {
  neutral: 'border-slate-200 bg-white text-slate-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800'
};

export function PremiumBadge({ children, tone = 'neutral' }: PremiumBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${toneClass[tone]}`}>
      {children}
    </span>
  );
}

