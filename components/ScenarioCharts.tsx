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
  const selected = scenarios.find((scenario) => scenario.capacityKwh === selectedScenarioCapacity) ?? scenarios[0];
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
      <div className="wx-card">
        <h3 className="wx-title">{comparisonTitle}</h3>
        <div className="h-64">
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

      <div className="wx-card">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="wx-title !mb-0">Dimensioneringsopbouw (kWh)</h3>
          <select
            value={selectedScenarioCapacity}
            onChange={(event) => onSelectScenario(Number(event.target.value))}
            className="wx-input !mt-0 !w-auto !py-1 text-sm"
          >
            {displayScenarios.map((scenario) => (
              <option key={scenario.capacityKwh} value={scenario.capacityKwh}>
                {scenario.optionLabel}
              </option>
            ))}
          </select>
        </div>
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
        {selected && (
          <p className="mt-2 text-xs text-slate-600">
            Geselecteerde scenario-optie voor vergelijking: <span className="font-medium">{selected.optionLabel}</span>
          </p>
        )}
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
