import type { ScenarioResult } from '@/lib/simulation';

// Presentation only: both the comparison and selection use the same simulation fields.
export function PvScenarioImpact({ scenario }: { scenario: ScenarioResult }) {
  const format = (value: number | undefined, unit: string, decimals = 1) =>
    value != null && Number.isFinite(value) ? `${value.toFixed(decimals)} ${unit}`.trim() : 'Niet beschikbaar';
  const metrics = [
    ['Importreductie', scenario.importReductionKwhAnnualized != null
      ? format(scenario.importReductionKwhAnnualized, 'kWh/jaar')
      : format(scenario.importReductionKwh, 'kWh in dataset')],
    ['Exportreductie', format(scenario.exportReductionKwhAnnualized, 'kWh/jaar')],
    ['Cycli/jaar', format(scenario.cyclesPerYear, '')],
    ['Waarde/jaar', format(scenario.annualValueEur, 'EUR/jaar', 2)],
    ['Terugverdientijd', format(scenario.paybackYears, 'jaar')]
  ];
  return (
    <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
      {metrics.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-slate-500">{label}</dt>
          <dd className="font-medium text-slate-900">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
