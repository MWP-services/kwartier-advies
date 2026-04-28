import type { AnalysisType } from '@/lib/analysis';
import type { ScenarioResult } from '@/lib/simulation';

interface ScenarioTableProps {
  analysisType: AnalysisType;
  scenarios: ScenarioResult[];
  recommendedCapacityKwh: number | null;
}

export function ScenarioTable({ analysisType, scenarios, recommendedCapacityKwh }: ScenarioTableProps) {
  return (
    <div className="wx-card">
      <h3 className="wx-title">
        {analysisType === 'PV_SELF_CONSUMPTION' ? 'Simulatie per batterijoptie' : 'Vergelijking batterijscenario&apos;s'}
      </h3>
      <div className="overflow-x-auto">
        <table className="wx-table min-w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">Optie</th>
              {analysisType === 'PV_SELF_CONSUMPTION' ? (
                <>
                  <th className="p-2">Capaciteit</th>
                  <th className="p-2">Vermogen</th>
                  <th className="p-2">Importreductie</th>
                  <th className="p-2">Exportreductie</th>
                  <th className="p-2">Cycli/jaar</th>
                  <th className="p-2">Marginale gain</th>
                  <th className="p-2">Waarde/jaar</th>
                  <th className="p-2">TVT</th>
                  <th className="p-2">Status</th>
                </>
              ) : (
                <>
                  <th className="p-2">Voor kWh</th>
                  <th className="p-2">Na kWh</th>
                  <th className="p-2">Compliance dataset</th>
                  <th className="p-2">Gem. dagcompliance</th>
                  <th className="p-2">Resterende max kW</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {scenarios.map((scenario) => (
              <tr
                key={scenario.capacityKwh}
                className={`border-b ${recommendedCapacityKwh != null && scenario.capacityKwh === recommendedCapacityKwh ? 'bg-emerald-50' : ''}`}
              >
                <td className="p-2">{scenario.optionLabel}</td>
                {analysisType === 'PV_SELF_CONSUMPTION' ? (
                  <>
                    <td className="p-2">{scenario.capacityKwh.toFixed(0)} kWh</td>
                    <td className="p-2">{(scenario.maxDischargeKw ?? 0).toFixed(1)} kW</td>
                    <td className="p-2">{(scenario.importReductionKwhAnnualized ?? scenario.importReductionKwh ?? 0).toFixed(1)} kWh/jaar</td>
                    <td className="p-2">{(scenario.exportReductionKwhAnnualized ?? 0).toFixed(1)} kWh/jaar</td>
                    <td className="p-2">{(scenario.cyclesPerYear ?? 0).toFixed(1)}</td>
                    <td className="p-2">{(scenario.marginalGainPerAddedKwh ?? 0).toFixed(1)}</td>
                    <td className="p-2">{scenario.annualValueEur != null ? `EUR ${scenario.annualValueEur.toFixed(2)}` : '-'}</td>
                    <td className="p-2">{scenario.paybackYears != null ? `${scenario.paybackYears.toFixed(1)} jr` : '-'}</td>
                    <td className="p-2">
                      {scenario.isEligible === false ? scenario.excludedReason ?? 'Uitgesloten' : scenario.recommendationReason ?? 'Geschikt'}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="p-2">{scenario.exceedanceEnergyKwhBefore.toFixed(2)}</td>
                    <td className="p-2">{scenario.exceedanceEnergyKwhAfter.toFixed(2)}</td>
                    <td className="p-2">{(scenario.achievedComplianceDataset * 100).toFixed(1)}%</td>
                    <td className="p-2">{(scenario.achievedComplianceDailyAverage * 100).toFixed(1)}%</td>
                    <td className="p-2">{scenario.maxRemainingExcessKw.toFixed(2)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
