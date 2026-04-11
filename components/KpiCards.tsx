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
      label: 'Maximaal gemeten kW',
      value: maxObservedKw.toFixed(2),
      subtext: maxObservedTimestamp ? formatTimestamp(maxObservedTimestamp) : '-'
    },
    { label: 'Overschrijdingsintervallen', value: String(exceedanceIntervals) },
    { label: 'Benodigd kWh', value: sizing.kWhNeeded.toFixed(2) },
    { label: 'Benodigd kW', value: sizing.kWNeeded.toFixed(2) },
    {
      label: 'Aanbevolen',
      value: sizing.recommendedProduct ? `${sizing.recommendedProduct.capacityKwh} kWh` : 'Geen haalbare optie'
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
