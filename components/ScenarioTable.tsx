'use client';

import { useState } from 'react';
import type { AnalysisType } from '@/lib/analysis';
import { orderScenariosForRecommendationDisplay, type ScenarioResult } from '@/lib/simulation';
import { PvScenarioImpact } from './PvScenarioImpact';

interface ScenarioTableProps {
  analysisType: AnalysisType;
  scenarios: ScenarioResult[];
  recommendedCapacityKwh: number | null;
  selectedScenarioCapacity?: number;
  onSelectScenario?: (capacity: number) => void;
}

export function ScenarioTable({ analysisType, scenarios, recommendedCapacityKwh, selectedScenarioCapacity, onSelectScenario }: ScenarioTableProps) {
  const [showAll, setShowAll] = useState(false);
  if (analysisType === 'PV_SELF_CONSUMPTION') {
    const nearby = orderScenariosForRecommendationDisplay(scenarios, recommendedCapacityKwh, 5);
    const options = [...(showAll ? scenarios : nearby)].sort((a, b) => a.capacityKwh - b.capacityKwh);
    const selectedCapacity = (scenarios.find((scenario) => scenario.capacityKwh === selectedScenarioCapacity)
      ?? scenarios.find((scenario) => scenario.capacityKwh === recommendedCapacityKwh)
      ?? scenarios[0])?.capacityKwh;
    return (
      <section className="wx-card" aria-label="Vergelijking batterijopties">
        <h3 className="wx-title">Vergelijking batterijopties</h3>
        <p className="mb-4 text-sm text-slate-600">
          Vergelijk de aanbevolen capaciteit met kleinere en grotere opties uit dezelfde kwartiersimulatie.
          Jaarcijfers zijn omgerekend vanuit de dataset; financiële cijfers staan erbij wanneer beschikbaar.
        </p>
        {!options.length && <p className="text-sm text-slate-600">Geen batterijscenario&apos;s beschikbaar.</p>}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {options.map((scenario) => {
            const recommended = scenario.capacityKwh === recommendedCapacityKwh;
            return (
              <article key={scenario.capacityKwh} aria-label={`${scenario.capacityKwh} kWh batterij`}
                className={`min-w-0 rounded-lg border p-4 ${recommended ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                <h4 className="font-semibold text-slate-900">{scenario.capacityKwh} kWh</h4>
                <p className="text-xs font-medium text-emerald-700">
                  {recommended ? 'Aanbevolen' : recommendedCapacityKwh == null ? 'Batterijoptie' : scenario.capacityKwh < recommendedCapacityKwh ? 'Kleinere optie' : 'Grotere optie'}
                </p>
                <p className="mt-1 text-xs text-slate-600">Vermogen: {scenario.maxDischargeKw.toFixed(1)} kW</p>
                <PvScenarioImpact scenario={scenario} />
                <p className="mt-3 text-xs text-slate-600">
                  {scenario.isEligible === false ? scenario.excludedReason ?? 'Uitgesloten' : scenario.recommendationReason ?? 'Geschikt'}
                </p>
                {scenario.paybackIndicative && <p className="mt-1 text-xs text-amber-700">Terugverdientijd is indicatief.</p>}
                {onSelectScenario && (
                  <button type="button" className="wx-btn-secondary mt-3 w-full" aria-pressed={selectedCapacity === scenario.capacityKwh}
                    aria-label={`Selecteer ${scenario.capacityKwh} kWh`} onClick={() => onSelectScenario(scenario.capacityKwh)}>
                    {selectedCapacity === scenario.capacityKwh ? 'Geselecteerd' : 'Bekijk impact'}
                  </button>
                )}
              </article>
            );
          })}
        </div>
        {scenarios.length > nearby.length && (
          <button type="button" className="wx-btn-secondary mt-4" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Toon opties rond het advies' : `Toon alle ${scenarios.length} batterijopties`}
          </button>
        )}
      </section>
    );
  }
  const displayScenarios =
    orderScenariosForRecommendationDisplay(scenarios, recommendedCapacityKwh, 9);

  return (
    <div className="wx-card">
      <h3 className="wx-title">
        Vergelijking batterijscenario&apos;s
      </h3>
      <div className="overflow-x-auto">
        <table className="wx-table min-w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">Optie</th>
              <th className="p-2">Voor kWh</th>
              <th className="p-2">Na kWh</th>
              <th className="p-2">Reductie kWh</th>
              <th className="p-2">Rest</th>
              <th className="p-2">Compliance dataset</th>
              <th className="p-2">Gem. dagcompliance</th>
              <th className="p-2">Resterende max kW</th>
            </tr>
          </thead>
          <tbody>
            {displayScenarios.map((scenario) => (
              <tr
                key={scenario.capacityKwh}
                className={`border-b ${recommendedCapacityKwh != null && scenario.capacityKwh === recommendedCapacityKwh ? 'bg-emerald-50' : ''}`}
              >
                <td className="p-2">{scenario.optionLabel}</td>
                {(
                  (() => {
                    const reductionKwh = Math.max(
                      0,
                      scenario.exceedanceEnergyKwhBefore - scenario.exceedanceEnergyKwhAfter
                    );
                    const remainingPct =
                      scenario.exceedanceEnergyKwhBefore > 0
                        ? (scenario.exceedanceEnergyKwhAfter / scenario.exceedanceEnergyKwhBefore) * 100
                        : 0;
                    return (
                      <>
                        <td className="p-2">{scenario.exceedanceEnergyKwhBefore.toFixed(2)}</td>
                        <td className="p-2">{scenario.exceedanceEnergyKwhAfter.toFixed(2)}</td>
                        <td className="p-2">{reductionKwh.toFixed(2)}</td>
                        <td className="p-2">{remainingPct.toFixed(2)}%</td>
                        <td className="p-2">{(scenario.achievedComplianceDataset * 100).toFixed(1)}%</td>
                        <td className="p-2">{(scenario.achievedComplianceDailyAverage * 100).toFixed(1)}%</td>
                        <td className="p-2">{scenario.maxRemainingExcessKw.toFixed(2)}</td>
                      </>
                    );
                  })()
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
