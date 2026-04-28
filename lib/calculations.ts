import { getLocalDayIso, getLocalHourMinute, parseTimestamp } from './datetime';
import type { PriceInterval, PricingMode, PricingStats, PriceSource } from './pricing';
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
  importPriceEurPerKwh?: number;
  exportPriceEurPerKwh?: number;
  feedInCostEurPerKwh?: number;
  fixedEnergyTaxEurPerKwh?: number;
  priceSource?: PriceSource;
  pricingIndicative?: boolean;
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
  pvSelfConsumptionAdvice?: PvSelfConsumptionAdviceResult | null;
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

export interface PvBatteryConfig {
  capacityKwh: number;
  usableFraction: number;
  chargePowerKw: number;
  dischargePowerKw: number;
  roundTripEfficiency: number;
}

export interface PvSimulationConfig {
  intervalMinutesFallback: number;
  startSocFraction: number;
  minSocFraction: number;
  maxSocFraction: number;
  resetSocDaily: boolean;
  allowCarryOver: boolean;
}

export interface PvEconomicsConfig {
  importPriceEurPerKwh: number;
  exportCompensationEurPerKwh: number;
  feedInCostEurPerKwh?: number;
  fixedEnergyTaxEurPerKwh?: number;
  batteryPrices?: Record<number, number>;
  installationCostEur?: number;
  yearlyMaintenanceEur?: number;
  pricingMode?: PricingMode;
  fallbackToAveragePrices?: boolean;
  priceIntervals?: PriceInterval[];
  pricingStats?: PricingStats;
}

export interface PvBatterySimulationResult {
  optionLabel: string;
  capacityKwh: number;
  usableCapacityKwh: number;
  chargePowerKw: number;
  dischargePowerKw: number;
  importBeforeKwh: number;
  importAfterKwh: number;
  exportBeforeKwh: number;
  exportAfterKwh: number;
  gridImportReductionKwh: number;
  exportReductionKwh: number;
  chargedFromPvKwh: number;
  dischargedToLoadKwh: number;
  selfConsumptionIncreaseKwh: number;
  selfConsumptionRatioBefore: number | null;
  selfConsumptionRatioAfter: number | null;
  cyclesPerYear: number;
  equivalentFullCycles: number;
  fullBatteryEvents: number;
  emptyBatteryEvents: number;
  unusedPvBecauseBatteryFullKwh: number;
  unusedPvBecausePowerLimitKwh: number;
  averageSocKwh: number;
  maxSocKwh: number;
  endingSocKwh: number;
  chargedFromPvKwhAnnualized: number;
  dischargedToLoadKwhAnnualized: number;
  importReductionKwhAnnualized: number;
  exportReductionKwhAnnualized: number;
  remainingExportKwhAnnualized: number;
  baselineEnergyCostEur?: number;
  batteryEnergyCostEur?: number;
  dynamicValueEur?: number;
  yearlyCostsEur?: number;
  netAnnualSavingsEur?: number;
  annualValueEur?: number;
  paybackYears?: number;
  paybackIndicative?: boolean;
  pricingStats?: PricingStats;
  valueByInterval?: Array<{
    ts: string;
    importPriceEurPerKwh: number;
    exportPriceEurPerKwh: number;
    feedInCostEurPerKwh: number;
    importBeforeKwh: number;
    importAfterKwh: number;
    exportBeforeKwh: number;
    exportAfterKwh: number;
    baselineCostEur: number;
    batteryCostEur: number;
    intervalValueEur: number;
    priceSource: string;
  }>;
  marginalGainKwh?: number;
  marginalGainPerAddedKwh?: number;
  isEligible: boolean;
  excludedReason?: string;
  recommendationReason?: string;
  socSeries?: Array<{ timestamp: string; socKwh: number }>;
}

export interface PvSelfConsumptionAdviceConfig {
  formula?: Partial<PvStorageFormulaAdviceConfig>;
  customerType?: 'auto' | 'home' | 'business';
  maxHomeBatteryKwh?: number;
  allowHome64AsSpacious?: boolean;
  usableFraction?: number;
  roundTripEfficiency?: number;
  resetSocDailyForHome?: boolean;
  allowCarryOverForBusiness?: boolean;
  minCyclesPerYearHome?: number;
  minCyclesPerYearBusiness?: number;
  minMarginalGainPerAddedKwhHome?: number;
  minMarginalGainPerAddedKwhBusiness?: number;
  economics?: Partial<PvEconomicsConfig>;
}

export interface PvSelfConsumptionAdviceResult {
  customerTypeDetected: 'home' | 'business';
  usedCustomerType: 'home' | 'business';
  formulaAdvice: {
    p50StorageNeedKwh: number;
    p75StorageNeedKwh: number;
    p90StorageNeedKwh: number;
    conservativeFormulaKwh: number;
    recommendedFormulaKwh: number;
    spaciousFormulaKwh: number;
  };
  simulationAdvice: {
    conservative: PvBatterySimulationResult;
    recommended: PvBatterySimulationResult;
    spacious: PvBatterySimulationResult;
    allScenarios: PvBatterySimulationResult[];
  };
  totals: {
    numberOfIntervals: number;
    numberOfDays: number;
    numberOfPvActiveDays: number;
    totalImportKwh: number;
    totalExportKwh: number;
    maxDailyExportKwh: number;
  };
  configUsed: {
    usableFraction: number;
    roundTripEfficiency: number;
    resetSocDaily: boolean;
    pricingMode?: PricingMode;
    fallbackToAveragePrices?: boolean;
    pricingStats?: PricingStats;
    importPriceEurPerKwh?: number;
    exportCompensationEurPerKwh?: number;
    feedInCostEurPerKwh?: number;
    fixedEnergyTaxEurPerKwh?: number;
  };
  warnings: string[];
  explanation: string[];
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
    importPriceEurPerKwh?: number;
    exportPriceEurPerKwh?: number;
  }>;
  annualValueByCapacityChart: Array<{
    capacityKwh: number;
    annualValueEur: number;
  }>;
  importExportCostChart: Array<{
    label: string;
    costEur: number;
  }>;
  monthlyValueChart: Array<{
    month: string;
    baselineCostEur: number;
    batteryCostEur: number;
    valueEur: number;
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
  unitPriceEur?: number;
  totalPriceEur?: number;
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
    label: 'ES232_115K-A 232 kWh',
    capacityKwh: 232,
    powerKw: 115,
    modular: true
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
  totalPriceEur?: number;
  overCapacityKwh: number;
  overPowerKw: number;
  count: number;
  unitCapacityKwh: number;
  unitPowerKw: number;
  unitPriceEur?: number;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function toBatteryProduct(candidate: BatteryConfigurationCandidate): BatteryProduct {
  const totalPriceEur = candidate.totalPriceEur == null ? undefined : roundCurrency(candidate.totalPriceEur);
  return {
    label: candidate.label,
    capacityKwh: candidate.totalCapacityKwh,
    powerKw: candidate.totalPowerKw,
    unitCapacityKwh: candidate.unitCapacityKwh,
    unitPowerKw: candidate.unitPowerKw,
    count: candidate.count,
    unitPriceEur: candidate.unitPriceEur == null ? undefined : roundCurrency(candidate.unitPriceEur),
    totalPriceEur: candidate.totalPriceEur == null ? undefined : totalPriceEur,
    breakdown: [
      {
        type: `${candidate.unitCapacityKwh} kWh`,
        count: candidate.count,
        unitCapacityKwh: candidate.unitCapacityKwh,
        unitPriceEur: candidate.unitPriceEur == null ? undefined : roundCurrency(candidate.unitPriceEur),
        totalPriceEur: candidate.totalPriceEur == null ? undefined : totalPriceEur
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
    const unitPriceEur = option.unitPriceEur;
    if (option.modular) {
      const minCountByKwh = Math.ceil(normalizedRequiredKwh / option.capacityKwh);
      const minCountByKw = Math.ceil(normalizedRequiredKw / option.powerKw);
      const requiredCount = Math.max(1, minCountByKwh, minCountByKw);
      const maxCount = requiredCount;
      for (let count = 1; count <= maxCount; count += 1) {
        const totalCapacityKwh = count * option.capacityKwh;
        const totalPowerKw = count * option.powerKw;
        if (totalCapacityKwh < normalizedRequiredKwh || totalPowerKw < normalizedRequiredKw) continue;
        const totalPriceEur = unitPriceEur == null ? undefined : count * unitPriceEur;
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
      (a.totalPriceEur == null ? 1 : 0) - (b.totalPriceEur == null ? 1 : 0) ||
      (a.totalPriceEur ?? 0) - (b.totalPriceEur ?? 0) ||
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
  availableBusinessOptionsKwh: [
    64,
    96,
    232,
    261,
    464,
    522,
    696,
    783,
    928,
    1044,
    1160,
    1305,
    1392,
    1566,
    1624,
    1827,
    1856,
    2090,
    5015
  ]
};

const DEFAULT_PV_ECONOMICS_CONFIG: PvEconomicsConfig = {
  importPriceEurPerKwh: 0.3,
  exportCompensationEurPerKwh: 0.05,
  feedInCostEurPerKwh: 0,
  fixedEnergyTaxEurPerKwh: 0,
  yearlyMaintenanceEur: 0,
  pricingMode: 'average',
  fallbackToAveragePrices: true
};

const DEFAULT_PV_SELF_CONSUMPTION_CONFIG: Required<
  Omit<PvSelfConsumptionAdviceConfig, 'formula' | 'economics' | 'customerType'>
> = {
  maxHomeBatteryKwh: 40,
  allowHome64AsSpacious: true,
  usableFraction: 0.9,
  roundTripEfficiency: 0.9,
  resetSocDailyForHome: true,
  allowCarryOverForBusiness: true,
  minCyclesPerYearHome: 80,
  minCyclesPerYearBusiness: 20,
  minMarginalGainPerAddedKwhHome: 30,
  minMarginalGainPerAddedKwhBusiness: 10
};

const HOME_PV_POWER_MAP: Record<number, number> = {
  5: 3,
  10: 5,
  15: 7.5,
  20: 10,
  25: 10,
  30: 12.5,
  40: 15,
  64: 32
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampNonNegative(value: number | undefined | null): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value ?? 0);
}

function normalizeAnnual(value: number, numberOfDays: number): number {
  if (!Number.isFinite(value) || numberOfDays <= 0) return 0;
  return value * (365 / numberOfDays);
}

function deriveIntervalMinutes(intervals: ProcessedInterval[], fallback = 15): number {
  for (let index = 1; index < intervals.length; index += 1) {
    const previous = parseTimestamp(intervals[index - 1].timestamp);
    const current = parseTimestamp(intervals[index].timestamp);
    const diffMinutes = (current.getTime() - previous.getTime()) / 60000;
    if (Number.isFinite(diffMinutes) && diffMinutes > 0) {
      return diffMinutes;
    }
  }
  return fallback;
}

function createBatteryConfig(capacityKwh: number, usableFraction: number, roundTripEfficiency: number): PvBatteryConfig {
  const baseSpec = getBatterySpecForCapacity(capacityKwh);
  const mappedPowerKw = HOME_PV_POWER_MAP[capacityKwh];
  const chargePowerKw = mappedPowerKw ?? baseSpec.maxChargeKw;
  const dischargePowerKw = mappedPowerKw ?? baseSpec.maxDischargeKw;

  return {
    capacityKwh,
    usableFraction,
    chargePowerKw,
    dischargePowerKw,
    roundTripEfficiency
  };
}

function generatePvBatteryScenarioOptions(
  customerType: 'home' | 'business',
  formulaAdvice: PvStorageFormulaAdviceResult,
  config: PvSelfConsumptionAdviceConfig
): number[] {
  if (customerType === 'business') {
    return [...formulaAdvice.configUsed.availableBusinessOptionsKwh];
  }

  const homeOptions = [...formulaAdvice.configUsed.availableHomeOptionsKwh].filter(
    (option) => option <= (config.maxHomeBatteryKwh ?? DEFAULT_PV_SELF_CONSUMPTION_CONFIG.maxHomeBatteryKwh)
  );
  if (config.allowHome64AsSpacious ?? DEFAULT_PV_SELF_CONSUMPTION_CONFIG.allowHome64AsSpacious) {
    return [...homeOptions, 64];
  }
  return homeOptions;
}

export function toScenarioResult(simulation: PvBatterySimulationResult): ScenarioResult {
  return {
    optionLabel: simulation.optionLabel,
    capacityKwh: simulation.capacityKwh,
    usableCapacityKwh: simulation.usableCapacityKwh,
    pvAnalysisMode: simulation.selfConsumptionRatioAfter == null ? 'EXPORT_ONLY' : 'FULL_PV',
    pvStrategy: 'SELF_CONSUMPTION_ONLY',
    exceedanceIntervalsBefore: 0,
    exceedanceIntervalsAfter: 0,
    exceedanceEnergyKwhBefore: simulation.exportBeforeKwh,
    exceedanceEnergyKwhAfter: simulation.exportAfterKwh,
    achievedComplianceDataset:
      simulation.exportBeforeKwh > 0 ? simulation.exportReductionKwh / simulation.exportBeforeKwh : 0,
    achievedComplianceDailyAverage:
      simulation.exportBeforeKwh > 0 ? simulation.exportReductionKwh / simulation.exportBeforeKwh : 0,
    achievedCompliance: simulation.exportBeforeKwh > 0 ? simulation.exportReductionKwh / simulation.exportBeforeKwh : 0,
    maxRemainingExcessKw: 0,
    maxChargeKw: simulation.chargePowerKw,
    maxDischargeKw: simulation.dischargePowerKw,
    endingSocKwh: simulation.endingSocKwh,
    shavedSeries: [],
    importedEnergyBeforeKwh: simulation.importBeforeKwh,
    importedEnergyAfterKwh: simulation.importAfterKwh,
    exportedEnergyBeforeKwh: simulation.exportBeforeKwh,
    exportedEnergyAfterKwh: simulation.exportAfterKwh,
    capturedExportEnergyKwh: simulation.chargedFromPvKwh,
    storedPvUsedOnsiteKwh: simulation.dischargedToLoadKwh,
    totalUsefulDischargedEnergyKwh: simulation.dischargedToLoadKwh,
    importReductionKwh: simulation.gridImportReductionKwh,
    exportReduction:
      simulation.exportBeforeKwh > 0 ? simulation.exportReductionKwh / simulation.exportBeforeKwh : 0,
    totalEconomicValueEur: simulation.annualValueEur ?? null,
    peakSocKwh: simulation.maxSocKwh,
    socSeries: simulation.socSeries,
    cyclesPerYear: simulation.cyclesPerYear,
    marginalGainPerAddedKwh: simulation.marginalGainPerAddedKwh,
    importReductionKwhAnnualized: simulation.importReductionKwhAnnualized,
    exportReductionKwhAnnualized: simulation.exportReductionKwhAnnualized,
    remainingExportKwhAnnualized: simulation.remainingExportKwhAnnualized,
    chargedKwhAnnualized: simulation.chargedFromPvKwhAnnualized,
    dischargedKwhAnnualized: simulation.dischargedToLoadKwhAnnualized,
    annualValueEur: simulation.annualValueEur,
    paybackYears: simulation.paybackYears,
    yearlyCostsEur: simulation.yearlyCostsEur,
    netAnnualSavingsEur: simulation.netAnnualSavingsEur,
    paybackIndicative: simulation.paybackIndicative,
    baselineEnergyCostEur: simulation.baselineEnergyCostEur,
    batteryEnergyCostEur: simulation.batteryEnergyCostEur,
    dynamicValueEur: simulation.dynamicValueEur,
    scenarioScore: undefined,
    isEligible: simulation.isEligible,
    excludedReason: simulation.excludedReason,
    recommendationReason: simulation.recommendationReason
  };
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

  const modularBase = BATTERY_OPTIONS.find(
    (candidate) => candidate.modular && capacityKwh % candidate.capacityKwh === 0
  );
  if (modularBase) {
    const count = capacityKwh / modularBase.capacityKwh;
    const spec = getBatterySpecForCapacity(capacityKwh);
    return {
      label: `${labelPrefix}: ${count}x ${modularBase.capacityKwh} kWh (modulair)`,
      capacityKwh,
      powerKw: spec.maxDischargeKw,
      modular: true,
      unitCapacityKwh: modularBase.capacityKwh,
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

export function simulatePvBatteryScenario(
  intervals: ProcessedInterval[],
  batteryConfig: PvBatteryConfig,
  simulationConfig: PvSimulationConfig,
  economicsConfig?: PvEconomicsConfig
): PvBatterySimulationResult {
  const intervalMinutes = deriveIntervalMinutes(intervals, simulationConfig.intervalMinutesFallback);
  const intervalHours = intervalMinutes / 60;
  const chargeEfficiency = Math.sqrt(batteryConfig.roundTripEfficiency);
  const dischargeEfficiency = Math.sqrt(batteryConfig.roundTripEfficiency);
  const usableCapacityKwh = batteryConfig.capacityKwh * batteryConfig.usableFraction;
  const numberOfDays = new Set(intervals.map((interval) => getLocalDayIso(interval.timestamp, 'Europe/Amsterdam'))).size || 1;
  const startSocKwh = usableCapacityKwh * simulationConfig.startSocFraction;
  const minSocKwh = usableCapacityKwh * simulationConfig.minSocFraction;
  const maxSocKwh = usableCapacityKwh * simulationConfig.maxSocFraction;
  const maxChargeKwhThisInterval = batteryConfig.chargePowerKw * intervalHours;
  const maxDischargeKwhThisInterval = batteryConfig.dischargePowerKw * intervalHours;

  let socKwh = Math.min(maxSocKwh, Math.max(minSocKwh, startSocKwh));
  let currentDay: string | null = null;
  let importBeforeKwh = 0;
  let importAfterKwh = 0;
  let exportBeforeKwh = 0;
  let exportAfterKwh = 0;
  let chargedFromPvKwh = 0;
  let dischargedToLoadKwh = 0;
  let fullBatteryEvents = 0;
  let emptyBatteryEvents = 0;
  let unusedPvBecauseBatteryFullKwh = 0;
  let unusedPvBecausePowerLimitKwh = 0;
  let socTotalKwh = 0;
  let maxSocObservedKwh = socKwh;
  let totalPvKwh: number | null = 0;
  let directSelfConsumptionBeforeKwh = 0;
  const socSeries: Array<{ timestamp: string; socKwh: number }> = [];
  const valueByInterval: NonNullable<PvBatterySimulationResult['valueByInterval']> = [];
  let baselineEnergyCostEur = 0;
  let batteryEnergyCostEur = 0;

  for (const interval of intervals) {
    const day = getLocalDayIso(interval.timestamp, 'Europe/Amsterdam');
    if (currentDay !== null && day !== currentDay && simulationConfig.resetSocDaily) {
      socKwh = simulationConfig.allowCarryOver ? socKwh : startSocKwh;
    }
    currentDay = day;

    const flow = derivePvIntervalFlow(interval);
    const importKwh = clampNonNegative(flow.loadDeficitKwh);
    const exportKwh = clampNonNegative(flow.surplusKwh);
    const pvKwh = typeof interval.pvKwh === 'number' ? clampNonNegative(interval.pvKwh) : null;

    importBeforeKwh += importKwh;
    exportBeforeKwh += exportKwh;
    if (pvKwh != null) {
      totalPvKwh = (totalPvKwh ?? 0) + pvKwh;
      directSelfConsumptionBeforeKwh += clampNonNegative(flow.directSelfConsumptionKwh);
    } else {
      totalPvKwh = null;
    }

    let remainingExportKwh = exportKwh;
    let remainingImportKwh = importKwh;

    if (exportKwh > 0) {
      const availableSpaceKwh = Math.max(0, maxSocKwh - socKwh);
      const powerLimitedChargeKwh = Math.min(exportKwh, maxChargeKwhThisInterval);
      const possibleChargeFromPvKwh = Math.min(
        powerLimitedChargeKwh,
        chargeEfficiency > 0 ? availableSpaceKwh / chargeEfficiency : 0
      );
      const socIncreaseKwh = possibleChargeFromPvKwh * chargeEfficiency;
      socKwh = Math.min(maxSocKwh, socKwh + socIncreaseKwh);
      chargedFromPvKwh += possibleChargeFromPvKwh;
      remainingExportKwh = Math.max(0, exportKwh - possibleChargeFromPvKwh);
      unusedPvBecausePowerLimitKwh += Math.max(0, exportKwh - powerLimitedChargeKwh);
      unusedPvBecauseBatteryFullKwh += Math.max(0, powerLimitedChargeKwh - possibleChargeFromPvKwh);
      if (availableSpaceKwh <= 1e-6 || maxSocKwh - socKwh <= 1e-6) {
        fullBatteryEvents += 1;
      }
    }

    if (importKwh > 0) {
      const deliverableFromSocKwh = Math.max(0, socKwh - minSocKwh) * dischargeEfficiency;
      const possibleDischargeToLoadKwh = Math.min(importKwh, maxDischargeKwhThisInterval, deliverableFromSocKwh);
      const socDecreaseKwh = dischargeEfficiency > 0 ? possibleDischargeToLoadKwh / dischargeEfficiency : 0;
      socKwh = Math.max(minSocKwh, socKwh - socDecreaseKwh);
      dischargedToLoadKwh += possibleDischargeToLoadKwh;
      remainingImportKwh = Math.max(0, importKwh - possibleDischargeToLoadKwh);
      if (deliverableFromSocKwh <= 1e-6 || socKwh <= minSocKwh + 1e-6) {
        emptyBatteryEvents += 1;
      }
    }

    importAfterKwh += remainingImportKwh;
    exportAfterKwh += remainingExportKwh;
    socTotalKwh += socKwh;
    maxSocObservedKwh = Math.max(maxSocObservedKwh, socKwh);
    socSeries.push({ timestamp: interval.timestamp, socKwh: round2(socKwh) });

    const importPriceEurPerKwh = interval.importPriceEurPerKwh ?? economicsConfig?.importPriceEurPerKwh ?? 0;
    const exportPriceEurPerKwh = interval.exportPriceEurPerKwh ?? economicsConfig?.exportCompensationEurPerKwh ?? 0;
    const feedInCostEurPerKwh = interval.feedInCostEurPerKwh ?? economicsConfig?.feedInCostEurPerKwh ?? 0;
    const fixedEnergyTaxEurPerKwh = interval.fixedEnergyTaxEurPerKwh ?? economicsConfig?.fixedEnergyTaxEurPerKwh ?? 0;
    const baselineCostForInterval =
      importKwh * (importPriceEurPerKwh + fixedEnergyTaxEurPerKwh) -
      exportKwh * exportPriceEurPerKwh +
      exportKwh * feedInCostEurPerKwh;
    const batteryCostForInterval =
      remainingImportKwh * (importPriceEurPerKwh + fixedEnergyTaxEurPerKwh) -
      remainingExportKwh * exportPriceEurPerKwh +
      remainingExportKwh * feedInCostEurPerKwh;
    const intervalValueEur = baselineCostForInterval - batteryCostForInterval;
    baselineEnergyCostEur += baselineCostForInterval;
    batteryEnergyCostEur += batteryCostForInterval;
    valueByInterval.push({
      ts: interval.timestamp,
      importPriceEurPerKwh: round2(importPriceEurPerKwh),
      exportPriceEurPerKwh: round2(exportPriceEurPerKwh),
      feedInCostEurPerKwh: round2(feedInCostEurPerKwh),
      importBeforeKwh: round2(importKwh),
      importAfterKwh: round2(remainingImportKwh),
      exportBeforeKwh: round2(exportKwh),
      exportAfterKwh: round2(remainingExportKwh),
      baselineCostEur: round2(baselineCostForInterval),
      batteryCostEur: round2(batteryCostForInterval),
      intervalValueEur: round2(intervalValueEur),
      priceSource: interval.priceSource ?? 'missing'
    });
  }

  const gridImportReductionKwh = Math.max(0, importBeforeKwh - importAfterKwh);
  const exportReductionKwh = Math.max(0, exportBeforeKwh - exportAfterKwh);
  const equivalentFullCycles = usableCapacityKwh > 0 ? dischargedToLoadKwh / usableCapacityKwh : 0;
  const cyclesPerYear = normalizeAnnual(equivalentFullCycles, numberOfDays);
  const grossSavingsEur = gridImportReductionKwh * (economicsConfig?.importPriceEurPerKwh ?? 0);
  const lostExportRevenueEur =
    exportReductionKwh * ((economicsConfig?.exportCompensationEurPerKwh ?? 0) - (economicsConfig?.feedInCostEurPerKwh ?? 0));
  const dynamicValueEur = baselineEnergyCostEur - batteryEnergyCostEur;
  const grossAnnualSavingsEur =
    economicsConfig?.pricingMode === 'dynamic'
      ? dynamicValueEur
      : grossSavingsEur - lostExportRevenueEur;
  const yearlyCostsEur = economicsConfig?.yearlyMaintenanceEur ?? 0;
  const annualValueEur = grossAnnualSavingsEur - yearlyCostsEur;
  const batteryCostEur =
    (economicsConfig?.batteryPrices?.[batteryConfig.capacityKwh] ?? 0) + (economicsConfig?.installationCostEur ?? 0);
  const paybackYears =
      batteryCostEur > 0 && annualValueEur > 0 ? batteryCostEur / annualValueEur : undefined;
  const selfConsumptionIncreaseKwh = gridImportReductionKwh;

  return {
    optionLabel: `${batteryConfig.capacityKwh} kWh / ${round2(batteryConfig.dischargePowerKw)} kW`,
    capacityKwh: batteryConfig.capacityKwh,
    usableCapacityKwh: round2(usableCapacityKwh),
    chargePowerKw: round2(batteryConfig.chargePowerKw),
    dischargePowerKw: round2(batteryConfig.dischargePowerKw),
    importBeforeKwh: round2(importBeforeKwh),
    importAfterKwh: round2(importAfterKwh),
    exportBeforeKwh: round2(exportBeforeKwh),
    exportAfterKwh: round2(exportAfterKwh),
    gridImportReductionKwh: round2(gridImportReductionKwh),
    exportReductionKwh: round2(exportReductionKwh),
    chargedFromPvKwh: round2(chargedFromPvKwh),
    dischargedToLoadKwh: round2(dischargedToLoadKwh),
    selfConsumptionIncreaseKwh: round2(selfConsumptionIncreaseKwh),
    selfConsumptionRatioBefore:
      totalPvKwh != null && totalPvKwh > 0 ? round2(directSelfConsumptionBeforeKwh / totalPvKwh) : null,
    selfConsumptionRatioAfter:
      totalPvKwh != null && totalPvKwh > 0
        ? round2((directSelfConsumptionBeforeKwh + dischargedToLoadKwh) / totalPvKwh)
        : null,
    cyclesPerYear: round2(cyclesPerYear),
    equivalentFullCycles: round2(equivalentFullCycles),
    fullBatteryEvents,
    emptyBatteryEvents,
    unusedPvBecauseBatteryFullKwh: round2(unusedPvBecauseBatteryFullKwh),
    unusedPvBecausePowerLimitKwh: round2(unusedPvBecausePowerLimitKwh),
    averageSocKwh: round2(socTotalKwh / Math.max(1, intervals.length)),
    maxSocKwh: round2(maxSocObservedKwh),
    endingSocKwh: round2(socKwh),
    chargedFromPvKwhAnnualized: round2(normalizeAnnual(chargedFromPvKwh, numberOfDays)),
    dischargedToLoadKwhAnnualized: round2(normalizeAnnual(dischargedToLoadKwh, numberOfDays)),
    importReductionKwhAnnualized: round2(normalizeAnnual(gridImportReductionKwh, numberOfDays)),
    exportReductionKwhAnnualized: round2(normalizeAnnual(exportReductionKwh, numberOfDays)),
    remainingExportKwhAnnualized: round2(normalizeAnnual(exportAfterKwh, numberOfDays)),
    baselineEnergyCostEur: round2(baselineEnergyCostEur),
    batteryEnergyCostEur: round2(batteryEnergyCostEur),
    dynamicValueEur: round2(dynamicValueEur),
    yearlyCostsEur: round2(yearlyCostsEur),
    netAnnualSavingsEur: round2(annualValueEur),
    annualValueEur: round2(annualValueEur),
    paybackYears: paybackYears == null ? undefined : round2(paybackYears),
    paybackIndicative:
      intervals.some((interval) => interval.pricingIndicative) ||
      (economicsConfig?.pricingStats?.missingPrices ?? 0) > 0 ||
      (economicsConfig?.pricingStats?.fallbackMatches ?? 0) > 0,
    pricingStats: economicsConfig?.pricingStats,
    valueByInterval,
    isEligible: true,
    socSeries
  };
}

export function computePvSelfConsumptionAdvice(
  intervals: ProcessedInterval[],
  config: PvSelfConsumptionAdviceConfig = {}
): PvSelfConsumptionAdviceResult {
  const formulaAdvice = computePvStorageFormulaAdvice(intervals, {
    ...config.formula,
    customerType: config.customerType ?? config.formula?.customerType ?? 'auto',
    maxHomeBatteryKwh: config.maxHomeBatteryKwh ?? DEFAULT_PV_SELF_CONSUMPTION_CONFIG.maxHomeBatteryKwh
  });
  const customerTypeDetected = formulaAdvice.customerTypeDetected;
  const usedCustomerType = formulaAdvice.usedCustomerType;
  const economicsEnabled = config.economics != null;
  const resolvedEconomics: PvEconomicsConfig = economicsEnabled
    ? {
        ...DEFAULT_PV_ECONOMICS_CONFIG,
        ...config.economics
      }
    : {
        ...DEFAULT_PV_ECONOMICS_CONFIG,
        importPriceEurPerKwh: 0,
        exportCompensationEurPerKwh: 0,
        feedInCostEurPerKwh: 0,
        yearlyMaintenanceEur: 0,
        pricingMode: 'average'
      };
  const resolvedHybridConfig = {
    ...DEFAULT_PV_SELF_CONSUMPTION_CONFIG,
    ...config
  };
  const scenarioOptions = generatePvBatteryScenarioOptions(usedCustomerType, formulaAdvice, resolvedHybridConfig);
  const simulationConfig: PvSimulationConfig = {
    intervalMinutesFallback: 15,
    startSocFraction: 0,
    minSocFraction: 0,
    maxSocFraction: 1,
    resetSocDaily:
      usedCustomerType === 'home'
        ? resolvedHybridConfig.resetSocDailyForHome
        : !resolvedHybridConfig.allowCarryOverForBusiness,
    allowCarryOver: usedCustomerType === 'business' && resolvedHybridConfig.allowCarryOverForBusiness
  };

  const allScenarios = scenarioOptions
    .map((capacityKwh) =>
      simulatePvBatteryScenario(
        intervals,
        createBatteryConfig(
          capacityKwh,
          resolvedHybridConfig.usableFraction,
          resolvedHybridConfig.roundTripEfficiency
        ),
        simulationConfig,
        resolvedEconomics
      )
    )
    .sort((a, b) => a.capacityKwh - b.capacityKwh);

  const formulaReferenceCapacity = formulaAdvice.roundedAdvice.recommendedKwh;
  const formulaReferenceScenario =
    allScenarios.find((scenario) => scenario.capacityKwh >= formulaReferenceCapacity) ??
    allScenarios[allScenarios.length - 1];
  const targetImportReductionAnnualized = formulaReferenceScenario?.importReductionKwhAnnualized ?? 0;
  const minCyclesPerYear =
    usedCustomerType === 'business'
      ? resolvedHybridConfig.minCyclesPerYearBusiness
      : resolvedHybridConfig.minCyclesPerYearHome;
  const minMarginalGain =
    usedCustomerType === 'business'
      ? resolvedHybridConfig.minMarginalGainPerAddedKwhBusiness
      : resolvedHybridConfig.minMarginalGainPerAddedKwhHome;

  const maxImportReduction = Math.max(0, ...allScenarios.map((scenario) => scenario.importReductionKwhAnnualized));
  const maxCycles = Math.max(0, ...allScenarios.map((scenario) => scenario.cyclesPerYear));
  const maxMarginal = Math.max(
    0,
    ...allScenarios.map((scenario, index) => {
      if (index === 0) return 0;
      const previous = allScenarios[index - 1];
      return (scenario.importReductionKwhAnnualized - previous.importReductionKwhAnnualized) / (scenario.capacityKwh - previous.capacityKwh);
    })
  );
  allScenarios.forEach((scenario, index) => {
    const previous = index > 0 ? allScenarios[index - 1] : undefined;
    if (previous) {
      const marginalGainKwh = scenario.importReductionKwhAnnualized - previous.importReductionKwhAnnualized;
      const addedCapacityKwh = scenario.capacityKwh - previous.capacityKwh;
      scenario.marginalGainKwh = round2(marginalGainKwh);
      scenario.marginalGainPerAddedKwh = addedCapacityKwh > 0 ? round2(marginalGainKwh / addedCapacityKwh) : 0;
    } else {
      scenario.marginalGainKwh = round2(scenario.importReductionKwhAnnualized);
      scenario.marginalGainPerAddedKwh =
        scenario.capacityKwh > 0 ? round2(scenario.importReductionKwhAnnualized / scenario.capacityKwh) : 0;
    }

    const excludedReasons: string[] = [];
    if (usedCustomerType === 'home' && scenario.capacityKwh > resolvedHybridConfig.maxHomeBatteryKwh && scenario.capacityKwh !== 64) {
      excludedReasons.push('Boven maximale thuisbatterijcapaciteit');
    }
    if (usedCustomerType === 'home' && scenario.capacityKwh >= 2090) {
      excludedReasons.push('Industriële batterij niet toegestaan in thuisadvies');
    }
    if (scenario.cyclesPerYear < minCyclesPerYear) {
      excludedReasons.push('Te weinig cycli per jaar');
    }
    if ((scenario.marginalGainPerAddedKwh ?? 0) < minMarginalGain && index > 0) {
      excludedReasons.push('Marginale meeropbrengst te laag');
    }
    if (usedCustomerType === 'business' && scenario.capacityKwh === 5015 && (formulaAdvice.rawAdvice.recommendedKwh <= 2090)) {
      excludedReasons.push('5015 kWh niet logisch zolang behoefte onder 2090 kWh blijft');
    }
    if (usedCustomerType === 'home' && scenario.capacityKwh === 64) {
      excludedReasons.push('64 kWh alleen als zeer ruime thuisoptie');
    }

    scenario.isEligible = excludedReasons.length === 0;
    scenario.excludedReason = excludedReasons[0];
  });

  const eligibleScenarios = allScenarios.filter((scenario) => scenario.isEligible);
  const fallbackScenario = eligibleScenarios[0] ?? allScenarios[0];
  const conservativeScenario =
    eligibleScenarios.find(
      (scenario) => scenario.importReductionKwhAnnualized >= targetImportReductionAnnualized * 0.7
    ) ?? fallbackScenario;

  const recommendedScenario =
    eligibleScenarios
      .map((scenario) => {
        const normalizedImportReduction = maxImportReduction > 0 ? scenario.importReductionKwhAnnualized / maxImportReduction : 0;
        const normalizedCycles = maxCycles > 0 ? Math.min(scenario.cyclesPerYear / maxCycles, 1) : 0;
        const normalizedMarginalGain = maxMarginal > 0 ? Math.min((scenario.marginalGainPerAddedKwh ?? 0) / maxMarginal, 1) : 0;
        const oversizeRatio =
          formulaAdvice.rawAdvice.recommendedKwh > 0 ? scenario.capacityKwh / formulaAdvice.rawAdvice.recommendedKwh : 1;
        let score =
          normalizedImportReduction * 0.5 +
          normalizedCycles * 0.25 +
          normalizedMarginalGain * 0.25;
        if (oversizeRatio > 3) score -= 0.5;
        else if (oversizeRatio > 2) score -= 0.25;
        else if (oversizeRatio > 1.5) score -= 0.1;
        return { scenario, score };
      })
      .sort((a, b) => b.score - a.score || a.scenario.capacityKwh - b.scenario.capacityKwh)[0]?.scenario ?? fallbackScenario;

  const spaciousCandidates = allScenarios.filter((scenario) => {
    if (usedCustomerType === 'home' && scenario.capacityKwh > resolvedHybridConfig.maxHomeBatteryKwh && scenario.capacityKwh !== 64) {
      return false;
    }
    if (usedCustomerType === 'business' && scenario.capacityKwh === 5015 && formulaAdvice.rawAdvice.recommendedKwh <= 2090) {
      return false;
    }
    return (scenario.marginalGainPerAddedKwh ?? 0) >= minMarginalGain * 0.6;
  });
  const spaciousScenario =
    spaciousCandidates[spaciousCandidates.length - 1] ??
    eligibleScenarios[eligibleScenarios.length - 1] ??
    fallbackScenario;

  conservativeScenario.recommendationReason =
    'Kleinste zinvolle optie die al een groot deel van de praktische importreductie pakt.';
  recommendedScenario.recommendationReason =
    'Deze batterij is gekozen omdat hij de beste balans geeft tussen extra eigen verbruik, benutting en afvlakking van meeropbrengst.';
  spaciousScenario.recommendationReason =
    'Ruimste zinvolle optie voordat de meeropbrengst duidelijk afvlakt.';

  const warnings = [...formulaAdvice.warnings];
  if (formulaAdvice.totals.numberOfDays < 365) {
    warnings.push('Dataset korter dan 12 maanden; jaarlijkse waarden zijn opgeschaald en dus indicatief.');
  }
  if (economicsEnabled && resolvedEconomics.pricingMode === 'dynamic') {
    const stats = resolvedEconomics.pricingStats;
    warnings.push(
      'Bij dynamische prijzen wordt de economische waarde per interval berekend. In PV-zelfverbruik laadt de batterij nog steeds alleen met zonne-overschot en niet voor actieve handel met netstroom.'
    );
    if (stats) {
      if (stats.hourlyMatches > 0) {
        warnings.push('Prijsdata is per uur gekoppeld aan kwartierdata.');
      }
      if (stats.fallbackMatches > 0) {
        warnings.push(`Gemiddelde fallbackprijzen gebruikt voor ${stats.fallbackMatches} intervallen.`);
      }
      if (stats.missingPrices > 0) {
        warnings.push(`Prijsdata ontbreekt voor ${stats.missingPrices} intervallen.`);
      }
    }
  }
  if (Math.abs(recommendedScenario.capacityKwh - formulaAdvice.roundedAdvice.recommendedKwh) >= 10) {
    warnings.push('De kwartiersimulatie wijkt duidelijk af van de formulebasis; simulatieadvies is leidend.');
  }
  if (usedCustomerType === 'home' && formulaAdvice.rawAdvice.capReason) {
    warnings.push(formulaAdvice.rawAdvice.capReason);
  }

  const explanation = [
    ...formulaAdvice.explanation,
    `De formule geeft ${formulaAdvice.rawAdvice.recommendedKwh.toFixed(1)} kWh als basisinschatting.`,
    `De kwartiersimulatie laat zien dat ${recommendedScenario.capacityKwh} kWh met circa ${recommendedScenario.dischargePowerKw.toFixed(1)} kW de beste balans geeft tussen importreductie, benutting en marginale meeropbrengst.`
  ];

  return {
    customerTypeDetected,
    usedCustomerType,
    formulaAdvice: {
      p50StorageNeedKwh: formulaAdvice.percentiles.p50StorageNeedKwh,
      p75StorageNeedKwh: formulaAdvice.percentiles.p75StorageNeedKwh,
      p90StorageNeedKwh: formulaAdvice.percentiles.p90StorageNeedKwh,
      conservativeFormulaKwh: formulaAdvice.rawAdvice.conservativeKwh,
      recommendedFormulaKwh: formulaAdvice.rawAdvice.recommendedKwh,
      spaciousFormulaKwh: formulaAdvice.rawAdvice.spaciousKwh
    },
    simulationAdvice: {
      conservative: conservativeScenario,
      recommended: recommendedScenario,
      spacious: spaciousScenario,
      allScenarios
    },
    totals: {
      numberOfIntervals: intervals.length,
      numberOfDays: formulaAdvice.totals.numberOfDays,
      numberOfPvActiveDays: formulaAdvice.totals.numberOfPvActiveDays,
      totalImportKwh: formulaAdvice.totals.totalImportKwh,
      totalExportKwh: formulaAdvice.totals.totalExportKwh,
      maxDailyExportKwh: formulaAdvice.totals.maxDailyExportKwh
    },
    configUsed: {
      usableFraction: resolvedHybridConfig.usableFraction,
      roundTripEfficiency: resolvedHybridConfig.roundTripEfficiency,
      resetSocDaily: simulationConfig.resetSocDaily,
      pricingMode: resolvedEconomics.pricingMode,
      fallbackToAveragePrices: resolvedEconomics.fallbackToAveragePrices,
      pricingStats: resolvedEconomics.pricingStats,
      importPriceEurPerKwh: resolvedEconomics.importPriceEurPerKwh,
      exportCompensationEurPerKwh: resolvedEconomics.exportCompensationEurPerKwh,
      feedInCostEurPerKwh: resolvedEconomics.feedInCostEurPerKwh,
      fixedEnergyTaxEurPerKwh: resolvedEconomics.fixedEnergyTaxEurPerKwh
    },
    warnings,
    explanation
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
  intervals: ProcessedInterval[],
  simulationAdvice?: PvSelfConsumptionAdviceResult | null
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
      capacityKwh: simulationAdvice?.simulationAdvice.conservative.capacityKwh ?? adviceResult.roundedAdvice.conservativeKwh
    },
    {
      label: 'Aanbevolen',
      capacityKwh: simulationAdvice?.simulationAdvice.recommended.capacityKwh ?? adviceResult.roundedAdvice.recommendedKwh,
      emphasis: true
    },
    {
      label: 'Ruim',
      capacityKwh: simulationAdvice?.simulationAdvice.spacious.capacityKwh ?? adviceResult.roundedAdvice.spaciousKwh
    }
  ];

  const marginalGainChart = simulationAdvice
    ? simulationAdvice.simulationAdvice.allScenarios.map((scenario) => ({
        capacityKwh: scenario.capacityKwh,
        coveredStorageKwhPerYear: round2(scenario.importReductionKwhAnnualized),
        marginalGainKwh: round2(scenario.marginalGainKwh ?? 0),
        marginalGainPerAddedKwh: round2(scenario.marginalGainPerAddedKwh ?? 0)
      }))
    : capacityOptions.map((capacityKwh, index) => {
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

  const coverageByCapacityChart = (simulationAdvice?.simulationAdvice.allScenarios.map((scenario) => scenario.capacityKwh) ?? capacityOptions).map((capacityKwh) => {
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

  const annualValueByCapacityChart = simulationAdvice
    ? simulationAdvice.simulationAdvice.allScenarios.map((scenario) => ({
        capacityKwh: scenario.capacityKwh,
        annualValueEur: round2(scenario.annualValueEur ?? 0)
      }))
    : [];

  const importExportCostChart =
    simulationAdvice?.simulationAdvice.recommended == null
      ? []
      : [
          {
            label: 'Kosten zonder batterij',
            costEur: round2(simulationAdvice.simulationAdvice.recommended.baselineEnergyCostEur ?? 0)
          },
          {
            label: 'Kosten met aanbevolen batterij',
            costEur: round2(simulationAdvice.simulationAdvice.recommended.batteryEnergyCostEur ?? 0)
          },
          {
            label: 'Waarde batterij',
            costEur: round2(simulationAdvice.simulationAdvice.recommended.annualValueEur ?? 0)
          }
        ];

  const monthlyValueMap = new Map<string, { baselineCostEur: number; batteryCostEur: number; valueEur: number }>();
  (simulationAdvice?.simulationAdvice.recommended.valueByInterval ?? []).forEach((row) => {
    const month = formatMonthLabel(getLocalDayIso(row.ts, 'Europe/Amsterdam'));
    const current = monthlyValueMap.get(month) ?? { baselineCostEur: 0, batteryCostEur: 0, valueEur: 0 };
    current.baselineCostEur += row.baselineCostEur;
    current.batteryCostEur += row.batteryCostEur;
    current.valueEur += row.intervalValueEur;
    monthlyValueMap.set(month, current);
  });
  const monthlyValueChart = Array.from(monthlyValueMap.entries())
    .map(([month, values]) => ({
      month,
      baselineCostEur: round2(values.baselineCostEur),
      batteryCostEur: round2(values.batteryCostEur),
      valueEur: round2(values.valueEur)
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
  const recommendedCapacityKwh =
    simulationAdvice?.simulationAdvice.recommended.capacityKwh ?? adviceResult.roundedAdvice.recommendedKwh;
  const simulatedSocSeries = simulationAdvice?.simulationAdvice.recommended.socSeries ?? [];
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

            const simulatedSocKwh =
              simulatedSocSeries.find((point) => point.timestamp === interval.timestamp)?.socKwh;

            return {
              timestamp: interval.timestamp,
              importKwh: round2(inEveningNight ? Math.max(0, flow.loadDeficitKwh - dischargeKwh) : flow.loadDeficitKwh),
              exportKwh: round2(Math.max(0, flow.surplusKwh - chargeKwh)),
              batterySocKwh: round2(simulatedSocKwh ?? batterySocKwh),
              importPriceEurPerKwh: interval.importPriceEurPerKwh,
              exportPriceEurPerKwh: interval.exportPriceEurPerKwh
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
    annualValueByCapacityChart,
    importExportCostChart,
    monthlyValueChart,
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

export function buildSizingResultFromPvSelfConsumptionAdvice(
  formulaAdvice: PvStorageFormulaAdviceResult,
  hybridAdvice: PvSelfConsumptionAdviceResult
): SizingResult {
  const recommendedScenario = hybridAdvice.simulationAdvice.recommended;
  const spaciousScenario = hybridAdvice.simulationAdvice.spacious;

  return {
    kWhNeededRaw: formulaAdvice.rawAdvice.rawRecommendedKwh,
    kWNeededRaw: recommendedScenario.dischargePowerKw,
    kWhNeeded: recommendedScenario.capacityKwh,
    kWNeeded: recommendedScenario.dischargePowerKw,
    recommendedProduct: buildAdviceProduct(
      recommendedScenario.capacityKwh,
      hybridAdvice.usedCustomerType,
      'Aanbevolen'
    ),
    alternativeProduct: buildAdviceProduct(spaciousScenario.capacityKwh, hybridAdvice.usedCustomerType, 'Ruim'),
    noFeasibleBatteryByPower: false,
    pvFormulaAdvice: formulaAdvice,
    pvSelfConsumptionAdvice: hybridAdvice
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
