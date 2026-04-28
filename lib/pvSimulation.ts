import type { IntervalRecord, ProcessedInterval } from './calculations';
import {
  getInitialSocKwh,
  getMaxChargeIntervalKwh,
  getMaxDischargeIntervalKwh,
  resolveBatteryPhysics,
  type BatteryPhysicsConfig
} from './batteryPhysics';
import { getLocalHourMinute } from './datetime';

export type PvAnalysisMode = 'FULL_PV' | 'EXPORT_ONLY';
export type PvStrategy = 'SELF_CONSUMPTION_ONLY' | 'PV_WITH_TRADING';

export interface PvTradingSignal {
  sellNow?: boolean;
  priceEurPerKwh?: number;
}

export interface PvTradingConfig {
  intervalSignals?: Record<string, PvTradingSignal>;
  priceThresholdEurPerKwh?: number;
  peakPriceHours?: number[];
  importPriceEurPerKwh?: number;
  exportPriceEurPerKwh?: number;
  prioritizeLoadBeforeGrid?: boolean;
}

export interface PvSimulationConfig extends BatteryPhysicsConfig {
  initialSocRatio?: number;
  strategy?: PvStrategy;
  trading?: PvTradingConfig;
  captureSocSeries?: boolean;
}

export interface PvIntervalFlow {
  mode: PvAnalysisMode;
  consumptionKwh: number;
  pvKwh: number | null;
  exportKwh: number;
  directSelfConsumptionKwh: number;
  surplusKwh: number;
  loadDeficitKwh: number;
}

export interface PvScenarioMetrics {
  mode: PvAnalysisMode;
  strategy: PvStrategy;
  exportIntervalsBefore: number;
  exportIntervalsAfter: number;
  totalConsumptionKwh: number;
  totalPvKwh: number | null;
  directSelfConsumptionBeforeKwh: number | null;
  selfConsumptionAfterKwh: number | null;
  importedEnergyBeforeKwh: number;
  importedEnergyAfterKwh: number;
  exportedEnergyBeforeKwh: number;
  exportedEnergyAfterKwh: number;
  immediateExportedKwh: number;
  capturedExportEnergyKwh: number;
  shiftedExportedLaterKwh: number;
  storedPvUsedOnsiteKwh: number;
  totalUsefulDischargedEnergyKwh: number;
  batteryUtilizationAgainstExport: number;
  selfConsumptionRatio: number | null;
  selfSufficiency: number | null;
  importReductionKwh: number;
  exportReduction: number;
  avoidedImportValueEur: number | null;
  tradingExportValueEur: number | null;
  totalEconomicValueEur: number | null;
  peakSocKwh: number;
  maxRemainingExportKw: number;
  maxChargeKw: number;
  maxDischargeKw: number;
  endingSocKwh: number;
  socSeries: { timestamp: string; socKwh: number }[];
  limitations: string[];
}

export interface ScenarioOption {
  capacityKwh: number;
  label: string;
  modular?: {
    baseSize: number;
    count: number;
  };
}

export type ScenarioOptionProfile = 'DEFAULT' | 'HOME_PV' | 'BUSINESS_PV';

const NO_PV_DATA_LIMITATION = 'Geen bruikbare PV- of exportdata gevonden voor de PV-analyse.';
const TRADING_LIMITATION = 'Trading mode allows stored PV energy to be exported later within the battery power and SOC limits.';
const DEFAULT_PEAK_PRICE_HOURS = [17, 18, 19, 20];
const INTERVAL_HOURS = 0.25;
const MODULAR_BASE_SIZES = [64, 96, 232, 261];
const FIXED_SCENARIO_OPTIONS: ScenarioOption[] = [
  { capacityKwh: 64, label: '64 kWh' },
  { capacityKwh: 96, label: '96 kWh' },
  { capacityKwh: 232, label: '232 kWh' },
  { capacityKwh: 261, label: '261 kWh' },
  { capacityKwh: 2090, label: '2.09 MWh (2090 kWh)' },
  { capacityKwh: 5015, label: '5.015 MWh (5015 kWh)' }
];
const HOME_PV_SCENARIO_OPTIONS: ScenarioOption[] = [
  { capacityKwh: 5, label: '5 kWh' },
  { capacityKwh: 10, label: '10 kWh' },
  { capacityKwh: 15, label: '15 kWh' },
  { capacityKwh: 20, label: '20 kWh' },
  { capacityKwh: 25, label: '25 kWh' },
  { capacityKwh: 30, label: '30 kWh' },
  { capacityKwh: 40, label: '40 kWh' },
  { capacityKwh: 50, label: '50 kWh' },
  { capacityKwh: 64, label: '64 kWh' }
];
const BUSINESS_PV_SCENARIO_OPTIONS: ScenarioOption[] = [
  { capacityKwh: 64, label: '64 kWh' },
  { capacityKwh: 96, label: '96 kWh' },
  { capacityKwh: 232, label: '232 kWh' },
  { capacityKwh: 261, label: '261 kWh' },
  { capacityKwh: 464, label: '2x232 (464 kWh)' },
  { capacityKwh: 522, label: '2x261 (522 kWh)' },
  { capacityKwh: 696, label: '3x232 (696 kWh)' },
  { capacityKwh: 783, label: '3x261 (783 kWh)' },
  { capacityKwh: 928, label: '4x232 (928 kWh)' },
  { capacityKwh: 1044, label: '4x261 (1044 kWh)' },
  { capacityKwh: 1160, label: '5x232 (1160 kWh)' },
  { capacityKwh: 1305, label: '5x261 (1305 kWh)' },
  { capacityKwh: 1392, label: '6x232 (1392 kWh)' },
  { capacityKwh: 1566, label: '6x261 (1566 kWh)' },
  { capacityKwh: 1624, label: '7x232 (1624 kWh)' },
  { capacityKwh: 1827, label: '7x261 (1827 kWh)' },
  { capacityKwh: 1856, label: '8x232 (1856 kWh)' },
  { capacityKwh: 2090, label: '2.09 MWh (2090 kWh)' },
  { capacityKwh: 5015, label: '5.015 MWh (5015 kWh)' }
];

export function determinePvAnalysisMode(intervals: Array<IntervalRecord | ProcessedInterval>): PvAnalysisMode | null {
  const hasPv = intervals.some((interval) => interval.pvKwh != null && Number.isFinite(interval.pvKwh));
  if (hasPv) return 'FULL_PV';

  const hasExport = intervals.some((interval) => interval.exportKwh != null && Number.isFinite(interval.exportKwh));
  if (hasExport) return 'EXPORT_ONLY';

  return null;
}

export function getPvAnalysisLimitations(mode: PvAnalysisMode | null, strategy?: PvStrategy): string[] {
  const warnings: string[] = [];
  if (mode == null) warnings.push(NO_PV_DATA_LIMITATION);
  if (strategy === 'PV_WITH_TRADING') warnings.push(TRADING_LIMITATION);
  return warnings;
}

export function derivePvIntervalFlow(
  interval: IntervalRecord | ProcessedInterval,
  mode = determinePvAnalysisMode([interval]) ?? 'EXPORT_ONLY'
): PvIntervalFlow {
  const consumptionKwh = Math.max(0, interval.consumptionKwh ?? 0);

  if (mode === 'FULL_PV') {
    const pvKwh = Math.max(0, interval.pvKwh ?? 0);
    const directSelfConsumptionKwh = Math.min(consumptionKwh, pvKwh);
    const measuredExportKwh = interval.exportKwh == null ? null : Math.max(0, interval.exportKwh);
    const surplusKwh = Math.max(0, measuredExportKwh ?? pvKwh - directSelfConsumptionKwh);
    const loadDeficitKwh = Math.max(0, consumptionKwh - directSelfConsumptionKwh);

    return {
      mode,
      consumptionKwh,
      pvKwh,
      exportKwh: measuredExportKwh ?? surplusKwh,
      directSelfConsumptionKwh,
      surplusKwh,
      loadDeficitKwh
    };
  }

  const exportKwh = Math.max(0, interval.exportKwh ?? 0);
  return {
    mode,
    consumptionKwh,
    pvKwh: null,
    exportKwh,
    directSelfConsumptionKwh: 0,
    surplusKwh: exportKwh,
    loadDeficitKwh: consumptionKwh
  };
}

function shouldSellNow(timestamp: string, trading?: PvTradingConfig): boolean {
  const signal = trading?.intervalSignals?.[timestamp];
  if (signal?.sellNow != null) return signal.sellNow;

  if (signal?.priceEurPerKwh != null && trading?.priceThresholdEurPerKwh != null) {
    return signal.priceEurPerKwh >= trading.priceThresholdEurPerKwh;
  }

  const peakHours = trading?.peakPriceHours ?? DEFAULT_PEAK_PRICE_HOURS;
  const { hour } = getLocalHourMinute(timestamp, 'Europe/Amsterdam');
  return peakHours.includes(hour);
}

export function simulatePvBattery(
  intervals: ProcessedInterval[],
  batteryCapacityKwh: number,
  config?: PvSimulationConfig
): PvScenarioMetrics {
  const mode = determinePvAnalysisMode(intervals);
  const strategy = config?.strategy ?? 'SELF_CONSUMPTION_ONLY';
  const { spec, chargeEfficiency, dischargeEfficiency, minSocKwh, maxSocKwh } = resolveBatteryPhysics(
    batteryCapacityKwh,
    config
  );
  const maxChargeIntervalKwh = getMaxChargeIntervalKwh(spec.maxChargeKw, INTERVAL_HOURS);
  const maxDischargeIntervalKwh = getMaxDischargeIntervalKwh(spec.maxDischargeKw, INTERVAL_HOURS);
  let socKwh = getInitialSocKwh(batteryCapacityKwh, config?.initialSocRatio ?? 0, config);

  let totalConsumptionKwh = 0;
  let totalPvKwh = 0;
  let directSelfConsumptionBeforeKwh = 0;
  let selfConsumptionAfterKwh = 0;
  let importedEnergyBeforeKwh = 0;
  let importedEnergyAfterKwh = 0;
  let exportedEnergyBeforeKwh = 0;
  let exportedEnergyAfterKwh = 0;
  let immediateExportedKwh = 0;
  let capturedExportEnergyKwh = 0;
  let shiftedExportedLaterKwh = 0;
  let storedPvUsedOnsiteKwh = 0;
  let totalUsefulDischargedEnergyKwh = 0;
  let exportIntervalsBefore = 0;
  let exportIntervalsAfter = 0;
  let maxRemainingExportKw = 0;
  let avoidedImportValueEur = 0;
  let tradingExportValueEur = 0;
  const socSeries: { timestamp: string; socKwh: number }[] = [];
  const captureSocSeries = config?.captureSocSeries ?? false;
  let peakSocKwh = Math.max(0, socKwh - minSocKwh);

  intervals.forEach((interval) => {
    const flow = derivePvIntervalFlow(interval, mode ?? 'EXPORT_ONLY');
    const storableInputLimitKwh = chargeEfficiency > 0 ? Math.max(0, maxSocKwh - socKwh) / chargeEfficiency : 0;
    const chargeInputKwh = Math.min(flow.surplusKwh, maxChargeIntervalKwh, storableInputLimitKwh);
    socKwh = Math.min(maxSocKwh, socKwh + chargeInputKwh * chargeEfficiency);
    peakSocKwh = Math.max(peakSocKwh, Math.max(0, socKwh - minSocKwh));
    const exportedImmediateKwh = Math.max(flow.surplusKwh - chargeInputKwh, 0);

    const availableDeliverableKwh = Math.min(
      maxDischargeIntervalKwh,
      Math.max(0, socKwh - minSocKwh) * dischargeEfficiency
    );
    const prioritizeLoadBeforeGrid = config?.trading?.prioritizeLoadBeforeGrid ?? true;
    const sellNow = strategy === 'PV_WITH_TRADING' ? shouldSellNow(interval.timestamp, config?.trading) : false;

    let dischargeToLoadKwh = 0;
    let dischargeToGridKwh = 0;

    if (strategy === 'SELF_CONSUMPTION_ONLY' || prioritizeLoadBeforeGrid) {
      dischargeToLoadKwh = Math.min(flow.loadDeficitKwh, availableDeliverableKwh);
      const remainingDeliverableKwh = Math.max(0, availableDeliverableKwh - dischargeToLoadKwh);
      dischargeToGridKwh = strategy === 'PV_WITH_TRADING' && sellNow ? remainingDeliverableKwh : 0;
    } else {
      dischargeToGridKwh = sellNow ? availableDeliverableKwh : 0;
      const remainingDeliverableKwh = Math.max(0, availableDeliverableKwh - dischargeToGridKwh);
      dischargeToLoadKwh = Math.min(flow.loadDeficitKwh, remainingDeliverableKwh);
    }

    if (dischargeEfficiency > 0) {
      socKwh = Math.max(
        minSocKwh,
        socKwh - (dischargeToLoadKwh + dischargeToGridKwh) / dischargeEfficiency
      );
    }

    const importedAfterKwh = Math.max(flow.loadDeficitKwh - dischargeToLoadKwh, 0);
    const exportedAfterKwh = exportedImmediateKwh + dischargeToGridKwh;

    totalConsumptionKwh += flow.consumptionKwh;
    totalPvKwh += flow.pvKwh ?? 0;
    directSelfConsumptionBeforeKwh += flow.directSelfConsumptionKwh;
    selfConsumptionAfterKwh += flow.directSelfConsumptionKwh + dischargeToLoadKwh;
    importedEnergyBeforeKwh += flow.loadDeficitKwh;
    importedEnergyAfterKwh += importedAfterKwh;
    exportedEnergyBeforeKwh += flow.surplusKwh;
    exportedEnergyAfterKwh += exportedAfterKwh;
    immediateExportedKwh += exportedImmediateKwh;
    capturedExportEnergyKwh += chargeInputKwh;
    shiftedExportedLaterKwh += dischargeToGridKwh;
    storedPvUsedOnsiteKwh += dischargeToLoadKwh;
    totalUsefulDischargedEnergyKwh += dischargeToLoadKwh + dischargeToGridKwh;
    if (flow.surplusKwh > 0) exportIntervalsBefore += 1;
    if (exportedAfterKwh > 0) exportIntervalsAfter += 1;
    maxRemainingExportKw = Math.max(maxRemainingExportKw, exportedAfterKwh / INTERVAL_HOURS);
    if (captureSocSeries) {
      socSeries.push({ timestamp: interval.timestamp, socKwh });
    }

    if (config?.trading?.importPriceEurPerKwh != null) {
      avoidedImportValueEur += dischargeToLoadKwh * config.trading.importPriceEurPerKwh;
    }
    const intervalPrice = config?.trading?.intervalSignals?.[interval.timestamp]?.priceEurPerKwh;
    const exportPrice = intervalPrice ?? config?.trading?.exportPriceEurPerKwh;
    if (exportPrice != null) {
      tradingExportValueEur += dischargeToGridKwh * exportPrice;
    }
  });

  const safeMode = mode ?? 'EXPORT_ONLY';
  const limitations = getPvAnalysisLimitations(mode, strategy);
  const totalPvKnown = safeMode === 'FULL_PV';
  const totalPvValue = totalPvKnown ? totalPvKwh : null;
  const directSelfValue = totalPvKnown ? directSelfConsumptionBeforeKwh : null;
  const afterSelfValue = totalPvKnown ? selfConsumptionAfterKwh : null;
  const selfConsumptionRatio = totalPvKnown && totalPvKwh > 0 ? selfConsumptionAfterKwh / totalPvKwh : null;
  const selfSufficiency = totalPvKnown && totalConsumptionKwh > 0 ? selfConsumptionAfterKwh / totalConsumptionKwh : null;
  const importReductionKwh = Math.max(0, importedEnergyBeforeKwh - importedEnergyAfterKwh);
  const exportReduction =
    exportedEnergyBeforeKwh > 0 ? (exportedEnergyBeforeKwh - exportedEnergyAfterKwh) / exportedEnergyBeforeKwh : 0;
  const batteryUtilizationAgainstExport =
    exportedEnergyBeforeKwh > 0 ? capturedExportEnergyKwh / exportedEnergyBeforeKwh : 0;
  const hasEconomicInputs =
    config?.trading?.importPriceEurPerKwh != null ||
    config?.trading?.exportPriceEurPerKwh != null ||
    intervals.some((interval) => config?.trading?.intervalSignals?.[interval.timestamp]?.priceEurPerKwh != null);
  const avoidedImportValue = hasEconomicInputs ? avoidedImportValueEur : null;
  const tradingExportValue = hasEconomicInputs ? tradingExportValueEur : null;
  const totalEconomicValue =
    hasEconomicInputs ? (avoidedImportValueEur ?? 0) + (tradingExportValueEur ?? 0) : null;

  return {
    mode: safeMode,
    strategy,
    exportIntervalsBefore,
    exportIntervalsAfter,
    totalConsumptionKwh,
    totalPvKwh: totalPvValue,
    directSelfConsumptionBeforeKwh: directSelfValue,
    selfConsumptionAfterKwh: afterSelfValue,
    importedEnergyBeforeKwh,
    importedEnergyAfterKwh,
    exportedEnergyBeforeKwh,
    exportedEnergyAfterKwh,
    immediateExportedKwh,
    capturedExportEnergyKwh,
    shiftedExportedLaterKwh,
    storedPvUsedOnsiteKwh,
    totalUsefulDischargedEnergyKwh,
    batteryUtilizationAgainstExport,
    selfConsumptionRatio,
    selfSufficiency,
    importReductionKwh,
    exportReduction,
    avoidedImportValueEur: avoidedImportValue,
    tradingExportValueEur: tradingExportValue,
    totalEconomicValueEur: totalEconomicValue,
    peakSocKwh,
    maxRemainingExportKw,
    maxChargeKw: spec.maxChargeKw,
    maxDischargeKw: spec.maxDischargeKw,
    endingSocKwh: socKwh,
    socSeries,
    limitations
  };
}

export function scorePvScenarioForRecommendation(
  metrics: PvScenarioMetrics
): { primary: number; secondary: number } {
  if (metrics.strategy === 'PV_WITH_TRADING') {
    return {
      primary: metrics.totalEconomicValueEur ?? metrics.totalUsefulDischargedEnergyKwh,
      secondary: metrics.shiftedExportedLaterKwh + metrics.importReductionKwh
    };
  }

  if (metrics.mode === 'FULL_PV') {
    return {
      primary: metrics.selfConsumptionRatio ?? metrics.importReductionKwh,
      secondary: metrics.exportReduction
    };
  }

  return {
    primary: metrics.batteryUtilizationAgainstExport,
    secondary: metrics.exportReduction
  };
}

export function generateNearbyModularOptions(params: {
  baseSize: number;
  targetKwh: number;
  maxOptionsPerBase?: number;
}): ScenarioOption[] {
  const { baseSize, targetKwh, maxOptionsPerBase = 4 } = params;
  const nCenter = targetKwh / baseSize;
  const n0 = Math.floor(nCenter);
  const n1 = Math.ceil(nCenter);
  const nCandidates = [n0 - 2, n0 - 1, n0, n1, n1 + 1, n1 + 2].filter((n) => n >= 1);
  const uniqueCounts = Array.from(new Set(nCandidates));

  return uniqueCounts
    .map((count) => ({
      capacityKwh: count * baseSize,
      label: `${count}x${baseSize} (${count * baseSize} kWh)`,
      modular: { baseSize, count }
    }))
    .sort(
      (a, b) =>
        Math.abs(a.capacityKwh - targetKwh) - Math.abs(b.capacityKwh - targetKwh) ||
        (a.capacityKwh - targetKwh) - (b.capacityKwh - targetKwh) ||
        a.capacityKwh - b.capacityKwh
    )
    .slice(0, maxOptionsPerBase);
}

export function generateScenarioOptions(params: {
  targetKwh: number;
  maxOptionsPerBase?: number;
  maxTotalOptions?: number;
  profile?: ScenarioOptionProfile;
}): ScenarioOption[] {
  const { targetKwh, maxOptionsPerBase = 3, maxTotalOptions = 10, profile = 'DEFAULT' } = params;

  if (profile === 'HOME_PV') {
    return HOME_PV_SCENARIO_OPTIONS.filter((option) => option.capacityKwh <= Math.max(64, targetKwh * 4))
      .sort((a, b) => a.capacityKwh - b.capacityKwh);
  }

  if (profile === 'BUSINESS_PV') {
    return BUSINESS_PV_SCENARIO_OPTIONS.filter((option) => option.capacityKwh <= Math.max(5015, targetKwh * 1.5))
      .sort((a, b) => a.capacityKwh - b.capacityKwh);
  }

  const modularOptions = MODULAR_BASE_SIZES.flatMap((baseSize) =>
    generateNearbyModularOptions({ baseSize, targetKwh, maxOptionsPerBase })
  );
  const combined = [...modularOptions, ...FIXED_SCENARIO_OPTIONS];
  const deduped = new Map<number, ScenarioOption>();
  combined.forEach((option) => {
    if (!deduped.has(option.capacityKwh)) {
      deduped.set(option.capacityKwh, option);
    }
  });

  const allOptions = Array.from(deduped.values());
  if (allOptions.length <= maxTotalOptions) {
    return allOptions.sort((a, b) => a.capacityKwh - b.capacityKwh);
  }

  const relevanceSort = (a: ScenarioOption, b: ScenarioOption) =>
    Math.abs(a.capacityKwh - targetKwh) - Math.abs(b.capacityKwh - targetKwh) ||
    (a.capacityKwh - targetKwh) - (b.capacityKwh - targetKwh) ||
    a.capacityKwh - b.capacityKwh;

  const selected = new Map<number, ScenarioOption>();
  [2090, 5015].forEach((capacity) => {
    const option = allOptions.find((candidate) => candidate.capacityKwh === capacity);
    if (option) selected.set(option.capacityKwh, option);
  });

  MODULAR_BASE_SIZES.forEach((baseSize) => {
    const optionsForBase = allOptions
      .filter((option) => option.capacityKwh % baseSize === 0)
      .sort((a, b) => a.capacityKwh - b.capacityKwh);
    const closestPerBase = [...optionsForBase].sort(relevanceSort)[0];
    if (closestPerBase) selected.set(closestPerBase.capacityKwh, closestPerBase);
    const belowTarget = [...optionsForBase].reverse().find((option) => option.capacityKwh < targetKwh);
    const aboveTarget = optionsForBase.find((option) => option.capacityKwh > targetKwh);
    if (belowTarget) selected.set(belowTarget.capacityKwh, belowTarget);
    if (aboveTarget) selected.set(aboveTarget.capacityKwh, aboveTarget);
  });

  allOptions.sort(relevanceSort).forEach((option) => {
    if (selected.size >= maxTotalOptions) return;
    selected.set(option.capacityKwh, option);
  });

  return Array.from(selected.values())
    .slice(0, maxTotalOptions)
    .sort((a, b) => a.capacityKwh - b.capacityKwh);
}

export function buildDefaultTradingConfig(strategy: PvStrategy): PvTradingConfig | undefined {
  if (strategy !== 'PV_WITH_TRADING') return undefined;
  return {
    peakPriceHours: DEFAULT_PEAK_PRICE_HOURS,
    prioritizeLoadBeforeGrid: true
  };
}
