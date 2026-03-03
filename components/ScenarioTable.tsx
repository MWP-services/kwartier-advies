import type { ScenarioResult } from '@/lib/simulation';

interface ScenarioTableProps {
  scenarios: ScenarioResult[];
  recommendedCapacityKwh: number | null;
}

export function ScenarioTable({ scenarios, recommendedCapacityKwh }: ScenarioTableProps) {
  return (
    <div className="wx-card">
      <h3 className="wx-title">Vergelijking batterijscenario&apos;s</h3>
      <div className="overflow-x-auto">
        <table className="wx-table min-w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">Optie</th>
              <th className="p-2">Voor kWh</th>
              <th className="p-2">Na kWh</th>
              <th className="p-2">Compliance dataset</th>
              <th className="p-2">Gem. dagcompliance</th>
              <th className="p-2">Resterende max kW</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((scenario) => (
              <tr
                key={scenario.capacityKwh}
                className={`border-b ${recommendedCapacityKwh != null && scenario.capacityKwh === recommendedCapacityKwh ? 'bg-emerald-50' : ''}`}
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
