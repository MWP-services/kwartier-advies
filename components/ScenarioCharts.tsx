'use client';

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { buildDayKwSeries } from '@/lib/calculations';
import { getLocalDayIso } from '@/lib/datetime';
import type { ScenarioResult } from '@/lib/simulation';

interface ScenarioChartsProps {
  scenarios: ScenarioResult[];
  selectedScenarioCapacity: number;
  onSelectScenario: (capacity: number) => void;
  highestPeakDay: string | null;
  contractKw: number;
}

export function ScenarioCharts({
  scenarios,
  selectedScenarioCapacity,
  onSelectScenario,
  highestPeakDay,
  contractKw
}: ScenarioChartsProps) {
  const timeZone = 'Europe/Amsterdam';
  const selected = scenarios.find((scenario) => scenario.capacityKwh === selectedScenarioCapacity) ?? scenarios[0];
  const selectedDay =
    highestPeakDay ?? (selected?.shavedSeries.length ? getLocalDayIso(selected.shavedSeries[0].timestamp, timeZone) : null);

  const beforeSeries =
    selectedDay && selected
      ? buildDayKwSeries(
          selected.shavedSeries.map((point) => ({
            timestamp: point.timestamp,
            consumptionKw: point.originalKw
          })),
          selectedDay,
          15,
          timeZone
        )
      : [];
  const afterSeries =
    selectedDay && selected
      ? buildDayKwSeries(
          selected.shavedSeries.map((point) => ({
            timestamp: point.timestamp,
            consumptionKw: point.shavedKw
          })),
          selectedDay,
          15,
          timeZone
        )
      : [];
  const dayData = beforeSeries.map((point, index) => ({
    timeLabel: point.timeLabel,
    beforeKw: point.consumptionKw,
    afterKw: afterSeries[index]?.consumptionKw ?? 0,
    contractKw
  }));
  const maxOverlayKw = Math.max(
    0,
    ...dayData.map((point) => Math.max(point.beforeKw ?? 0, point.afterKw ?? 0, point.contractKw ?? 0))
  );
  const overlayYMax = (maxOverlayKw > 0 ? maxOverlayKw : 60) * 1.1;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border bg-white p-4">
        <h3 className="mb-2 font-semibold">Exceedance energy before/after</h3>
        <div className="h-64">
          <ResponsiveContainer>
            <ComposedChart data={scenarios}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="optionLabel" interval={0} angle={-20} textAnchor="end" height={60} />
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
                {scenario.optionLabel}
              </option>
            ))}
          </select>
        </div>
        <div className="h-64">
          <ResponsiveContainer>
            <ComposedChart data={dayData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timeLabel" minTickGap={24} />
              <YAxis domain={[0, overlayYMax]} />
              <Tooltip labelFormatter={(value) => (typeof value === 'string' ? value : String(value))} />
              <Line dataKey="beforeKw" stroke="#ef4444" dot={false} name="Original" />
              <Line dataKey="afterKw" stroke="#10b981" dot={false} name="Shaved" />
              <ReferenceLine y={contractKw} stroke="#0369a1" strokeDasharray="4 4" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
