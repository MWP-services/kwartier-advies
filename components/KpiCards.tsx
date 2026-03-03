import type { SizingResult } from '@/lib/calculations';
import { formatTimestamp } from '@/lib/datetime';

interface KpiCardsProps {
  maxObservedKw: number;
  maxObservedTimestamp: string | null;
  exceedanceIntervals: number;
  sizing: SizingResult;
}

export function KpiCards({ maxObservedKw, maxObservedTimestamp, exceedanceIntervals, sizing }: KpiCardsProps) {
  const cards = [
    {
      label: 'Max observed kW',
      value: maxObservedKw.toFixed(2),
      subtext: maxObservedTimestamp ? formatTimestamp(maxObservedTimestamp) : '-'
    },
    { label: 'Exceedance intervals', value: String(exceedanceIntervals) },
    { label: 'kWh needed', value: sizing.kWhNeeded.toFixed(2) },
    { label: 'kW needed', value: sizing.kWNeeded.toFixed(2) },
    {
      label: 'Recommended',
      value: sizing.recommendedProduct ? `${sizing.recommendedProduct.capacityKwh} kWh` : 'No feasible option'
    }
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {cards.map((card) => (
        <div key={card.label} className="wx-card p-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">{card.label}</div>
          <div className="text-lg font-semibold text-slate-900">{card.value}</div>
          {'subtext' in card && card.subtext ? <div className="text-xs text-slate-500">{card.subtext}</div> : null}
        </div>
      ))}
    </div>
  );
}
