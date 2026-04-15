import type { AnalysisType } from '@/lib/analysis';
import type { ScenarioResult } from '@/lib/simulation';

interface ScenarioTableProps {
  analysisType: AnalysisType;
  scenarios: ScenarioResult[];
  recommendedCapacityKwh: number | null;
}

export function ScenarioTable({ analysisType, scenarios, recommendedCapacityKwh }: ScenarioTableProps) {
  const pvMode = scenarios[0]?.pvAnalysisMode ?? null;
  const pvStrategy = scenarios[0]?.pvStrategy ?? 'SELF_CONSUMPTION_ONLY';

  return (
    <div className="wx-card">
      <h3 className="wx-title">Vergelijking batterijscenario&apos;s</h3>
      <div className="overflow-x-auto">
        <table className="wx-table min-w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">Optie</th>
              {analysisType === 'PV_SELF_CONSUMPTION' ? (
                pvStrategy === 'PV_WITH_TRADING' ? (
                  <>
                    <th className="p-2">Opgeslagen PV</th>
                    <th className="p-2">Later geëxporteerd</th>
                    <th className="p-2">Importreductie</th>
                    <th className="p-2">Nuttige ontlading</th>
                    <th className="p-2">Economische waarde</th>
                  </>
                ) : pvMode === 'FULL_PV' ? (
                  <>
                    <th className="p-2">Zelfconsumptie</th>
                    <th className="p-2">Zelfvoorziening</th>
                    <th className="p-2">Import na</th>
                    <th className="p-2">Export na</th>
                    <th className="p-2">Exportreductie</th>
                  </>
                ) : (
                  <>
                    <th className="p-2">Export voor</th>
                    <th className="p-2">Export na</th>
                    <th className="p-2">Opgeslagen export</th>
                    <th className="p-2">Benutting surplus</th>
                    <th className="p-2">Import na</th>
                  </>
                )
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
                  scenario.pvStrategy === 'PV_WITH_TRADING' ? (
                    <>
                      <td className="p-2">{(scenario.capturedExportEnergyKwh ?? 0).toFixed(2)}</td>
                      <td className="p-2">{(scenario.shiftedExportedLaterKwh ?? 0).toFixed(2)}</td>
                      <td className="p-2">{(scenario.importReductionKwh ?? 0).toFixed(2)}</td>
                      <td className="p-2">{(scenario.totalUsefulDischargedEnergyKwh ?? 0).toFixed(2)}</td>
                      <td className="p-2">
                        {scenario.totalEconomicValueEur != null ? `EUR ${scenario.totalEconomicValueEur.toFixed(2)}` : '-'}
                      </td>
                    </>
                  ) : scenario.pvAnalysisMode === 'FULL_PV' ? (
                    <>
                      <td className="p-2">{((scenario.achievedSelfConsumption ?? 0) * 100).toFixed(1)}%</td>
                      <td className="p-2">{((scenario.selfSufficiency ?? 0) * 100).toFixed(1)}%</td>
                      <td className="p-2">{(scenario.importedEnergyAfterKwh ?? 0).toFixed(2)}</td>
                      <td className="p-2">{(scenario.exportedEnergyAfterKwh ?? 0).toFixed(2)}</td>
                      <td className="p-2">{((scenario.exportReduction ?? 0) * 100).toFixed(1)}%</td>
                    </>
                  ) : (
                    <>
                      <td className="p-2">{(scenario.exportedEnergyBeforeKwh ?? 0).toFixed(2)}</td>
                      <td className="p-2">{(scenario.exportedEnergyAfterKwh ?? 0).toFixed(2)}</td>
                      <td className="p-2">{(scenario.capturedExportEnergyKwh ?? 0).toFixed(2)}</td>
                      <td className="p-2">{((scenario.batteryUtilizationAgainstExport ?? 0) * 100).toFixed(1)}%</td>
                      <td className="p-2">{(scenario.importedEnergyAfterKwh ?? 0).toFixed(2)}</td>
                    </>
                  )
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
