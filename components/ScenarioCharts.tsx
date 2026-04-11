'use client';

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
import type { ScenarioResult } from '@/lib/simulation';

interface ScenarioChartsProps {
  scenarios: ScenarioResult[];
  selectedScenarioCapacity: number;
  onSelectScenario: (capacity: number) => void;
  sizing: SizingResult;
  efficiency: number;
  safetyFactor: number;
  compliance: number;
}

export function ScenarioCharts({
  scenarios,
  selectedScenarioCapacity,
  onSelectScenario,
  sizing,
  efficiency,
  safetyFactor,
  compliance
}: ScenarioChartsProps) {
  const selected = scenarios.find((scenario) => scenario.capacityKwh === selectedScenarioCapacity) ?? scenarios[0];
  const gridAfterComplianceKwh = sizing.kWhNeededRaw;
  const gridBeforeComplianceKwh = compliance > 0 ? gridAfterComplianceKwh / compliance : gridAfterComplianceKwh;
  const batteryBeforeSafetyKwh = efficiency > 0 ? gridAfterComplianceKwh / efficiency : 0;
  const finalBatteryKwh = sizing.kWhNeeded;
  const sizingBreakdownData = [
    { step: 'Netbasis', value: Math.max(0, gridBeforeComplianceKwh) },
    { step: 'Na compliance', value: Math.max(0, gridAfterComplianceKwh) },
    { step: 'Na efficiëntie', value: Math.max(0, batteryBeforeSafetyKwh) },
    { step: 'Eindwaarde (buffer)', value: Math.max(0, finalBatteryKwh) }
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="wx-card">
        <h3 className="wx-title">Overschrijdingsenergie voor/na (datasetsimulatie)</h3>
        <div className="h-64">
          <ResponsiveContainer>
            <ComposedChart data={scenarios}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="optionLabel" interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="exceedanceEnergyKwhBefore" fill="#f97316" name="Voor" />
              <Bar dataKey="exceedanceEnergyKwhAfter" fill="#3b82f6" name="Na" />
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
            {scenarios.map((scenario) => (
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
          <div>Compliance-doel: {(compliance * 100).toFixed(0)}%</div>
          <div>Efficiëntie: {(efficiency * 100).toFixed(0)}%</div>
          <div>Veiligheidsfactor: {safetyFactor.toFixed(2)}x</div>
          <div>Buffer + verliezen zijn verwerkt in de uiteindelijke benodigde kWh</div>
        </div>
      </div>
    </div>
  );
}
