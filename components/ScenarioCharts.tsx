'use client';

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import type { ScenarioResult } from '@/lib/simulation';

interface ScenarioChartsProps {
  scenarios: ScenarioResult[];
  selectedScenarioCapacity: number;
  onSelectScenario: (capacity: number) => void;
}

export function ScenarioCharts({
  scenarios,
  selectedScenarioCapacity,
  onSelectScenario
}: ScenarioChartsProps) {
  const selected = scenarios.find((scenario) => scenario.capacityKwh === selectedScenarioCapacity) ?? scenarios[0];
  const selectedDay = selected?.shavedSeries[0]?.timestamp.slice(0, 10);
  const dayData = selected?.shavedSeries.filter((item) => item.timestamp.slice(0, 10) === selectedDay) ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border bg-white p-4">
        <h3 className="mb-2 font-semibold">Exceedance energy before/after</h3>
        <div className="h-64">
          <ResponsiveContainer>
            <ComposedChart data={scenarios}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="capacityKwh" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="exceedanceEnergyKwhBefore" fill="#f97316" name="Before" />
              <Bar dataKey="exceedanceEnergyKwhAfter" fill="#3b82f6" name="After" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">Highest peak day overlay</h3>
          <select
            value={selectedScenarioCapacity}
            onChange={(event) => onSelectScenario(Number(event.target.value))}
            className="rounded border p-1 text-sm"
          >
            {scenarios.map((scenario) => (
              <option key={scenario.capacityKwh} value={scenario.capacityKwh}>
                {scenario.capacityKwh} kWh
              </option>
            ))}
          </select>
        </div>
        <div className="h-64">
          <ResponsiveContainer>
            <ComposedChart data={dayData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" hide />
              <YAxis />
              <Tooltip />
              <Line dataKey="originalKw" stroke="#ef4444" dot={false} name="Original" />
              <Line dataKey="shavedKw" stroke="#10b981" dot={false} name="Shaved" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
