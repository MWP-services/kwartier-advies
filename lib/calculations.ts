import { getLocalDayIso, getLocalHourMinute, parseTimestamp } from './datetime';

export type Method = 'MAX_PEAK' | 'P95' | 'FULL_COVERAGE';

export interface IntervalRecord {
  timestamp: string;
  consumptionKwh: number;
  exportKwh?: number;
  pvKwh?: number;
}

export interface ProcessedInterval extends IntervalRecord {
  consumptionKw: number;
  excessKw: number;
  excessKwh: number;
}

export interface PeakEvent {
  peakTimestamp: string;
  durationIntervals: number;
  maxExcessKw: number;
  totalExcessKwh: number;
  intervalIndexes: number[];
}

export interface DataQualityReport {
  rows: number;
  startDate: string | null;
  endDate: string | null;
  missingIntervalsCount: number;
  duplicateCount: number;
  non15MinIntervals: number;
  warnings: string[];
}

export interface SizingResult {
  kWhNeededRaw: number;
  kWNeededRaw: number;
  kWhNeeded: number;
  kWNeeded: number;
  recommendedProduct: BatteryProduct;
  alternativeProduct: BatteryProduct | null;
}

export interface BatteryProduct {
  label: string;
  capacityKwh: number;
  modular?: boolean;
  unitPriceEur?: number;
  unitCapacityKwh?: number;
  count?: number;
  totalPriceEur?: number;
  breakdown?: BatteryBreakdown[];
}

export interface BatteryBreakdown {
  type: string;
  count: number;
  unitCapacityKwh: number;
  unitPriceEur: number;
  totalPriceEur: number;
}

export interface ExceededInterval {
  timestamp: string;
  consumption_kW: number;
  excess_kW: number;
}

export interface DayProfilePoint {
  timestampLabel: string;
  timestampIso: string;
  observedKw: number;
}

export interface DayKwSeriesPoint {
  timeLabel: string;
  timestampIso: string;
  consumptionKw: number;
}

export const BATTERY_OPTIONS: BatteryProduct[] = [
  {
    label: 'WattsNext ESS Cabinet 64 kWh',
    capacityKwh: 64,
    modular: true,
    unitPriceEur: 15689.33
  },
  {
    label: 'WattsNext ESS Cabinet 96 kWh',
    capacityKwh: 96,
    modular: true,
    unitPriceEur: 22225.98
  },
  {
    label: 'ESS All-in-one Cabinet 261 kWh',
    capacityKwh: 261,
    modular: true,
    unitPriceEur: 43995.96
  },
  {
    label: 'WattsNext All-in-one Container 2.09 MWh',
    capacityKwh: 2090,
    modular: false,
    unitPriceEur: 318658.06
  },
  {
    label: 'WattsNext All in-one Container 5.015 MWh',
    capacityKwh: 5015,
    modular: false,
    unitPriceEur: 675052.49
  }
];

interface BatteryConfigurationCandidate {
  label: string;
  totalCapacityKwh: number;
  totalPriceEur: number;
  overCapacityKwh: number;
  count: number;
  unitCapacityKwh: number;
  unitPriceEur: number;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function toBatteryProduct(candidate: BatteryConfigurationCandidate): BatteryProduct {
  const totalPriceEur = roundCurrency(candidate.totalPriceEur);
  return {
    label: candidate.label,
    capacityKwh: candidate.totalCapacityKwh,
    unitCapacityKwh: candidate.unitCapacityKwh,
    count: candidate.count,
    unitPriceEur: roundCurrency(candidate.unitPriceEur),
    totalPriceEur,
    breakdown: [
      {
        type: `${candidate.unitCapacityKwh} kWh`,
        count: candidate.count,
        unitCapacityKwh: candidate.unitCapacityKwh,
        unitPriceEur: roundCurrency(candidate.unitPriceEur),
        totalPriceEur
      }
    ]
  };
}

export function selectMinimumCostBatteryOptions(requiredKwh: number): {
  recommendedProduct: BatteryProduct;
  alternativeProduct: BatteryProduct | null;
} {
  const normalizedRequired = Math.max(0, requiredKwh);
  const candidates: BatteryConfigurationCandidate[] = [];

  BATTERY_OPTIONS.forEach((option) => {
    const unitPriceEur = option.unitPriceEur ?? 0;
    if (option.modular) {
      const maxCount = Math.max(1, Math.ceil(normalizedRequired / option.capacityKwh));
      for (let count = 1; count <= maxCount; count += 1) {
        const totalCapacityKwh = count * option.capacityKwh;
        if (totalCapacityKwh < normalizedRequired) continue;
        const totalPriceEur = count * unitPriceEur;
        candidates.push({
          label: `${count}x ${option.capacityKwh} kWh (modulair)`,
          totalCapacityKwh,
          totalPriceEur,
          overCapacityKwh: totalCapacityKwh - normalizedRequired,
          count,
          unitCapacityKwh: option.capacityKwh,
          unitPriceEur
        });
      }
      return;
    }

    if (option.capacityKwh >= normalizedRequired) {
      candidates.push({
        label: option.label,
        totalCapacityKwh: option.capacityKwh,
        totalPriceEur: unitPriceEur,
        overCapacityKwh: option.capacityKwh - normalizedRequired,
        count: 1,
        unitCapacityKwh: option.capacityKwh,
        unitPriceEur
      });
    }
  });

  const sorted = candidates.sort(
    (a, b) =>
      a.totalPriceEur - b.totalPriceEur ||
      a.overCapacityKwh - b.overCapacityKwh ||
      a.totalCapacityKwh - b.totalCapacityKwh
  );

  const recommendedProduct = toBatteryProduct(sorted[0]);
  const alternativeProduct = sorted[1] ? toBatteryProduct(sorted[1]) : null;

  return { recommendedProduct, alternativeProduct };
}

export function processIntervals(
  rows: IntervalRecord[],
  contractedPowerKw: number
): ProcessedInterval[] {
  return rows.map((row) => {
    const timestamp = parseTimestamp(row.timestamp);
    const normalizedTimestamp = Number.isNaN(timestamp.getTime()) ? row.timestamp : timestamp.toISOString();
    const consumptionKw = row.consumptionKwh / 0.25;
    const excessKw = Math.max(0, consumptionKw - contractedPowerKw);
    return {
      ...row,
      timestamp: normalizedTimestamp,
      consumptionKw,
      excessKw,
      excessKwh: excessKw * 0.25
    };
  });
}

export function groupPeakEvents(intervals: ProcessedInterval[]): PeakEvent[] {
  const events: PeakEvent[] = [];
  let current: PeakEvent | null = null;

  intervals.forEach((interval, index) => {
    if (interval.excessKw > 0) {
      if (!current) {
        current = {
          peakTimestamp: interval.timestamp,
          durationIntervals: 0,
          maxExcessKw: 0,
          totalExcessKwh: 0,
          intervalIndexes: []
        };
      }
      current.durationIntervals += 1;
      if (
        interval.excessKw > current.maxExcessKw ||
        (interval.excessKw === current.maxExcessKw && interval.timestamp < current.peakTimestamp)
      ) {
        current.maxExcessKw = interval.excessKw;
        current.peakTimestamp = interval.timestamp;
      }
      current.totalExcessKwh += interval.excessKwh;
      current.intervalIndexes.push(index);
    } else if (current) {
      events.push(current);
      current = null;
    }
  });

  if (current) {
    events.push(current);
  }

  return events;
}

export function countExceedanceIntervals(events: PeakEvent[]): number {
  return events.reduce((sum, event) => sum + event.durationIntervals, 0);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

export function computeSizing(params: {
  intervals: ProcessedInterval[];
  events: PeakEvent[];
  method: Method;
  compliance: number;
  safetyFactor: number;
  efficiency: number;
}): SizingResult {
  const { intervals, events, method, compliance, safetyFactor, efficiency } = params;

  let kWhNeededRaw = 0;
  let kWNeededRaw = 0;

  if (method === 'MAX_PEAK') {
    const highestEnergyEvent = [...events].sort(
      (a, b) => b.totalExcessKwh - a.totalExcessKwh
    )[0];
    if (highestEnergyEvent) {
      kWhNeededRaw = highestEnergyEvent.totalExcessKwh;
      kWNeededRaw = highestEnergyEvent.maxExcessKw;
    }
  }

  if (method === 'P95') {
    if (events.length < 20) {
      const highestEnergyEvent = [...events].sort(
        (a, b) => b.totalExcessKwh - a.totalExcessKwh
      )[0];
      if (highestEnergyEvent) {
        kWhNeededRaw = highestEnergyEvent.totalExcessKwh;
        kWNeededRaw = highestEnergyEvent.maxExcessKw;
      }
    } else {
      kWhNeededRaw = percentile(
        events.map((event) => event.totalExcessKwh),
        95
      );
      kWNeededRaw = percentile(
        events.map((event) => event.maxExcessKw),
        95
      );
    }
  }

  if (method === 'FULL_COVERAGE') {
    const byDay = new Map<string, ProcessedInterval[]>();
    intervals.forEach((interval) => {
      const day = interval.timestamp.slice(0, 10);
      const list = byDay.get(day) ?? [];
      list.push(interval);
      byDay.set(day, list);
    });

    let maxDayEnergy = 0;
    let maxDayPeak = 0;

    byDay.forEach((dayIntervals) => {
      const dayEnergy = dayIntervals.reduce((sum, interval) => sum + interval.excessKwh, 0);
      if (dayEnergy > maxDayEnergy) {
        maxDayEnergy = dayEnergy;
        maxDayPeak = Math.max(...dayIntervals.map((interval) => interval.excessKw));
      }
    });

    kWhNeededRaw = maxDayEnergy;
    kWNeededRaw = maxDayPeak;
  }

  kWhNeededRaw *= compliance;
  kWNeededRaw *= compliance;

  const kWhNeeded = (kWhNeededRaw / efficiency) * safetyFactor;
  const kWNeeded = kWNeededRaw * safetyFactor;

  const { recommendedProduct, alternativeProduct } = selectMinimumCostBatteryOptions(kWhNeeded);

  return {
    kWhNeededRaw,
    kWNeededRaw,
    kWhNeeded,
    kWNeeded,
    recommendedProduct,
    alternativeProduct
  };
}

export function buildDataQualityReport(intervals: IntervalRecord[]): DataQualityReport {
  if (intervals.length === 0) {
    return {
      rows: 0,
      startDate: null,
      endDate: null,
      missingIntervalsCount: 0,
      duplicateCount: 0,
      non15MinIntervals: 0,
      warnings: ['No rows found in dataset.']
    };
  }

  const timestamps = intervals
    .map((row) => new Date(row.timestamp))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  const duplicateCount = timestamps.length - new Set(timestamps.map((d) => d.toISOString())).size;
  let non15MinIntervals = 0;
  let missingIntervalsCount = 0;
  const EPS = 0.01;

  for (let i = 1; i < timestamps.length; i += 1) {
    const diffMinutes = (timestamps[i].getTime() - timestamps[i - 1].getTime()) / 60000;
    if (Math.abs(diffMinutes - 15) > EPS) {
      non15MinIntervals += 1;
      if (diffMinutes > 15 + EPS) {
        missingIntervalsCount += Math.max(0, Math.round(diffMinutes / 15) - 1);
      }
    }
  }

  const warnings: string[] = [];
  if (duplicateCount > 0) warnings.push(`Detected ${duplicateCount} duplicate timestamps.`);
  if (non15MinIntervals > 0) {
    warnings.push(`Detected ${non15MinIntervals} non-15-minute interval transitions.`);
  }

  return {
    rows: intervals.length,
    startDate: timestamps[0]?.toISOString() ?? null,
    endDate: timestamps[timestamps.length - 1]?.toISOString() ?? null,
    missingIntervalsCount,
    duplicateCount,
    non15MinIntervals,
    warnings
  };
}

export function findMaxObserved(intervals: ProcessedInterval[]): {
  maxObservedKw: number;
  maxObservedTimestamp: string | null;
} {
  if (intervals.length === 0) {
    return {
      maxObservedKw: 0,
      maxObservedTimestamp: null
    };
  }

  let maxObservedKw = -1;
  let maxObservedTimestamp: string | null = null;

  intervals.forEach((interval) => {
    if (
      interval.consumptionKw > maxObservedKw ||
      (interval.consumptionKw === maxObservedKw &&
        maxObservedTimestamp !== null &&
        interval.timestamp < maxObservedTimestamp)
    ) {
      maxObservedKw = interval.consumptionKw;
      maxObservedTimestamp = interval.timestamp;
    }
  });

  return {
    maxObservedKw,
    maxObservedTimestamp
  };
}

export function selectTopExceededIntervals(
  intervals: ProcessedInterval[],
  day: string,
  limit = 20
): ExceededInterval[] {
  return intervals
    .filter((interval) => getLocalDayIso(interval.timestamp) === day && interval.excessKw > 0)
    .sort((a, b) => b.excessKw - a.excessKw || a.timestamp.localeCompare(b.timestamp))
    .slice(0, limit)
    .map((interval) => ({
      timestamp: interval.timestamp,
      consumption_kW: interval.consumptionKw,
      excess_kW: interval.excessKw
    }));
}

export function buildDayProfile(
  intervals: ProcessedInterval[],
  dayIso: string,
  intervalMinutes = 15,
  timeZone = 'Europe/Amsterdam'
): DayProfilePoint[] {
  const fullDaySeries = buildDayKwSeries(
    intervals.map((interval) => ({
      timestamp: interval.timestamp,
      consumptionKw: interval.consumptionKw
    })),
    dayIso,
    intervalMinutes,
    timeZone
  );

  return fullDaySeries.map((slot) => ({
    timestampLabel: slot.timeLabel,
    timestampIso: slot.timestampIso,
    observedKw: slot.consumptionKw
  }));
}

export function buildDayKwSeries(
  intervals: { timestamp: string; consumptionKw: number }[],
  dayIso: string,
  intervalMinutes = 15,
  timeZone = 'Europe/Amsterdam'
): DayKwSeriesPoint[] {
  if (!dayIso || intervalMinutes <= 0) return [];

  const [year, month, day] = dayIso.split('-').map(Number);
  const dayStartLocal = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (Number.isNaN(dayStartLocal.getTime())) return [];

  const slotsPerDay = Math.floor((24 * 60) / intervalMinutes);
  const profile = Array.from({ length: slotsPerDay }, (_, index): DayKwSeriesPoint => {
    const minutes = index * intervalMinutes;
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    return {
      timeLabel: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      timestampIso: new Date(dayStartLocal.getTime() + minutes * 60_000).toISOString(),
      consumptionKw: 0
    };
  });

  intervals.forEach((interval) => {
    if (getLocalDayIso(interval.timestamp, timeZone) !== dayIso) return;

    const dt = parseTimestamp(interval.timestamp);
    if (Number.isNaN(dt.getTime())) return;
    const { hour, minute } = getLocalHourMinute(dt, timeZone);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return;

    const minuteOfDay = hour * 60 + minute;
    const slotIndex = Math.floor(minuteOfDay / intervalMinutes);
    if (slotIndex < 0 || slotIndex >= slotsPerDay) return;

    profile[slotIndex].consumptionKw = Math.max(profile[slotIndex].consumptionKw, interval.consumptionKw);
  });

  return profile;
}
