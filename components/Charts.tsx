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
import type { ExceededInterval, PeakEvent, ProcessedInterval } from '@/lib/calculations';
import { formatTimestamp } from '@/lib/datetime';

interface ChartsProps {
  intervals: ProcessedInterval[];
  contractKw: number;
  topEvents: PeakEvent[];
  highestPeakDay: string | null;
  topExceededIntervals: ExceededInterval[];
}

export function Charts({ intervals, contractKw, topEvents, highestPeakDay, topExceededIntervals }: ChartsProps) {
  const selectedDay = highestPeakDay ?? intervals[0]?.timestamp.slice(0, 10);
  const markerSet = new Set(topExceededIntervals.map((interval) => interval.timestamp));
  const daySeries = intervals
    .filter((interval) => interval.timestamp.slice(0, 10) === selectedDay)
    .map((i) => ({ ...i, contractKw, isTopExceeded: markerSet.has(i.timestamp) }));

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
              <XAxis dataKey="timestamp" hide />
              <YAxis />
              <Tooltip />
              <Bar dataKey="consumptionKw" fill="#3b82f6" />
              <Line type="monotone" dataKey="contractKw" stroke="#ef4444" dot={false} />
              {daySeries
                .filter((interval) => interval.isTopExceeded)
                .map((interval) => (
                  <ReferenceDot
                    key={interval.timestamp}
                    x={interval.timestamp}
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
