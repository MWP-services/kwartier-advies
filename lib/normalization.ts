import type { IntervalRecord } from './calculations';
import { parseTimestamp } from './datetime';

export type InterpretationMode = 'AUTO' | 'INTERVAL' | 'CUMULATIVE_DELTA';
export type EnergySeriesKey = 'consumptionKwh' | 'pvKwh' | 'exportKwh';

export interface NormalizeOptions {
  intervalMinutes?: number;
  interpretationMode?: InterpretationMode;
  outlierKwThreshold?: number;
  allowNegativeDeltas?: boolean;
  hugeKwhThreshold?: number;
}

export interface SeriesNormalizationDiagnostics {
  series: EnergySeriesKey;
  interpretationUsed: 'INTERVAL' | 'CUMULATIVE_DELTA';
  rowsWithValues: number;
  negativeDeltaCount: number;
  outlierCount: number;
  maxOutlierKw: number | null;
  firstOutlierTimestamp: string | null;
  fractionNonDecreasing: number;
  medianDelta: number;
  fractionHugeValues: number;
}

export interface NormalizationDiagnostics {
  interpretationRequested: InterpretationMode;
  interpretationUsed: 'INTERVAL' | 'CUMULATIVE_DELTA' | 'MIXED';
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
  series: Partial<Record<EnergySeriesKey, SeriesNormalizationDiagnostics>>;
  warnings: string[];
}

export interface NormalizeResult {
  normalizedRows: IntervalRecord[];
  diagnostics: NormalizationDiagnostics;
}

const DEFAULT_INTERVAL_MINUTES = 15;
const DEFAULT_OUTLIER_KW_THRESHOLD = 5000;
const DEFAULT_HUGE_KWH_THRESHOLD = 1000;
const SERIES_KEYS: EnergySeriesKey[] = ['consumptionKwh', 'pvKwh', 'exportKwh'];

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
    if (values[i] > hugeKwhThreshold) hugeCount += 1;
    if (i === 0) continue;
    const delta = values[i] - values[i - 1];
    deltas.push(delta);
    if (values[i] >= values[i - 1]) nonDecreasingCount += 1;
  }

  const fractionNonDecreasing = nonDecreasingCount / Math.max(1, values.length - 1);
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

function normalizeSeriesValue(
  preparedRows: IntervalRecord[],
  series: EnergySeriesKey,
  options: Required<Pick<NormalizeOptions, 'interpretationMode' | 'allowNegativeDeltas' | 'hugeKwhThreshold' | 'outlierKwThreshold' | 'intervalMinutes'>>
): {
  values: Array<number | undefined>;
  diagnostics: SeriesNormalizationDiagnostics | null;
  warnings: string[];
} {
  const intervalHours = options.intervalMinutes / 60;
  const presentValues = preparedRows
    .map((row) => row[series])
    .filter((value): value is number => value != null && Number.isFinite(value));

  if (presentValues.length === 0) {
    return {
      values: preparedRows.map(() => undefined),
      diagnostics: null,
      warnings: []
    };
  }

  const interpretation = resolveInterpretation(presentValues, options.interpretationMode, options.hugeKwhThreshold);
  const values: Array<number | undefined> = [];
  const warnings: string[] = [];
  let previousRawValue: number | null = null;
  let negativeDeltaCount = 0;
  let outlierCount = 0;
  let maxOutlierKw: number | null = null;
  let firstOutlierTimestamp: string | null = null;

  preparedRows.forEach((row) => {
    const rawValue = row[series];
    if (rawValue == null || !Number.isFinite(rawValue)) {
      values.push(undefined);
      return;
    }

    let normalizedValue = rawValue;
    if (interpretation.interpretationUsed === 'CUMULATIVE_DELTA') {
      if (previousRawValue == null) {
        normalizedValue = 0;
      } else {
        const delta = rawValue - previousRawValue;
        if (delta < 0 && !options.allowNegativeDeltas) {
          negativeDeltaCount += 1;
          normalizedValue = 0;
        } else {
          normalizedValue = delta;
        }
      }
    }
    previousRawValue = rawValue;

    if (normalizedValue < 0) {
      values.push(0);
      return;
    }

    const valueKw = normalizedValue / intervalHours;
    if (valueKw > options.outlierKwThreshold) {
      outlierCount += 1;
      maxOutlierKw = maxOutlierKw == null ? valueKw : Math.max(maxOutlierKw, valueKw);
      firstOutlierTimestamp = firstOutlierTimestamp ?? row.timestamp;
      values.push(0);
      return;
    }

    values.push(normalizedValue);
  });

  if (negativeDeltaCount > 0) {
    warnings.push(`${series}: ${negativeDeltaCount} negatieve delta(s) zijn op 0 gezet.`);
  }
  if (outlierCount > 0) {
    warnings.push(`${series}: ${outlierCount} outlier(s) boven ${options.outlierKwThreshold} kW zijn op 0 gezet.`);
  }

  return {
    values,
    diagnostics: {
      series,
      interpretationUsed: interpretation.interpretationUsed,
      rowsWithValues: presentValues.length,
      negativeDeltaCount,
      outlierCount,
      maxOutlierKw,
      firstOutlierTimestamp,
      fractionNonDecreasing: interpretation.fractionNonDecreasing,
      medianDelta: interpretation.medianDelta,
      fractionHugeValues: interpretation.fractionHugeValues
    },
    warnings
  };
}

export function normalizeEnergyDataset(rows: IntervalRecord[], options: NormalizeOptions = {}): NormalizeResult {
  const resolvedOptions = {
    intervalMinutes: options.intervalMinutes ?? DEFAULT_INTERVAL_MINUTES,
    interpretationMode: options.interpretationMode ?? 'AUTO',
    outlierKwThreshold: options.outlierKwThreshold ?? DEFAULT_OUTLIER_KW_THRESHOLD,
    allowNegativeDeltas: options.allowNegativeDeltas ?? false,
    hugeKwhThreshold: options.hugeKwhThreshold ?? DEFAULT_HUGE_KWH_THRESHOLD
  };

  const warnings: string[] = [];
  const preparedRows: IntervalRecord[] = [];
  rows.forEach((row) => {
    const timestamp = parseTimestamp(row.timestamp);
    const consumption = Number(row.consumptionKwh);
    if (Number.isNaN(timestamp.getTime()) || Number.isNaN(consumption)) {
      return;
    }

    const pvKwh =
      row.pvKwh == null || Number.isNaN(Number(row.pvKwh)) ? undefined : Number(row.pvKwh);
    const exportKwh =
      row.exportKwh == null || Number.isNaN(Number(row.exportKwh)) ? undefined : Number(row.exportKwh);

    preparedRows.push({
      timestamp: timestamp.toISOString(),
      consumptionKwh: consumption,
      pvKwh,
      exportKwh
    });
  });
  preparedRows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const perSeries = Object.fromEntries(
    SERIES_KEYS.map((series) => [series, normalizeSeriesValue(preparedRows, series, resolvedOptions)])
  ) as Record<EnergySeriesKey, ReturnType<typeof normalizeSeriesValue>>;

  const normalizedRows = preparedRows.map((row, index) => ({
    timestamp: row.timestamp,
    consumptionKwh: perSeries.consumptionKwh.values[index] ?? 0,
    pvKwh: perSeries.pvKwh.values[index],
    exportKwh: perSeries.exportKwh.values[index]
  }));

  warnings.push(...SERIES_KEYS.flatMap((series) => perSeries[series].warnings));
  const presentDiagnostics = SERIES_KEYS
    .map((series) => perSeries[series].diagnostics)
    .filter((diagnostic): diagnostic is SeriesNormalizationDiagnostics => diagnostic != null);

  const interpretationSet = new Set(presentDiagnostics.map((diagnostic) => diagnostic.interpretationUsed));
  const interpretationUsed =
    interpretationSet.size <= 1
      ? (presentDiagnostics[0]?.interpretationUsed ?? 'INTERVAL')
      : 'MIXED';
  const countOutliers = presentDiagnostics.reduce((sum, diagnostic) => sum + diagnostic.outlierCount, 0);
  const negativeDeltaCount = presentDiagnostics.reduce((sum, diagnostic) => sum + diagnostic.negativeDeltaCount, 0);
  const maxOutlierKw = presentDiagnostics.reduce<number | null>(
    (maxValue, diagnostic) =>
      diagnostic.maxOutlierKw == null ? maxValue : maxValue == null ? diagnostic.maxOutlierKw : Math.max(maxValue, diagnostic.maxOutlierKw),
    null
  );
  const firstOutlierTimestamp =
    presentDiagnostics
      .map((diagnostic) => diagnostic.firstOutlierTimestamp)
      .filter((timestamp): timestamp is string => timestamp != null)
      .sort()[0] ?? null;

  const primarySeries = perSeries.consumptionKwh.diagnostics ?? presentDiagnostics[0] ?? null;

  return {
    normalizedRows,
    diagnostics: {
      interpretationRequested: resolvedOptions.interpretationMode,
      interpretationUsed,
      rowsTotal: rows.length,
      rowsUsed: normalizedRows.length,
      invalidRows: rows.length - preparedRows.length,
      countOutliers,
      maxOutlierKw,
      firstOutlierTimestamp,
      negativeDeltaCount,
      fractionNonDecreasing: primarySeries?.fractionNonDecreasing ?? 0,
      medianDelta: primarySeries?.medianDelta ?? 0,
      fractionHugeValues: primarySeries?.fractionHugeValues ?? 0,
      series: Object.fromEntries(
        SERIES_KEYS.map((series) => [series, perSeries[series].diagnostics ?? undefined])
      ) as Partial<Record<EnergySeriesKey, SeriesNormalizationDiagnostics>>,
      warnings
    }
  };
}

export function normalizeConsumptionSeries(rows: IntervalRecord[], options: NormalizeOptions = {}): NormalizeResult {
  return normalizeEnergyDataset(rows, options);
}
