import type { IntervalRecord } from './calculations';
import { parseTimestamp } from './datetime';

export type InterpretationMode = 'AUTO' | 'INTERVAL' | 'CUMULATIVE_DELTA';

export interface NormalizeOptions {
  intervalMinutes?: number;
  interpretationMode?: InterpretationMode;
  outlierKwThreshold?: number;
  allowNegativeDeltas?: boolean;
  hugeKwhThreshold?: number;
}

export interface NormalizationDiagnostics {
  interpretationRequested: InterpretationMode;
  interpretationUsed: 'INTERVAL' | 'CUMULATIVE_DELTA';
  rowsTotal: number;
  rowsUsed: number;
  invalidRows: number;
  countOutliers: number;
  maxOutlierKw: number | null;
  firstOutlierTimestamp: string | null;
  negativeDeltaCount: number;
  fractionNonDecreasing: number;
  medianDelta: number;
  fractionHugeValues: number;
  warnings: string[];
}

export interface NormalizeResult {
  normalizedRows: IntervalRecord[];
  diagnostics: NormalizationDiagnostics;
}

const DEFAULT_INTERVAL_MINUTES = 15;
const DEFAULT_OUTLIER_KW_THRESHOLD = 5000;
const DEFAULT_HUGE_KWH_THRESHOLD = 1000;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function resolveInterpretation(
  values: number[],
  mode: InterpretationMode,
  hugeKwhThreshold: number
): {
  interpretationUsed: 'INTERVAL' | 'CUMULATIVE_DELTA';
  fractionNonDecreasing: number;
  medianDelta: number;
  fractionHugeValues: number;
} {
  if (values.length < 2) {
    return {
      interpretationUsed: mode === 'CUMULATIVE_DELTA' ? 'CUMULATIVE_DELTA' : 'INTERVAL',
      fractionNonDecreasing: 0,
      medianDelta: 0,
      fractionHugeValues: values.length === 1 && values[0] > hugeKwhThreshold ? 1 : 0
    };
  }

  let nonDecreasingCount = 0;
  const deltas: number[] = [];
  let hugeCount = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] > hugeKwhThreshold) {
      hugeCount += 1;
    }
    if (i > 0) {
      const delta = values[i] - values[i - 1];
      deltas.push(delta);
      if (values[i] >= values[i - 1]) {
        nonDecreasingCount += 1;
      }
    }
  }

  const fractionNonDecreasing = nonDecreasingCount / (values.length - 1);
  const medianDelta = median(deltas);
  const fractionHugeValues = hugeCount / values.length;

  if (mode === 'INTERVAL') {
    return { interpretationUsed: 'INTERVAL', fractionNonDecreasing, medianDelta, fractionHugeValues };
  }
  if (mode === 'CUMULATIVE_DELTA') {
    return { interpretationUsed: 'CUMULATIVE_DELTA', fractionNonDecreasing, medianDelta, fractionHugeValues };
  }

  const looksCumulative =
    (fractionNonDecreasing > 0.98 && medianDelta >= 0) || fractionHugeValues > 0.001;
  return {
    interpretationUsed: looksCumulative ? 'CUMULATIVE_DELTA' : 'INTERVAL',
    fractionNonDecreasing,
    medianDelta,
    fractionHugeValues
  };
}

export function normalizeConsumptionSeries(
  rows: IntervalRecord[],
  options: NormalizeOptions = {}
): NormalizeResult {
  const intervalMinutes = options.intervalMinutes ?? DEFAULT_INTERVAL_MINUTES;
  const intervalHours = intervalMinutes / 60;
  const interpretationRequested = options.interpretationMode ?? 'AUTO';
  const outlierKwThreshold = options.outlierKwThreshold ?? DEFAULT_OUTLIER_KW_THRESHOLD;
  const allowNegativeDeltas = options.allowNegativeDeltas ?? false;
  const hugeKwhThreshold = options.hugeKwhThreshold ?? DEFAULT_HUGE_KWH_THRESHOLD;

  const warnings: string[] = [];

  const prepared: IntervalRecord[] = [];
  rows.forEach((row) => {
    const timestamp = parseTimestamp(row.timestamp);
    const consumption = Number(row.consumptionKwh);
    if (Number.isNaN(timestamp.getTime()) || Number.isNaN(consumption)) {
      return;
    }
    prepared.push({
      timestamp: timestamp.toISOString(),
      consumptionKwh: consumption,
      exportKwh: row.exportKwh,
      pvKwh: row.pvKwh
    });
  });
  prepared.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const values = prepared.map((row) => row.consumptionKwh);
  const interpretation = resolveInterpretation(values, interpretationRequested, hugeKwhThreshold);
  let negativeDeltaCount = 0;
  let countOutliers = 0;
  let maxOutlierKw: number | null = null;
  let firstOutlierTimestamp: string | null = null;
  const normalizedRows: IntervalRecord[] = [];

  for (let i = 0; i < prepared.length; i += 1) {
    const row = prepared[i];
    let intervalKwh = row.consumptionKwh;
    if (interpretation.interpretationUsed === 'CUMULATIVE_DELTA') {
      // Typical cumulative meter handling: use delta of meter reading per interval.
      if (i === 0) {
        intervalKwh = 0;
      } else {
        const delta = row.consumptionKwh - prepared[i - 1].consumptionKwh;
        if (delta < 0 && !allowNegativeDeltas) {
          negativeDeltaCount += 1;
          intervalKwh = 0;
        } else {
          intervalKwh = delta;
        }
      }
    }

    if (intervalKwh < 0) {
      continue;
    }

    const consumptionKw = intervalKwh / intervalHours;
    if (consumptionKw > outlierKwThreshold) {
      countOutliers += 1;
      maxOutlierKw = maxOutlierKw == null ? consumptionKw : Math.max(maxOutlierKw, consumptionKw);
      firstOutlierTimestamp = firstOutlierTimestamp ?? row.timestamp;
      continue;
    }

    normalizedRows.push({
      ...row,
      consumptionKwh: intervalKwh
    });
  }

  if (negativeDeltaCount > 0) {
    warnings.push(`${negativeDeltaCount} negatieve delta(s) zijn op 0 gezet.`);
  }
  if (countOutliers > 0) {
    warnings.push(`${countOutliers} outlier(s) boven ${outlierKwThreshold} kW uitgesloten.`);
  }

  return {
    normalizedRows,
    diagnostics: {
      interpretationRequested,
      interpretationUsed: interpretation.interpretationUsed,
      rowsTotal: rows.length,
      rowsUsed: normalizedRows.length,
      invalidRows: rows.length - prepared.length,
      countOutliers,
      maxOutlierKw,
      firstOutlierTimestamp,
      negativeDeltaCount,
      fractionNonDecreasing: interpretation.fractionNonDecreasing,
      medianDelta: interpretation.medianDelta,
      fractionHugeValues: interpretation.fractionHugeValues,
      warnings
    }
  };
}
