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
  start: string;
  end: string;
  peakTimestamp: string;
  durationIntervals: number;
  maxExcessKw: number;
  totalExcessKwh: number;
  intervalIndexes: number[];
}

export interface ExceededInterval {
  timestamp: string;
  consumptionKw: number;
  excessKw: number;
}

export interface MaxObservation {
  maxObservedKw: number;
  maxObservedAt: string | null;
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
}

export const BATTERY_OPTIONS: BatteryProduct[] = [
  { label: 'WattsNext ESS Cabinet 64 kWh', capacityKwh: 64 },
  { label: 'WattsNext ESS Cabinet 96 kWh', capacityKwh: 96 },
  { label: 'ESS All-in-one Cabinet 261 kWh', capacityKwh: 261 },
  { label: 'WattsNext All-in-one Container 2.09 MWh', capacityKwh: 2090 },
  { label: 'WattsNext All in-one Container 5.01 MWh', capacityKwh: 5010 }
];

export function processIntervals(
  rows: IntervalRecord[],
  contractedPowerKw: number
): ProcessedInterval[] {
  return rows.map((row) => {
    const consumptionKw = row.consumptionKwh / 0.25;
    const excessKw = Math.max(0, consumptionKw - contractedPowerKw);
    return {
      ...row,
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
          start: interval.timestamp,
          end: interval.timestamp,
          peakTimestamp: interval.timestamp,
          durationIntervals: 0,
          maxExcessKw: 0,
          totalExcessKwh: 0,
          intervalIndexes: []
        };
      }
      current.end = interval.timestamp;
      current.durationIntervals += 1;
      if (interval.excessKw > current.maxExcessKw) {
        current.maxExcessKw = interval.excessKw;
        current.peakTimestamp = interval.timestamp;
      } else if (interval.excessKw === current.maxExcessKw && interval.timestamp < current.peakTimestamp) {
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

  const recommendedProduct = BATTERY_OPTIONS.find((option) => kWhNeeded <= option.capacityKwh) ??
    BATTERY_OPTIONS[BATTERY_OPTIONS.length - 1];
  const recommendedIndex = BATTERY_OPTIONS.findIndex(
    (option) => option.capacityKwh === recommendedProduct.capacityKwh
  );
  const alternativeProduct = BATTERY_OPTIONS[recommendedIndex + 1] ?? null;

  return {
    kWhNeededRaw,
    kWNeededRaw,
    kWhNeeded,
    kWNeeded,
    recommendedProduct,
    alternativeProduct
  };
}


export function getMaxObservation(intervals: ProcessedInterval[]): MaxObservation {
  if (intervals.length === 0) {
    return { maxObservedKw: 0, maxObservedAt: null };
  }

  let max = intervals[0];
  for (const interval of intervals) {
    if (interval.consumptionKw > max.consumptionKw) {
      max = interval;
    } else if (interval.consumptionKw === max.consumptionKw && interval.timestamp < max.timestamp) {
      max = interval;
    }
  }

  return { maxObservedKw: max.consumptionKw, maxObservedAt: max.timestamp };
}

export function getTopExceededIntervalsForDay(
  intervals: ProcessedInterval[],
  day: string | null,
  limit = 20
): ExceededInterval[] {
  if (!day) return [];

  return intervals
    .filter((interval) => interval.timestamp.slice(0, 10) === day && interval.excessKw > 0)
    .sort((a, b) => {
      if (b.excessKw !== a.excessKw) return b.excessKw - a.excessKw;
      return a.timestamp.localeCompare(b.timestamp);
    })
    .slice(0, limit)
    .map((interval) => ({
      timestamp: interval.timestamp,
      consumptionKw: interval.consumptionKw,
      excessKw: interval.excessKw
    }));
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

  for (let i = 1; i < timestamps.length; i += 1) {
    const diffMinutes = (timestamps[i].getTime() - timestamps[i - 1].getTime()) / 60000;
    if (diffMinutes !== 15) {
      non15MinIntervals += 1;
      if (diffMinutes > 15) {
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
