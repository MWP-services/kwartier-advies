import { getLocalDayIso, getLocalHourMinute, parseTimestamp } from './datetime';
import {
  derivePvIntervalFlow as derivePvIntervalFlowBase,
  type PvAnalysisMode,
  type PvStrategy,
  type PvTradingConfig
} from './pvSimulation';
import { getBatterySpecForCapacity } from './batterySpecs';
import type { ScenarioResult } from './simulation';

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

export interface PeakMoment {
  timestamp: string;
  consumptionKw: number;
  excessKw: number;
  excessKwh: number;
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
  recommendedProduct: BatteryProduct | null;
  alternativeProduct: BatteryProduct | null;
  noFeasibleBatteryByPower: boolean;
  pvFormulaAdvice?: PvStorageFormulaAdviceResult | null;
}

export interface PvSizingSettings {
  compliance: number;
  safetyFactor: number;
  efficiency: number;
  strategy: PvStrategy;
  trading?: PvTradingConfig;
  customerType?: 'auto' | 'home' | 'business';
}

export interface PvFormulaDailyRow {
  date: string;
  dailyExportKwh: number;
  eveningNightImportKwh: number;
  dailyStorageNeedKwh: number;
  isPvActiveDay: boolean;
}

export interface PvStorageFormulaAdviceConfig {
  usableBatteryFraction: number;
  conservativeSafetyFactor: number;
  recommendedSafetyFactor: number;
  spaciousSafetyFactor: number;
  eveningNightStart1: string;
  eveningNightEnd1: string;
  eveningNightStart2: string;
  eveningNightEnd2: string;
  homeActiveDayThresholdKwh: number;
  businessActiveDayThresholdKwh: number;
  minActiveDays: number;
  customerType: 'auto' | 'home' | 'business';
  maxHomeBatteryKwh: number;
  availableHomeOptionsKwh: number[];
  availableBusinessOptionsKwh: number[];
}

export interface PvStorageFormulaAdviceResult {
  customerTypeDetected: 'home' | 'business';
  usedCustomerType: 'home' | 'business';
  totals: {
    totalImportKwh: number;
    totalExportKwh: number;
    maxDailyExportKwh: number;
    numberOfDays: number;
    numberOfPvActiveDays: number;
  };
  percentiles: {
    p50StorageNeedKwh: number;
    p75StorageNeedKwh: number;
    p90StorageNeedKwh: number;
  };
  rawAdvice: {
    conservativeKwh: number;
    recommendedKwh: number;
    spaciousKwh: number;
    rawRecommendedKwh: number;
    cappedRecommendedKwh: number;
    capReason?: string;
  };
  roundedAdvice: {
    conservativeKwh: number;
    recommendedKwh: number;
    spaciousKwh: number;
  };
  dailyRows: PvFormulaDailyRow[];
  warnings: string[];
  explanation: string[];
  configUsed: PvStorageFormulaAdviceConfig;
}

export interface PvAdviceChartsData {
  dailyStorageChart: Array<{
    date: string;
    dailyStorageNeedKwh: number;
    p50: number;
    p75: number;
    p90: number;
  }>;
  storageDistributionChart: Array<{
    bucket: string;
    count: number;
  }>;
  exportVsNightImportChart: Array<{
    date: string;
    dailyExportKwh: number;
    eveningNightImportKwh: number;
    dailyStorageNeedKwh: number;
  }>;
  adviceComparisonChart: Array<{
    label: string;
    capacityKwh: number;
    emphasis?: boolean;
  }>;
  marginalGainChart: Array<{
    capacityKwh: number;
    coveredStorageKwhPerYear: number;
    marginalGainKwh: number;
    marginalGainPerAddedKwh: number;
  }>;
  coverageByCapacityChart: Array<{
    capacityKwh: number;
    fullyCoveredDaysPercentage: number;
    averageCoveragePercentage: number;
  }>;
  monthlyStorageChart: Array<{
    month: string;
    monthlyExportKwh: number;
    monthlyEveningNightImportKwh: number;
    monthlyUsefulStorageNeedKwh: number;
  }>;
  exampleDayChart: Array<{
    timestamp: string;
    importKwh: number;
    exportKwh: number;
    batterySocKwh: number;
  }>;
  warnings: string[];
}

export interface BatteryProduct {
  label: string;
  capacityKwh: number;
  powerKw: number;
  modular?: boolean;
  unitPriceEur?: number;
  unitCapacityKwh?: number;
  unitPowerKw?: number;
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

export interface PvIntervalFlow {
  mode?: PvAnalysisMode;
  directSelfConsumptionKwh: number;
  surplusKwh: number;
  loadDeficitKwh: number;
  mismatchKw: number;
}

export const BATTERY_OPTIONS: BatteryProduct[] = [
  {
    label: 'WattsNext ESS Cabinet 64 kWh',
    capacityKwh: 64,
    powerKw: 30,
    modular: true,
    unitPriceEur: 15689.33
  },
  {
    label: 'WattsNext ESS Cabinet 96 kWh',
    capacityKwh: 96,
    powerKw: 48,
    modular: true,
    unitPriceEur: 22225.98
  },
  {
    label: 'ESS All-in-one Cabinet 261 kWh',
    capacityKwh: 261,
    powerKw: 125,
    modular: true,
    unitPriceEur: 43995.96
  },
  {
    label: 'WattsNext All-in-one Container 2.09 MWh',
    capacityKwh: 2090,
    powerKw: 1000,
    modular: false,
    unitPriceEur: 318658.06
  },
  {
    label: 'WattsNext All in-one Container 5.015 MWh',
    capacityKwh: 5015,
    powerKw: 2580,
    modular: false,
    unitPriceEur: 675052.49
  }
];

interface BatteryConfigurationCandidate {
  label: string;
  totalCapacityKwh: number;
  totalPowerKw: number;
  totalPriceEur: number;
  overCapacityKwh: number;
  overPowerKw: number;
  count: number;
  unitCapacityKwh: number;
  unitPowerKw: number;
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
    powerKw: candidate.totalPowerKw,
    unitCapacityKwh: candidate.unitCapacityKwh,
    unitPowerKw: candidate.unitPowerKw,
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

export function selectMinimumCostBatteryOptions(requiredKwh: number, requiredKw = 0): {
  recommendedProduct: BatteryProduct | null;
  alternativeProduct: BatteryProduct | null;
  noFeasibleBatteryByPower: boolean;
} {
  const normalizedRequiredKwh = Math.max(0, requiredKwh);
  const normalizedRequiredKw = Math.max(0, requiredKw);
  const candidates: BatteryConfigurationCandidate[] = [];

  BATTERY_OPTIONS.forEach((option) => {
    const unitPriceEur = option.unitPriceEur ?? 0;
    if (option.modular) {
      const minCountByKwh = Math.ceil(normalizedRequiredKwh / option.capacityKwh);
      const minCountByKw = Math.ceil(normalizedRequiredKw / option.powerKw);
      const requiredCount = Math.max(1, minCountByKwh, minCountByKw);
      const maxCount = requiredCount;
      for (let count = 1; count <= maxCount; count += 1) {
        const totalCapacityKwh = count * option.capacityKwh;
        const totalPowerKw = count * option.powerKw;
        if (totalCapacityKwh < normalizedRequiredKwh || totalPowerKw < normalizedRequiredKw) continue;
        const totalPriceEur = count * unitPriceEur;
        candidates.push({
          label: `${count}x ${option.capacityKwh} kWh (modulair)`,
          totalCapacityKwh,
          totalPowerKw,
          totalPriceEur,
          overCapacityKwh: totalCapacityKwh - normalizedRequiredKwh,
          overPowerKw: totalPowerKw - normalizedRequiredKw,
          count,
          unitCapacityKwh: option.capacityKwh,
          unitPowerKw: option.powerKw,
          unitPriceEur
        });
      }
      return;
    }

    if (option.capacityKwh >= normalizedRequiredKwh && option.powerKw >= normalizedRequiredKw) {
      candidates.push({
        label: option.label,
        totalCapacityKwh: option.capacityKwh,
        totalPowerKw: option.powerKw,
        totalPriceEur: unitPriceEur,
        overCapacityKwh: option.capacityKwh - normalizedRequiredKwh,
        overPowerKw: option.powerKw - normalizedRequiredKw,
        count: 1,
        unitCapacityKwh: option.capacityKwh,
        unitPowerKw: option.powerKw,
        unitPriceEur
      });
    }
  });

  const sorted = candidates.sort(
    (a, b) =>
      a.totalPriceEur - b.totalPriceEur ||
      a.overCapacityKwh - b.overCapacityKwh ||
      a.overPowerKw - b.overPowerKw ||
      a.totalCapacityKwh - b.totalCapacityKwh
  );

  if (sorted.length === 0) {
    return {
      recommendedProduct: null,
      alternativeProduct: null,
      noFeasibleBatteryByPower: normalizedRequiredKw > 0
    };
  }

  const recommendedProduct = toBatteryProduct(sorted[0]);
  const alternativeProduct = sorted[1] ? toBatteryProduct(sorted[1]) : null;

  return {
    recommendedProduct,
    alternativeProduct,
    noFeasibleBatteryByPower: false
  };
}

export function processIntervals(
  rows: IntervalRecord[],
  contractedPowerKw: number
): ProcessedInterval[] {
  return rows.map((row) => {
    const rawTimestamp = row.timestamp;
    // Fast path: normalized pipeline already uses ISO UTC timestamps.
    const normalizedTimestamp =
      typeof rawTimestamp === 'string' && /^\d{4}-\d{2}-\d{2}T.*Z$/.test(rawTimestamp)
        ? rawTimestamp
        : (() => {
            const timestamp = parseTimestamp(rawTimestamp);
            return Number.isNaN(timestamp.getTime()) ? String(rawTimestamp) : timestamp.toISOString();
          })();
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

export function derivePvIntervalFlow(interval: IntervalRecord | ProcessedInterval): PvIntervalFlow {
  const base = derivePvIntervalFlowBase(interval);
  const mismatchKw = Math.max(base.surplusKwh, base.loadDeficitKwh) / 0.25;

  return {
    mode: base.mode,
    directSelfConsumptionKwh: base.directSelfConsumptionKwh,
    surplusKwh: base.surplusKwh,
    loadDeficitKwh: base.loadDeficitKwh,
    mismatchKw
  };
}


export const DEFAULT_PV_STORAGE_FORMULA_CONFIG: PvStorageFormulaAdviceConfig = {
  usableBatteryFraction: 0.9,
  conservativeSafetyFactor: 1.1,
  recommendedSafetyFactor: 1.15,
  spaciousSafetyFactor: 1.2,
  eveningNightStart1: '00:00',
  eveningNightEnd1: '08:00',
  eveningNightStart2: '17:00',
  eveningNightEnd2: '24:00',
  homeActiveDayThresholdKwh: 1,
  businessActiveDayThresholdKwh: 5,
  minActiveDays: 30,
  customerType: 'auto',
  maxHomeBatteryKwh: 40,
  availableHomeOptionsKwh: [5, 10, 15, 20, 25, 30, 40],
  availableBusinessOptionsKwh: [64, 96, 261, 522, 783, 1044, 1305, 1566, 1827, 2090, 5015]
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * (p / 100);
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  if (lowerIndex === upperIndex) return sorted[lowerIndex];
  const weight = index - lowerIndex;
  return sorted[lowerIndex] * (1 - weight) + sorted[upperIndex] * weight;
}

function parseClockToMinutes(clock: string): number {
  if (clock === '24:00') return 24 * 60;
  const [hourRaw, minuteRaw] = clock.split(':');
  return Number(hourRaw) * 60 + Number(minuteRaw);
}

function isWithinClockWindow(
  hour: number,
  minute: number,
  startClock: string,
  endClock: string
): boolean {
  const valueMinutes = hour * 60 + minute;
  const startMinutes = parseClockToMinutes(startClock);
  const endMinutes = parseClockToMinutes(endClock);
  return valueMinutes >= startMinutes && valueMinutes < endMinutes;
}

export function roundUpToAvailableOption(valueKwh: number, options: number[]): number {
  const sorted = [...options].sort((a, b) => a - b);
  return sorted.find((option) => option >= valueKwh) ?? sorted[sorted.length - 1] ?? 0;
}

function buildHomeBatteryProduct(capacityKwh: number, labelPrefix: string): BatteryProduct {
  const spec = getBatterySpecForCapacity(capacityKwh);
  return {
    label: `${labelPrefix} ${capacityKwh} kWh`,
    capacityKwh,
    powerKw: spec.maxDischargeKw
  };
}

function buildBusinessBatteryProduct(capacityKwh: number, labelPrefix: string): BatteryProduct {
  const matchedBase = BATTERY_OPTIONS.find((candidate) => candidate.capacityKwh === capacityKwh);
  if (matchedBase) {
    return { ...matchedBase, label: `${labelPrefix}: ${matchedBase.label}` };
  }

  if (capacityKwh % 261 === 0) {
    const count = capacityKwh / 261;
    const spec = getBatterySpecForCapacity(capacityKwh);
    return {
      label: `${labelPrefix}: ${count}x 261 kWh (modulair)`,
      capacityKwh,
      powerKw: spec.maxDischargeKw,
      modular: true,
      unitCapacityKwh: 261,
      count
    };
  }

  const spec = getBatterySpecForCapacity(capacityKwh);
  return {
    label: `${labelPrefix}: ${capacityKwh} kWh`,
    capacityKwh,
    powerKw: spec.maxDischargeKw
  };
}

function buildAdviceProduct(
  capacityKwh: number,
  customerType: 'home' | 'business',
  labelPrefix: string
): BatteryProduct {
  return customerType === 'business'
    ? buildBusinessBatteryProduct(capacityKwh, labelPrefix)
    : buildHomeBatteryProduct(capacityKwh, labelPrefix);
}

export function computePvStorageFormulaAdvice(
  intervals: ProcessedInterval[],
  config: Partial<PvStorageFormulaAdviceConfig> = {}
): PvStorageFormulaAdviceResult {
  // Deze formulematige PV-advieslaag werkt op dagelijkse opslagbehoefte en percentielen.
  // De grafieken en het advies zijn dus expliciet niet gebaseerd op maximale exportreductie
  // of op "de grootste batterij wint", maar op representatieve dagelijkse benutting.
  const resolvedConfig: PvStorageFormulaAdviceConfig = {
    ...DEFAULT_PV_STORAGE_FORMULA_CONFIG,
    ...config
  };

  const dayMap = new Map<string, PvFormulaDailyRow>();
  let totalImportKwh = 0;
  let totalExportKwh = 0;

  intervals.forEach((interval) => {
    const date = getLocalDayIso(interval.timestamp, 'Europe/Amsterdam');
    const day = dayMap.get(date) ?? {
      date,
      dailyExportKwh: 0,
      eveningNightImportKwh: 0,
      dailyStorageNeedKwh: 0,
      isPvActiveDay: false
    };
    const flow = derivePvIntervalFlow(interval);
    const importKwh = Math.max(0, flow.loadDeficitKwh);
    const exportKwh = Math.max(0, flow.surplusKwh);
    const { hour, minute } = getLocalHourMinute(interval.timestamp, 'Europe/Amsterdam');
    const isEveningNight =
      isWithinClockWindow(hour, minute, resolvedConfig.eveningNightStart1, resolvedConfig.eveningNightEnd1) ||
      isWithinClockWindow(hour, minute, resolvedConfig.eveningNightStart2, resolvedConfig.eveningNightEnd2);

    day.dailyExportKwh += exportKwh;
    if (isEveningNight) {
      day.eveningNightImportKwh += importKwh;
    }

    totalImportKwh += importKwh;
    totalExportKwh += exportKwh;
    dayMap.set(date, day);
  });

  const dailyRows = Array.from(dayMap.values())
    .map((day) => ({
      ...day,
      dailyExportKwh: round2(day.dailyExportKwh),
      eveningNightImportKwh: round2(day.eveningNightImportKwh),
      dailyStorageNeedKwh: round2(Math.min(day.dailyExportKwh, day.eveningNightImportKwh))
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const maxDailyExportKwh = Math.max(0, ...dailyRows.map((day) => day.dailyExportKwh));
  const allStorageNeeds = dailyRows.map((day) => day.dailyStorageNeedKwh);
  const p75AcrossAllDays = percentile(allStorageNeeds, 75);
  const customerTypeDetected: 'home' | 'business' =
    totalImportKwh > 50000 || totalExportKwh > 30000 || p75AcrossAllDays > 40 || maxDailyExportKwh > 150
      ? 'business'
      : 'home';
  const usedCustomerType =
    resolvedConfig.customerType === 'auto' ? customerTypeDetected : resolvedConfig.customerType;
  const pvActiveDayThresholdKwh =
    usedCustomerType === 'business'
      ? resolvedConfig.businessActiveDayThresholdKwh
      : resolvedConfig.homeActiveDayThresholdKwh;

  const dailyRowsWithActivity = dailyRows.map((day) => ({
    ...day,
    isPvActiveDay: day.dailyExportKwh >= pvActiveDayThresholdKwh
  }));
  const activeDays = dailyRowsWithActivity.filter((day) => day.isPvActiveDay);
  const warnings: string[] = [];
  const selectedDays =
    activeDays.length >= resolvedConfig.minActiveDays
      ? activeDays
      : (() => {
          if (activeDays.length > 0 && activeDays.length < resolvedConfig.minActiveDays) {
            warnings.push('Er zijn weinig PV-actieve dagen gevonden. Het advies kan minder betrouwbaar zijn.');
          }
          return dailyRowsWithActivity;
        })();

  const selectedStorageNeeds = selectedDays.map((day) => day.dailyStorageNeedKwh);
  const p50StorageNeedKwh = round2(percentile(selectedStorageNeeds, 50));
  const p75StorageNeedKwh = round2(percentile(selectedStorageNeeds, 75));
  const p90StorageNeedKwh = round2(percentile(selectedStorageNeeds, 90));

  const rawConservativeKwh = round2(
    (p50StorageNeedKwh * resolvedConfig.conservativeSafetyFactor) / resolvedConfig.usableBatteryFraction
  );
  const rawRecommendedKwh = round2(
    (p75StorageNeedKwh * resolvedConfig.recommendedSafetyFactor) / resolvedConfig.usableBatteryFraction
  );
  const rawSpaciousKwh = round2(
    (p90StorageNeedKwh * resolvedConfig.spaciousSafetyFactor) / resolvedConfig.usableBatteryFraction
  );

  const capReason =
    usedCustomerType === 'home' && rawRecommendedKwh > resolvedConfig.maxHomeBatteryKwh
      ? `Advies begrensd op ${resolvedConfig.maxHomeBatteryKwh} kWh omdat dit een particuliere PV-zelfverbruikcase is.`
      : undefined;
  const cappedConservativeKwh =
    usedCustomerType === 'home' ? Math.min(rawConservativeKwh, resolvedConfig.maxHomeBatteryKwh) : rawConservativeKwh;
  const cappedRecommendedKwh =
    usedCustomerType === 'home' ? Math.min(rawRecommendedKwh, resolvedConfig.maxHomeBatteryKwh) : rawRecommendedKwh;
  const cappedSpaciousKwh =
    usedCustomerType === 'home' ? Math.min(rawSpaciousKwh, resolvedConfig.maxHomeBatteryKwh) : rawSpaciousKwh;

  const roundedOptions =
    usedCustomerType === 'home' ? resolvedConfig.availableHomeOptionsKwh : resolvedConfig.availableBusinessOptionsKwh;
  const roundedAdvice = {
    conservativeKwh: roundUpToAvailableOption(cappedConservativeKwh, roundedOptions),
    recommendedKwh: roundUpToAvailableOption(cappedRecommendedKwh, roundedOptions),
    spaciousKwh: roundUpToAvailableOption(cappedSpaciousKwh, roundedOptions)
  };

  const explanation = [
    'Het batterijadvies is berekend op basis van de dagelijkse hoeveelheid zonne-overschot die later op de dag of nacht nog nuttig gebruikt kan worden.',
    'Per dag is gekeken naar de kleinste waarde van de dagelijkse teruglevering en de avond/nacht-netafname.',
    'Vervolgens zijn P50, P75 en P90 gebruikt om respectievelijk een conservatief, aanbevolen en ruim advies te bepalen.',
    'Hierdoor wordt voorkomen dat extreme zomerdagen of seizoensopslag leiden tot een onrealistisch grote batterij.'
  ];

  return {
    customerTypeDetected,
    usedCustomerType,
    totals: {
      totalImportKwh: round2(totalImportKwh),
      totalExportKwh: round2(totalExportKwh),
      maxDailyExportKwh: round2(maxDailyExportKwh),
      numberOfDays: dailyRowsWithActivity.length,
      numberOfPvActiveDays: activeDays.length
    },
    percentiles: {
      p50StorageNeedKwh,
      p75StorageNeedKwh,
      p90StorageNeedKwh
    },
    rawAdvice: {
      conservativeKwh: rawConservativeKwh,
      recommendedKwh: rawRecommendedKwh,
      spaciousKwh: rawSpaciousKwh,
      rawRecommendedKwh,
      cappedRecommendedKwh: round2(cappedRecommendedKwh),
      capReason
    },
    roundedAdvice,
    dailyRows: dailyRowsWithActivity,
    warnings,
    explanation,
    configUsed: resolvedConfig
  };
}

function formatMonthLabel(dayIso: string): string {
  return dayIso.slice(0, 7);
}

function buildDistributionBuckets(customerType: 'home' | 'business'): Array<{ min: number; max: number | null; label: string }> {
  if (customerType === 'business') {
    return [
      { min: 0, max: 50, label: '0-50' },
      { min: 50, max: 100, label: '50-100' },
      { min: 100, max: 250, label: '100-250' },
      { min: 250, max: 500, label: '250-500' },
      { min: 500, max: 750, label: '500-750' },
      { min: 750, max: 1000, label: '750-1000' },
      { min: 1000, max: null, label: '1000+' }
    ];
  }

  return [
    { min: 0, max: 5, label: '0-5' },
    { min: 5, max: 10, label: '5-10' },
    { min: 10, max: 15, label: '10-15' },
    { min: 15, max: 20, label: '15-20' },
    { min: 20, max: 25, label: '20-25' },
    { min: 25, max: 30, label: '25-30' },
    { min: 30, max: 40, label: '30-40' },
    { min: 40, max: 50, label: '40-50' },
    { min: 50, max: null, label: '50+' }
  ];
}

export function buildPvAdviceChartsData(
  adviceResult: PvStorageFormulaAdviceResult,
  intervals: ProcessedInterval[]
): PvAdviceChartsData {
  const activeDays = adviceResult.dailyRows.filter((row) => row.isPvActiveDay);
  const daysForDistribution = activeDays.length > 0 ? activeDays : adviceResult.dailyRows;
  const capacityOptions =
    adviceResult.usedCustomerType === 'business'
      ? adviceResult.configUsed.availableBusinessOptionsKwh
      : adviceResult.configUsed.availableHomeOptionsKwh;

  const dailyStorageChart = adviceResult.dailyRows.map((row) => ({
    date: row.date,
    dailyStorageNeedKwh: round2(row.dailyStorageNeedKwh),
    p50: adviceResult.percentiles.p50StorageNeedKwh,
    p75: adviceResult.percentiles.p75StorageNeedKwh,
    p90: adviceResult.percentiles.p90StorageNeedKwh
  }));

  const distributionBuckets = buildDistributionBuckets(adviceResult.usedCustomerType);
  const storageDistributionChart = distributionBuckets.map((bucket) => ({
    bucket: bucket.label,
    count: daysForDistribution.filter((row) =>
      bucket.max == null
        ? row.dailyStorageNeedKwh >= bucket.min
        : row.dailyStorageNeedKwh >= bucket.min && row.dailyStorageNeedKwh < bucket.max
    ).length
  }));

  const exportVsNightImportChart = adviceResult.dailyRows.map((row) => ({
    date: row.date,
    dailyExportKwh: round2(row.dailyExportKwh),
    eveningNightImportKwh: round2(row.eveningNightImportKwh),
    dailyStorageNeedKwh: round2(row.dailyStorageNeedKwh)
  }));

  const adviceComparisonChart = [
    {
      label: 'Conservatief',
      capacityKwh: adviceResult.roundedAdvice.conservativeKwh
    },
    {
      label: 'Aanbevolen',
      capacityKwh: adviceResult.roundedAdvice.recommendedKwh,
      emphasis: true
    },
    {
      label: 'Ruim',
      capacityKwh: adviceResult.roundedAdvice.spaciousKwh
    }
  ];

  const marginalGainChart = capacityOptions.map((capacityKwh, index) => {
    const coveredStorageKwhPerYear = round2(
      daysForDistribution.reduce((sum, row) => sum + Math.min(row.dailyStorageNeedKwh, capacityKwh), 0)
    );
    const previous = index > 0 ? capacityOptions[index - 1] : null;
    const previousCovered =
      index > 0
        ? daysForDistribution.reduce((sum, row) => sum + Math.min(row.dailyStorageNeedKwh, previous ?? 0), 0)
        : 0;
    const marginalGainKwh = round2(coveredStorageKwhPerYear - previousCovered);
    const addedCapacityKwh = previous == null ? capacityKwh : capacityKwh - previous;

    return {
      capacityKwh,
      coveredStorageKwhPerYear,
      marginalGainKwh,
      marginalGainPerAddedKwh: addedCapacityKwh > 0 ? round2(marginalGainKwh / addedCapacityKwh) : 0
    };
  });

  const coverageByCapacityChart = capacityOptions.map((capacityKwh) => {
    const nonZeroDays = daysForDistribution.filter((row) => row.dailyStorageNeedKwh > 0);
    const fullyCoveredDays =
      nonZeroDays.length === 0
        ? 0
        : nonZeroDays.filter((row) => capacityKwh >= row.dailyStorageNeedKwh).length;
    const averageCoverageRaw =
      nonZeroDays.length === 0
        ? 0
        : nonZeroDays.reduce((sum, row) => sum + Math.min(capacityKwh / row.dailyStorageNeedKwh, 1), 0) /
          nonZeroDays.length;

    return {
      capacityKwh,
      fullyCoveredDaysPercentage:
        nonZeroDays.length === 0 ? 0 : round2((fullyCoveredDays / nonZeroDays.length) * 100),
      averageCoveragePercentage: round2(averageCoverageRaw * 100)
    };
  });

  const monthlyMap = new Map<string, { exportKwh: number; eveningNightImportKwh: number; usefulStorageKwh: number }>();
  adviceResult.dailyRows.forEach((row) => {
    const month = formatMonthLabel(row.date);
    const current = monthlyMap.get(month) ?? { exportKwh: 0, eveningNightImportKwh: 0, usefulStorageKwh: 0 };
    current.exportKwh += row.dailyExportKwh;
    current.eveningNightImportKwh += row.eveningNightImportKwh;
    current.usefulStorageKwh += row.dailyStorageNeedKwh;
    monthlyMap.set(month, current);
  });
  const monthlyStorageChart = Array.from(monthlyMap.entries())
    .map(([month, values]) => ({
      month,
      monthlyExportKwh: round2(values.exportKwh),
      monthlyEveningNightImportKwh: round2(values.eveningNightImportKwh),
      monthlyUsefulStorageNeedKwh: round2(values.usefulStorageKwh)
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const targetDay =
    activeDays.length === 0
      ? null
      : [...activeDays].sort(
          (a, b) =>
            Math.abs(a.dailyStorageNeedKwh - adviceResult.percentiles.p75StorageNeedKwh) -
              Math.abs(b.dailyStorageNeedKwh - adviceResult.percentiles.p75StorageNeedKwh) ||
            b.dailyExportKwh - a.dailyExportKwh
        )[0];
  const recommendedCapacityKwh = adviceResult.roundedAdvice.recommendedKwh;
  let batterySocKwh = 0;
  const exampleDayChart =
    targetDay == null
      ? []
      : intervals
          .filter((interval) => getLocalDayIso(interval.timestamp, 'Europe/Amsterdam') === targetDay.date)
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
          .map((interval) => {
            const flow = derivePvIntervalFlow(interval);
            const { hour, minute } = getLocalHourMinute(interval.timestamp, 'Europe/Amsterdam');
            const inEveningNight =
              isWithinClockWindow(
                hour,
                minute,
                adviceResult.configUsed.eveningNightStart1,
                adviceResult.configUsed.eveningNightEnd1
              ) ||
              isWithinClockWindow(
                hour,
                minute,
                adviceResult.configUsed.eveningNightStart2,
                adviceResult.configUsed.eveningNightEnd2
              );

            const chargeKwh = Math.min(flow.surplusKwh, Math.max(0, recommendedCapacityKwh - batterySocKwh));
            batterySocKwh += chargeKwh;

            let dischargeKwh = 0;
            if (inEveningNight) {
              dischargeKwh = Math.min(flow.loadDeficitKwh, batterySocKwh);
              batterySocKwh -= dischargeKwh;
            }

            return {
              timestamp: interval.timestamp,
              importKwh: round2(inEveningNight ? Math.max(0, flow.loadDeficitKwh - dischargeKwh) : flow.loadDeficitKwh),
              exportKwh: round2(Math.max(0, flow.surplusKwh - chargeKwh)),
              batterySocKwh: round2(batterySocKwh)
            };
          });

  return {
    dailyStorageChart,
    storageDistributionChart,
    exportVsNightImportChart,
    adviceComparisonChart,
    marginalGainChart,
    coverageByCapacityChart,
    monthlyStorageChart,
    exampleDayChart,
    warnings: adviceResult.warnings
  };
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

export function listPeakMoments(intervals: ProcessedInterval[]): PeakMoment[] {
  return intervals
    .filter((interval) => interval.excessKw > 0)
    .map((interval) => ({
      timestamp: interval.timestamp,
      consumptionKw: interval.consumptionKw,
      excessKw: interval.excessKw,
      excessKwh: interval.excessKwh
    }));
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

  const { recommendedProduct, alternativeProduct, noFeasibleBatteryByPower } = selectMinimumCostBatteryOptions(
    kWhNeeded,
    kWNeeded
  );

  return {
    kWhNeededRaw,
    kWNeededRaw,
    kWhNeeded,
    kWNeeded,
    recommendedProduct,
    alternativeProduct,
    noFeasibleBatteryByPower
  };
}

export function computePvSizing(params: {
  intervals: ProcessedInterval[];
  settings: PvSizingSettings;
}): SizingResult {
  const { intervals, settings } = params;
  const formulaAdvice = computePvStorageFormulaAdvice(intervals, {
    customerType: settings.customerType ?? 'auto'
  });
  const recommendedProduct = buildAdviceProduct(
    formulaAdvice.roundedAdvice.recommendedKwh,
    formulaAdvice.usedCustomerType,
    'Aanbevolen'
  );
  const alternativeProduct = buildAdviceProduct(
    formulaAdvice.roundedAdvice.spaciousKwh,
    formulaAdvice.usedCustomerType,
    'Ruim'
  );
  const maxExportKw = Math.max(0, ...intervals.map((interval) => derivePvIntervalFlow(interval).surplusKwh / 0.25));

  return {
    kWhNeededRaw: formulaAdvice.rawAdvice.rawRecommendedKwh,
    kWNeededRaw: round2(maxExportKw),
    kWhNeeded: formulaAdvice.roundedAdvice.recommendedKwh,
    kWNeeded: recommendedProduct.powerKw,
    recommendedProduct,
    alternativeProduct,
    noFeasibleBatteryByPower: false,
    pvFormulaAdvice: formulaAdvice
  };
}

export function computePvSizingFromScenarioResults(
  intervals: ProcessedInterval[],
  scenarios: ScenarioResult[],
  settings: PvSizingSettings
): SizingResult {
  void scenarios;
  return computePvSizing({ intervals, settings });
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
