'use client';

import {
  CartesianGrid,
  Cell,
  ComposedChart,
  Bar,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { buildDayProfile, type ExceededInterval, type PeakEvent, type ProcessedInterval } from '@/lib/calculations';
import { formatTimestamp, getLocalDayIso, getLocalHourMinute } from '@/lib/datetime';

interface ChartsProps {
  intervals: ProcessedInterval[];
  contractKw: number;
  topEvents: PeakEvent[];
  highestPeakDay: string | null;
  topExceededIntervals: ExceededInterval[];
}

export function Charts({ intervals, contractKw, topEvents, highestPeakDay, topExceededIntervals }: ChartsProps) {
  const timeZone = 'Europe/Amsterdam';
  const selectedDay = highestPeakDay ?? (intervals.length ? getLocalDayIso(intervals[0].timestamp, timeZone) : null);
  const markerSet = new Set(
    topExceededIntervals
      .filter((interval) => getLocalDayIso(interval.timestamp, timeZone) === selectedDay)
      .map((interval) => {
        const { hour, minute } = getLocalHourMinute(interval.timestamp, timeZone);
        return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      })
  );
  const daySeries = selectedDay
    ? buildDayProfile(intervals, selectedDay, 15, timeZone).map((point) => ({
        timestampLabel: point.timestampLabel,
        timestampIso: point.timestampIso,
        consumptionKw: point.observedKw,
        contractKw,
        isTopExceeded: markerSet.has(point.timestampLabel)
      }))
    : [];
  const maxDayKw = Math.max(0, ...daySeries.map((point) => point.consumptionKw ?? 0));
  const yMaxBase = Math.max(contractKw, maxDayKw);
  const yMax = (yMaxBase > 0 ? yMaxBase : 60) * 1.1;

  const bins = 20;
  const maxKw = Math.max(1, ...intervals.map((item) => item.consumptionKw));
  const binSize = maxKw / bins;
  const hist = Array.from({ length: bins }, (_, i) => {
    const min = i * binSize;
    const max = min + binSize;
    const count = intervals.filter(
      (item) =>
        item.consumptionKw >= min &&
        (i === bins - 1 ? item.consumptionKw <= max : item.consumptionKw < max)
    ).length;
    const label = `${min.toFixed(0)}-${max.toFixed(0)}`;
    const ratio = max / contractKw;
    const bucketType = ratio > 1 ? 'over100' : ratio > 0.9 ? 'over90' : 'normal';
    return { label, count, bucketType };
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border bg-white p-4">
        <h3 className="mb-2 font-semibold">Highest Peak Day Profile</h3>
        <div className="h-64">
          <ResponsiveContainer>
            <ComposedChart data={daySeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="timestampLabel"
                minTickGap={24}
              />
              <YAxis domain={[0, yMax]} />
              <Tooltip labelFormatter={(value) => (typeof value === 'string' ? value : String(value))} />
              <Bar dataKey="consumptionKw" fill="#3b82f6" />
              <Line type="monotone" dataKey="contractKw" stroke="#ef4444" dot={false} />
              {daySeries
                .filter((interval) => interval.isTopExceeded)
                .map((interval) => (
                  <ReferenceDot
                    key={interval.timestampIso}
                    x={interval.timestampLabel}
                    y={interval.consumptionKw}
                    r={4}
                    fill="#ef4444"
                    stroke="#7f1d1d"
                  />
                ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 max-h-40 overflow-y-auto rounded border">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 bg-slate-50">
              <tr className="border-b text-left">
                <th className="p-2">Timestamp</th>
                <th className="p-2">Consumption kW</th>
                <th className="p-2">Excess kW</th>
              </tr>
            </thead>
            <tbody>
              {topExceededIntervals.map((interval) => (
                <tr key={interval.timestamp} className="border-b">
                  <td className="p-2">{formatTimestamp(interval.timestamp)}</td>
                  <td className="p-2">{interval.consumption_kW.toFixed(2)}</td>
                  <td className="p-2">{interval.excess_kW.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <h3 className="mb-2 font-semibold">Consumption Histogram</h3>
        <div className="h-64">
          <ResponsiveContainer>
            <ComposedChart data={hist}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" hide />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count">
                {hist.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      entry.bucketType === 'over100'
                        ? '#dc2626'
                        : entry.bucketType === 'over90'
                          ? '#f59e0b'
                          : '#10b981'
                    }
                  />
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4 lg:col-span-2">
        <h3 className="mb-2 font-semibold">Top 10 Peak Events</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="p-2">Peak timestamp</th>
                <th className="p-2">Duration</th>
                <th className="p-2">Max excess kW</th>
                <th className="p-2">Total excess kWh</th>
              </tr>
            </thead>
            <tbody>
              {topEvents.slice(0, 10).map((event) => (
                <tr key={`${event.peakTimestamp}-${event.durationIntervals}`} className="border-b">
                  <td className="p-2">{formatTimestamp(event.peakTimestamp)}</td>
                  <td className="p-2">{event.durationIntervals}</td>
                  <td className="p-2">{event.maxExcessKw.toFixed(2)}</td>
                  <td className="p-2">{event.totalExcessKwh.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
