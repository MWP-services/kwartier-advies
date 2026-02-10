import type { ScenarioResult } from '@/lib/simulation';

interface ScenarioTableProps {
  scenarios: ScenarioResult[];
  recommendedCapacityKwh: number;
}

export function ScenarioTable({ scenarios, recommendedCapacityKwh }: ScenarioTableProps) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <h3 className="mb-2 font-semibold">Multi-battery scenario comparison</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">Option</th>
              <th className="p-2">Before kWh</th>
              <th className="p-2">After kWh</th>
              <th className="p-2">Dataset compliance</th>
              <th className="p-2">Daily avg compliance</th>
              <th className="p-2">Remaining max kW</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((scenario) => (
              <tr
                key={scenario.capacityKwh}
                className={`border-b ${scenario.capacityKwh === recommendedCapacityKwh ? 'bg-emerald-50' : ''}`}
              >
                <td className="p-2">{scenario.optionLabel}</td>
                <td className="p-2">{scenario.exceedanceEnergyKwhBefore.toFixed(2)}</td>
                <td className="p-2">{scenario.exceedanceEnergyKwhAfter.toFixed(2)}</td>
                <td className="p-2">{(scenario.achievedComplianceDataset * 100).toFixed(1)}%</td>
                <td className="p-2">{(scenario.achievedComplianceDailyAverage * 100).toFixed(1)}%</td>
                <td className="p-2">{scenario.maxRemainingExcessKw.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
