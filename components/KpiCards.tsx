import type { SizingResult } from '@/lib/calculations';
import { formatTimestamp } from '@/lib/datetime';

interface KpiCardsProps {
  maxObservedKw: number;
  maxObservedAt: string | null;
  exceedanceIntervals: number;
  sizing: SizingResult;
}

export function KpiCards({ maxObservedKw, maxObservedAt, exceedanceIntervals, sizing }: KpiCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <div className="rounded-lg border bg-white p-3 shadow-sm">
        <div className="text-xs text-slate-500">Max observed kW</div>
        <div className="text-lg font-semibold">{maxObservedKw.toFixed(2)}</div>
        <div className="text-xs text-slate-500">op: {maxObservedAt ? formatTimestamp(maxObservedAt) : '-'}</div>
      </div>

      <div className="rounded-lg border bg-white p-3 shadow-sm">
        <div className="text-xs text-slate-500">Exceedance intervals</div>
        <div className="text-lg font-semibold">{exceedanceIntervals}</div>
      </div>

      <div className="rounded-lg border bg-white p-3 shadow-sm">
        <div className="text-xs text-slate-500">kWh needed</div>
        <div className="text-lg font-semibold">{sizing.kWhNeeded.toFixed(2)}</div>
      </div>

      <div className="rounded-lg border bg-white p-3 shadow-sm">
        <div className="text-xs text-slate-500">kW needed</div>
        <div className="text-lg font-semibold">{sizing.kWNeeded.toFixed(2)}</div>
      </div>

      <div className="rounded-lg border bg-white p-3 shadow-sm">
        <div className="text-xs text-slate-500">Recommended</div>
        <div className="text-lg font-semibold">{sizing.recommendedProduct.capacityKwh} kWh</div>
      </div>
    </div>
  );
}
