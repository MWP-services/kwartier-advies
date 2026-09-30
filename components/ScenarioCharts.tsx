'use client';

import type { AnalysisType } from '@/lib/analysis';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import type { SizingResult } from '@/lib/calculations';
import { orderScenariosForRecommendationDisplay, type ScenarioResult } from '@/lib/simulation';
import { PvScenarioImpact } from './PvScenarioImpact';

interface ScenarioChartsProps {
  analysisType: AnalysisType;
  scenarios: ScenarioResult[];
  selectedScenarioCapacity: number;
  onSelectScenario: (capacity: number) => void;
  sizing: SizingResult;
  efficiency: number;
  safetyFactor: number;
  compliance: number;
}

export function ScenarioCharts({
  analysisType,
  scenarios,
  selectedScenarioCapacity,
  onSelectScenario,
  sizing,
  efficiency,
  safetyFactor,
  compliance
}: ScenarioChartsProps) {
  const selected = scenarios.find((scenario) => scenario.capacityKwh === selectedScenarioCapacity)
    ?? scenarios.find((scenario) => scenario.capacityKwh === sizing.recommendedProduct?.capacityKwh)
    ?? scenarios[0];
  const displayScenarios =
    analysisType === 'PV_SELF_CONSUMPTION'
      ? scenarios
      : orderScenariosForRecommendationDisplay(scenarios, sizing.recommendedProduct?.capacityKwh, 9);
  const pvMode = scenarios[0]?.pvAnalysisMode ?? null;
  const pvStrategy = scenarios[0]?.pvStrategy ?? 'SELF_CONSUMPTION_ONLY';
  const gridAfterComplianceKwh = sizing.kWhNeededRaw;
  const gridBeforeComplianceKwh = compliance > 0 ? gridAfterComplianceKwh / compliance : gridAfterComplianceKwh;
  const batteryBeforeSafetyKwh = efficiency > 0 ? gridAfterComplianceKwh / efficiency : 0;
  const finalBatteryKwh = sizing.kWhNeeded;
  const sizingBreakdownData = [
    { step: 'Netbasis', value: Math.max(0, gridBeforeComplianceKwh) },
    { step: 'Na compliance', value: Math.max(0, gridAfterComplianceKwh) },
    { step: 'Na efficientie', value: Math.max(0, batteryBeforeSafetyKwh) },
    { step: 'Eindwaarde (buffer)', value: Math.max(0, finalBatteryKwh) }
  ];
  const comparisonTitle =
    analysisType === 'PV_SELF_CONSUMPTION'
      ? pvStrategy === 'PV_WITH_TRADING'
        ? 'Directe vs verschoven PV-export'
        : pvMode === 'FULL_PV'
        ? 'PV-export voor/na batterij'
        : 'Teruglevering voor/na batterij'
      : 'Overschrijdingsenergie voor/na (datasetsimulatie)';
  const beforeKey =
    analysisType === 'PV_SELF_CONSUMPTION'
      ? pvStrategy === 'PV_WITH_TRADING'
        ? 'immediateExportedKwh'
        : 'exportedEnergyBeforeKwh'
      : 'exceedanceEnergyKwhBefore';
  const afterKey =
    analysisType === 'PV_SELF_CONSUMPTION'
      ? pvStrategy === 'PV_WITH_TRADING'
        ? 'shiftedExportedLaterKwh'
        : 'exportedEnergyAfterKwh'
      : 'exceedanceEnergyKwhAfter';

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="wx-card min-w-0 lg:col-span-2" aria-label="Impact geselecteerde batterij">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="wx-title !mb-0">Impact geselecteerde batterij</h3>
          <label className="min-w-0 text-sm sm:max-w-xs">
            Batterijcapaciteit
            <select value={selected?.capacityKwh ?? ''} disabled={!selected}
              onChange={(event) => onSelectScenario(Number(event.target.value))} className="wx-input">
              {[...scenarios].sort((a, b) => a.capacityKwh - b.capacityKwh).map((scenario) => (
                <option key={scenario.capacityKwh} value={scenario.capacityKwh}>
                  {scenario.optionLabel}{scenario.capacityKwh === sizing.recommendedProduct?.capacityKwh ? ' — Aanbevolen' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        {selected ? (
          <div aria-live="polite">
            <p className="mt-3 font-medium text-slate-900">{selected.capacityKwh} kWh — {selected.optionLabel}</p>
            {analysisType === 'PV_SELF_CONSUMPTION' ? <PvScenarioImpact scenario={selected} /> : (
              <p className="mt-2 text-sm text-slate-600">
                Overschrijdingsenergie: {selected.exceedanceEnergyKwhBefore.toFixed(2)} kWh vóór en{' '}
                {selected.exceedanceEnergyKwhAfter.toFixed(2)} kWh na batterij.
              </p>
            )}
            {selected.isEligible === false && <p className="mt-2 text-sm text-amber-700">{selected.excludedReason ?? 'Uitgesloten'}</p>}
            {selected.paybackIndicative && <p className="mt-2 text-xs text-amber-700">Terugverdientijd is indicatief.</p>}
          </div>
        ) : <p className="mt-3 text-sm text-slate-600">Geen batterijscenario&apos;s beschikbaar.</p>}
      </section>
      <div className="wx-card min-w-0">
        <h3 className="wx-title">{comparisonTitle}</h3>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Grafiek vergelijking batterijopties">
        <div className="h-64" style={{ minWidth: Math.max(360, displayScenarios.length * 85) }}>
          <ResponsiveContainer>
            <ComposedChart data={displayScenarios}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="optionLabel" interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis yAxisId="before" />
              {analysisType !== 'PV_SELF_CONSUMPTION' && <YAxis yAxisId="after" orientation="right" />}
              <Tooltip />
              <Bar
                yAxisId="before"
                dataKey={beforeKey}
                fill="#f97316"
                name={pvStrategy === 'PV_WITH_TRADING' ? 'Direct export' : 'Voor'}
              />
              <Bar
                yAxisId={analysisType === 'PV_SELF_CONSUMPTION' ? 'before' : 'after'}
                dataKey={afterKey}
                fill="#3b82f6"
                name={pvStrategy === 'PV_WITH_TRADING' ? 'Later uit batterij' : 'Na'}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        </div>
      </div>

      <div className="wx-card min-w-0">
        <h3 className="wx-title">Dimensioneringsopbouw algemeen advies (kWh)</h3>
        <p className="mb-2 text-xs text-slate-600">
          Deze opbouw hoort bij het algemene batterijadvies en blijft gelijk bij selectie van een andere capaciteit.
        </p>
        <div className="h-56">
          <ResponsiveContainer>
            <ComposedChart data={sizingBreakdownData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="step" />
              <YAxis />
              <Tooltip formatter={(value) => `${Number(value).toFixed(2)} kWh`} />
              <Bar dataKey="value" fill="#0ea5e9" name="kWh" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 grid gap-1 text-xs text-slate-600 md:grid-cols-2">
          <div>
            {analysisType === 'PV_SELF_CONSUMPTION'
              ? pvStrategy === 'PV_WITH_TRADING'
                ? 'Referentiedoel'
                : 'Self-consumption-doel'
              : 'Compliance-doel'}
            : {(compliance * 100).toFixed(0)}%
          </div>
          <div>Efficientie: {(efficiency * 100).toFixed(0)}%</div>
          <div>Veiligheidsfactor: {safetyFactor.toFixed(2)}x</div>
          <div>
            {analysisType === 'PV_SELF_CONSUMPTION'
              ? pvStrategy === 'PV_WITH_TRADING'
                ? 'Trading-modus mag opgeslagen PV later terugleveren binnen dezelfde batterij-kW- en SOC-limieten.'
                : pvMode === 'FULL_PV'
                ? 'Sizing is gebaseerd op dezelfde 15-minuten PV-surplus simulatie als de scenariovergelijking.'
                : 'Sizing is gebaseerd op dezelfde 15-minuten terugleversimulatie als de scenariovergelijking.'
              : 'Buffer + verliezen zijn verwerkt in de uiteindelijke benodigde kWh'}
          </div>
        </div>
      </div>
    </div>
  );
}
