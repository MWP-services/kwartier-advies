import type { BatteryProduct, IntervalRecord, ProcessedInterval } from './calculations';
import { getBatterySpecForCapacity } from './batterySpecs';

export type PvAnalysisMode = 'FULL_PV' | 'EXPORT_ONLY';

export interface PvSimulationConfig {
  initialSocRatio?: number;
  dischargeEfficiency?: number;
  reserveEnergyForTradingKwh?: number;
  reserveEmptyCapacityForTradingKwh?: number;
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
  capturedExportEnergyKwh: number;
  batteryUtilizationAgainstExport: number;
  selfConsumptionRatio: number | null;
  selfSufficiency: number | null;
  exportReduction: number;
  maxRemainingExportKw: number;
  maxChargeKw: number;
  maxDischargeKw: number;
  endingSocKwh: number;
  socSeries: { timestamp: string; socKwh: number }[];
  limitations: string[];
}

export interface PvSizingEvaluation {
  recommendedProduct: BatteryProduct | null;
  alternativeProduct: BatteryProduct | null;
  kWhNeededRaw: number;
  kWNeededRaw: number;
  kWhNeeded: number;
  kWNeeded: number;
  noFeasibleBatteryByPower: boolean;
}

export interface ScenarioOption {
  capacityKwh: number;
  label: string;
  modular?: {
    baseSize: number;
    count: number;
  };
}

const EXPORT_ONLY_LIMITATION = 'PV total and self-consumption ratio cannot be calculated without pv_kwh input.';
const NO_PV_DATA_LIMITATION = 'Geen bruikbare PV- of exportdata gevonden voor de PV-analyse.';
const INTERVAL_HOURS = 0.25;
const MODULAR_BASE_SIZES = [64, 96, 261];
const FIXED_SCENARIO_OPTIONS: ScenarioOption[] = [
  { capacityKwh: 64, label: '64 kWh' },
  { capacityKwh: 96, label: '96 kWh' },
  { capacityKwh: 261, label: '261 kWh' },
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

export function getPvAnalysisLimitations(mode: PvAnalysisMode | null): string[] {
  if (mode === 'EXPORT_ONLY') return [EXPORT_ONLY_LIMITATION];
  if (mode == null) return [NO_PV_DATA_LIMITATION];
  return [];
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

function getUsableSocBounds(capacityKwh: number, config?: PvSimulationConfig): {
  minSocKwh: number;
  maxSocKwh: number;
} {
  const reserveEnergy = Math.max(0, config?.reserveEnergyForTradingKwh ?? 0);
  const reserveEmpty = Math.max(0, config?.reserveEmptyCapacityForTradingKwh ?? 0);
  const minSocKwh = Math.min(capacityKwh, reserveEnergy);
  const maxSocKwh = Math.max(minSocKwh, capacityKwh - reserveEmpty);
  return { minSocKwh, maxSocKwh };
}

export function simulatePvBattery(
  intervals: ProcessedInterval[],
  batteryCapacityKwh: number,
  config?: PvSimulationConfig
): PvScenarioMetrics {
  const mode = determinePvAnalysisMode(intervals);
  const spec = getBatterySpecForCapacity(batteryCapacityKwh);
  const hasDischargeEfficiencyOverride = config?.dischargeEfficiency != null;
  const dischargeEfficiency = hasDischargeEfficiencyOverride
    ? Math.max(0, Math.min(1, config?.dischargeEfficiency ?? 1))
    : Math.sqrt(spec.roundTripEfficiency);
  const chargeEfficiency = hasDischargeEfficiencyOverride ? 1 : Math.sqrt(spec.roundTripEfficiency);
  const { minSocKwh, maxSocKwh } = getUsableSocBounds(spec.capacityKwh, config);
  const usableCapacityKwh = Math.max(0, maxSocKwh - minSocKwh);
  const initialSocRatio = Math.max(0, Math.min(1, config?.initialSocRatio ?? 0));
  let socKwh = minSocKwh + usableCapacityKwh * initialSocRatio;

  let totalConsumptionKwh = 0;
  let totalPvKwh = 0;
  let directSelfConsumptionBeforeKwh = 0;
  let selfConsumptionAfterKwh = 0;
  let importedEnergyBeforeKwh = 0;
  let importedEnergyAfterKwh = 0;
  let exportedEnergyBeforeKwh = 0;
  let exportedEnergyAfterKwh = 0;
  let capturedExportEnergyKwh = 0;
  let maxRemainingExportKw = 0;
  let exportIntervalsBefore = 0;
  let exportIntervalsAfter = 0;
  const socSeries: { timestamp: string; socKwh: number }[] = [];

  intervals.forEach((interval) => {
    const flow = derivePvIntervalFlow(interval, mode ?? 'EXPORT_ONLY');
    const maxChargeIntervalKwh = spec.maxChargeKw * INTERVAL_HOURS;
    const maxDischargeIntervalKwh = spec.maxDischargeKw * INTERVAL_HOURS;
    const storableInputLimitKwh = chargeEfficiency > 0 ? Math.max(0, maxSocKwh - socKwh) / chargeEfficiency : 0;

    const chargeInputKwh = Math.min(flow.surplusKwh, maxChargeIntervalKwh, storableInputLimitKwh);
    socKwh = Math.min(maxSocKwh, socKwh + chargeInputKwh * chargeEfficiency);

    const dischargeToLoadKwh = Math.min(
      flow.loadDeficitKwh,
      maxDischargeIntervalKwh,
      Math.max(0, socKwh - minSocKwh) * dischargeEfficiency
    );

    if (dischargeEfficiency > 0) {
      socKwh = Math.max(minSocKwh, socKwh - dischargeToLoadKwh / dischargeEfficiency);
    }

    const importedAfterKwh = Math.max(flow.loadDeficitKwh - dischargeToLoadKwh, 0);
    const exportedAfterKwh = Math.max(flow.surplusKwh - chargeInputKwh, 0);

    totalConsumptionKwh += flow.consumptionKwh;
    totalPvKwh += flow.pvKwh ?? 0;
    directSelfConsumptionBeforeKwh += flow.directSelfConsumptionKwh;
    selfConsumptionAfterKwh += flow.directSelfConsumptionKwh + dischargeToLoadKwh;
    importedEnergyBeforeKwh += flow.loadDeficitKwh;
    importedEnergyAfterKwh += importedAfterKwh;
    exportedEnergyBeforeKwh += flow.surplusKwh;
    exportedEnergyAfterKwh += exportedAfterKwh;
    capturedExportEnergyKwh += chargeInputKwh;
    if (flow.surplusKwh > 0) exportIntervalsBefore += 1;
    if (exportedAfterKwh > 0) exportIntervalsAfter += 1;
    maxRemainingExportKw = Math.max(maxRemainingExportKw, exportedAfterKwh / INTERVAL_HOURS);
    socSeries.push({ timestamp: interval.timestamp, socKwh });
  });

  const limitations = getPvAnalysisLimitations(mode);
  const safeMode = mode ?? 'EXPORT_ONLY';
  const totalPvKnown = safeMode === 'FULL_PV';
  const totalPvValue = totalPvKnown ? totalPvKwh : null;
  const directSelfValue = totalPvKnown ? directSelfConsumptionBeforeKwh : null;
  const afterSelfValue = totalPvKnown ? selfConsumptionAfterKwh : null;
  const selfConsumptionRatio =
    totalPvKnown && totalPvKwh > 0 ? selfConsumptionAfterKwh / totalPvKwh : null;
  const selfSufficiency =
    totalPvKnown && totalConsumptionKwh > 0 ? selfConsumptionAfterKwh / totalConsumptionKwh : null;
  const exportReduction =
    exportedEnergyBeforeKwh > 0 ? (exportedEnergyBeforeKwh - exportedEnergyAfterKwh) / exportedEnergyBeforeKwh : 0;
  const batteryUtilizationAgainstExport =
    exportedEnergyBeforeKwh > 0 ? capturedExportEnergyKwh / exportedEnergyBeforeKwh : 0;

  return {
    mode: safeMode,
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
    capturedExportEnergyKwh,
    batteryUtilizationAgainstExport,
    selfConsumptionRatio,
    selfSufficiency,
    exportReduction,
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
  if (metrics.mode === 'FULL_PV') {
    return {
      primary: metrics.exportReduction,
      secondary: metrics.selfConsumptionRatio ?? 0
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
    .map((count) => {
      const capacityKwh = count * baseSize;
      return {
        capacityKwh,
        label: `${count}x${baseSize} (${capacityKwh} kWh)`,
        modular: { baseSize, count }
      };
    })
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
}): ScenarioOption[] {
  const { targetKwh, maxOptionsPerBase = 3, maxTotalOptions = 10 } = params;

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
  const alwaysIncludeCapacities = [2090, 5015];
  alwaysIncludeCapacities.forEach((capacity) => {
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
