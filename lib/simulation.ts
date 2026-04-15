import { BATTERY_OPTIONS, type ProcessedInterval } from './calculations';
import {
  getInitialSocKwh,
  getMaxChargeIntervalKwh,
  getMaxDischargeIntervalKwh,
  resolveBatteryPhysics
} from './batteryPhysics';
import { getLocalDayIso } from './datetime';
import {
  buildDefaultTradingConfig,
  generateScenarioOptions,
  simulatePvBattery,
  type PvAnalysisMode,
  type PvSimulationConfig,
  type PvStrategy
} from './pvSimulation';

export { generateNearbyModularOptions, generateScenarioOptions } from './pvSimulation';

export interface SimulationConfig {
  powerCapKw?: number;
  initialSocRatio?: number;
  // Use the sizing efficiency directly as battery-side -> grid-side discharge efficiency.
  dischargeEfficiency?: number;
  reserveEnergyForTradingKwh?: number;
  reserveEmptyCapacityForTradingKwh?: number;
}

export interface ScenarioResult {
  optionLabel: string;
  capacityKwh: number;
  pvAnalysisMode?: PvAnalysisMode;
  pvStrategy?: PvStrategy;
  limitations?: string[];
  exceedanceIntervalsBefore: number;
  exceedanceIntervalsAfter: number;
  exceedanceEnergyKwhBefore: number;
  exceedanceEnergyKwhAfter: number;
  achievedComplianceDataset: number;
  achievedComplianceDailyAverage: number;
  achievedCompliance: number;
  maxRemainingExcessKw: number;
  maxChargeKw: number;
  maxDischargeKw: number;
  endingSocKwh: number;
  shavedSeries: { timestamp: string; originalKw: number; shavedKw: number }[];
  totalPvKwh?: number | null;
  totalConsumptionKwh?: number;
  selfConsumptionBeforeKwh?: number | null;
  selfConsumptionAfterKwh?: number | null;
  importedEnergyBeforeKwh?: number;
  importedEnergyAfterKwh?: number;
  exportedEnergyBeforeKwh?: number;
  exportedEnergyAfterKwh?: number;
  immediateExportedKwh?: number;
  capturedExportEnergyKwh?: number;
  shiftedExportedLaterKwh?: number;
  storedPvUsedOnsiteKwh?: number;
  totalUsefulDischargedEnergyKwh?: number;
  batteryUtilizationAgainstExport?: number;
  achievedSelfConsumption?: number | null;
  selfSufficiency?: number | null;
  importReductionKwh?: number;
  exportReduction?: number;
  avoidedImportValueEur?: number | null;
  tradingExportValueEur?: number | null;
  totalEconomicValueEur?: number | null;
  socSeries?: { timestamp: string; socKwh: number }[];
}

export interface PvSummary {
  mode: PvAnalysisMode;
  strategy: PvStrategy;
  warnings: string[];
  totalPvKwh: number | null;
  totalConsumptionKwh: number;
  selfConsumptionBeforeKwh: number | null;
  selfConsumptionAfterKwh: number | null;
  importedBefore: number;
  importedAfter: number;
  exportBefore: number;
  exportAfter: number;
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
}

export function simulateSingleScenario(
  intervals: ProcessedInterval[],
  batteryCapacityKwh: number,
  sizingKwNeeded: number,
  maxExcessKw: number,
  config?: SimulationConfig,
  optionLabel?: string
): ScenarioResult {
  const initialSocRatio = config?.initialSocRatio ?? 0.5;
  const { spec, chargeEfficiency: chargeEff, dischargeEfficiency: dischargeEff, minSocKwh, maxSocKwh } =
    resolveBatteryPhysics(batteryCapacityKwh, config);
  const maxChargeKw = spec.maxChargeKw;
  const maxDischargeKw = spec.maxDischargeKw;
  // By default simulate each scenario with its own physical power capability.
  // A global powerCapKw can still be provided explicitly through config when needed.
  const powerCapKw = config?.powerCapKw ?? Math.min(maxExcessKw, maxDischargeKw);
  const batteryCapacityLimitKwh = maxSocKwh;
  const contractKw = Math.max(0, ...intervals.map((interval) => interval.consumptionKw - interval.excessKw));

  let soc = getInitialSocKwh(batteryCapacityKwh, initialSocRatio, config);
  let exceedanceIntervalsBefore = 0;
  let exceedanceIntervalsAfter = 0;
  let exceedanceEnergyKwhBefore = 0;
  let exceedanceEnergyKwhAfter = 0;
  let maxRemainingExcessKw = 0;
  const dailyTotals = new Map<string, { before: number; after: number }>();

  const shavedSeries = intervals.map((interval) => {
    const day = interval.timestamp.slice(0, 10);
    const dayTotal = dailyTotals.get(day) ?? { before: 0, after: 0 };
    dailyTotals.set(day, dayTotal);

    const headroomKw = Math.max(0, contractKw - interval.consumptionKw);
    const actualChargeKw = Math.min(headroomKw, maxChargeKw);
    const chargeInputKwh = Math.min(
      getMaxChargeIntervalKwh(actualChargeKw),
      chargeEff > 0 ? Math.max(0, batteryCapacityLimitKwh - soc) / chargeEff : 0
    );
    soc = Math.min(batteryCapacityLimitKwh, soc + chargeInputKwh * chargeEff);
    // Show the actual post-battery grid load in overlays: charging increases grid load, discharge reduces it.
    let postBatteryGridKw = interval.consumptionKw + actualChargeKw;

    if (interval.excessKw > 0) {
      exceedanceIntervalsBefore += 1;
      exceedanceEnergyKwhBefore += interval.excessKwh;
      dayTotal.before += interval.excessKwh;

      const dischargeLimitKw = Math.min(maxDischargeKw, powerCapKw);
      const dischargeNeedKwh = Math.min(interval.excessKw, dischargeLimitKw) * 0.25;
      const deliverableFromSocKwh = Math.max(0, soc - minSocKwh) * dischargeEff;
      const deliveredToLoadKwh = Math.min(dischargeNeedKwh, getMaxDischargeIntervalKwh(dischargeLimitKw), deliverableFromSocKwh);
      if (dischargeEff > 0) {
        soc = Math.max(minSocKwh, soc - deliveredToLoadKwh / dischargeEff);
      }
      const dischargeKw = deliveredToLoadKwh / 0.25;

      const remainingExcessKw = Math.max(0, interval.excessKw - dischargeKw);
      if (remainingExcessKw > 0) {
        exceedanceIntervalsAfter += 1;
        exceedanceEnergyKwhAfter += remainingExcessKw * 0.25;
        dayTotal.after += remainingExcessKw * 0.25;
      }
      maxRemainingExcessKw = Math.max(maxRemainingExcessKw, remainingExcessKw);
      postBatteryGridKw = interval.consumptionKw - dischargeKw;

      return {
        timestamp: interval.timestamp,
        originalKw: interval.consumptionKw,
        shavedKw: postBatteryGridKw
      };
    }

    return {
      timestamp: interval.timestamp,
      originalKw: interval.consumptionKw,
      shavedKw: postBatteryGridKw
    };
  });

  const achievedComplianceDataset =
    exceedanceEnergyKwhBefore === 0
      ? 1
      : 1 - exceedanceEnergyKwhAfter / exceedanceEnergyKwhBefore;
  const dailyComplianceValues = Array.from(dailyTotals.values()).map(({ before, after }) =>
    before === 0 ? 1 : 1 - after / before
  );
  const achievedComplianceDailyAverage =
    dailyComplianceValues.length === 0
      ? 1
      : dailyComplianceValues.reduce((sum, value) => sum + value, 0) / dailyComplianceValues.length;

  return {
    optionLabel:
      optionLabel ?? BATTERY_OPTIONS.find((b) => b.capacityKwh === batteryCapacityKwh)?.label ?? `${batteryCapacityKwh} kWh`,
    capacityKwh: batteryCapacityKwh,
    exceedanceIntervalsBefore,
    exceedanceIntervalsAfter,
    exceedanceEnergyKwhBefore,
    exceedanceEnergyKwhAfter,
    achievedComplianceDataset,
    achievedComplianceDailyAverage,
    achievedCompliance: achievedComplianceDataset,
    maxRemainingExcessKw,
    maxChargeKw,
    maxDischargeKw,
    endingSocKwh: soc,
    shavedSeries
  };
}

export function simulateAllScenarios(
  intervals: ProcessedInterval[],
  sizingKwNeeded: number,
  targetKwhOrConfig?: number | SimulationConfig,
  config?: SimulationConfig
): ScenarioResult[] {
  const targetKwh = typeof targetKwhOrConfig === 'number' ? targetKwhOrConfig : sizingKwNeeded;
  const effectiveConfig = typeof targetKwhOrConfig === 'number' ? config : targetKwhOrConfig;
  const options = generateScenarioOptions({ targetKwh });
  const maxExcessKw = Math.max(0, ...intervals.map((interval) => interval.excessKw));
  return options.map((option) =>
    simulateSingleScenario(intervals, option.capacityKwh, sizingKwNeeded, maxExcessKw, effectiveConfig, option.label)
  );
}

export function findHighestPeakDay(intervals: ProcessedInterval[]): string | null {
  if (intervals.length === 0) return null;

  const dailyPeakKw = new Map<string, number>();

  intervals.forEach((interval) => {
    const day = getLocalDayIso(interval.timestamp, 'Europe/Amsterdam');
    const currentPeakKw = dailyPeakKw.get(day) ?? 0;
    dailyPeakKw.set(day, Math.max(currentPeakKw, interval.consumptionKw));
  });

  let highestPeakDay: string | null = null;
  let highestPeakKw = -Infinity;

  dailyPeakKw.forEach((peakKw, day) => {
    if (peakKw > highestPeakKw) {
      highestPeakKw = peakKw;
      highestPeakDay = day;
    }
  });

  return highestPeakDay;
}

export function simulatePvScenario(
  intervals: ProcessedInterval[],
  batteryCapacityKwh: number,
  config?: PvSimulationConfig,
  optionLabel?: string
): ScenarioResult {
  const effectiveConfig: PvSimulationConfig = {
    ...config,
    strategy: config?.strategy ?? 'SELF_CONSUMPTION_ONLY',
    trading: config?.trading ?? buildDefaultTradingConfig(config?.strategy ?? 'SELF_CONSUMPTION_ONLY'),
    captureSocSeries: config?.captureSocSeries ?? true
  };
  const metrics = simulatePvBattery(intervals, batteryCapacityKwh, effectiveConfig);

  return {
    optionLabel:
      optionLabel ?? BATTERY_OPTIONS.find((b) => b.capacityKwh === batteryCapacityKwh)?.label ?? `${batteryCapacityKwh} kWh`,
    capacityKwh: batteryCapacityKwh,
    pvAnalysisMode: metrics.mode,
    pvStrategy: metrics.strategy,
    limitations: metrics.limitations,
    exceedanceIntervalsBefore: metrics.exportIntervalsBefore,
    exceedanceIntervalsAfter: metrics.exportIntervalsAfter,
    exceedanceEnergyKwhBefore: metrics.exportedEnergyBeforeKwh,
    exceedanceEnergyKwhAfter: metrics.exportedEnergyAfterKwh,
    achievedComplianceDataset:
      metrics.mode === 'FULL_PV'
        ? metrics.selfConsumptionRatio ?? metrics.exportReduction
        : metrics.batteryUtilizationAgainstExport,
    achievedComplianceDailyAverage:
      metrics.mode === 'FULL_PV'
        ? metrics.selfSufficiency ?? metrics.exportReduction
        : metrics.exportReduction,
    achievedCompliance:
      metrics.mode === 'FULL_PV'
        ? metrics.selfConsumptionRatio ?? metrics.exportReduction
        : metrics.batteryUtilizationAgainstExport,
    maxRemainingExcessKw: metrics.maxRemainingExportKw,
    maxChargeKw: metrics.maxChargeKw,
    maxDischargeKw: metrics.maxDischargeKw,
    endingSocKwh: metrics.endingSocKwh,
    shavedSeries: [],
    totalPvKwh: metrics.totalPvKwh,
    totalConsumptionKwh: metrics.totalConsumptionKwh,
    selfConsumptionBeforeKwh: metrics.directSelfConsumptionBeforeKwh,
    selfConsumptionAfterKwh: metrics.selfConsumptionAfterKwh,
    importedEnergyBeforeKwh: metrics.importedEnergyBeforeKwh,
    importedEnergyAfterKwh: metrics.importedEnergyAfterKwh,
    exportedEnergyBeforeKwh: metrics.exportedEnergyBeforeKwh,
    exportedEnergyAfterKwh: metrics.exportedEnergyAfterKwh,
    immediateExportedKwh: metrics.immediateExportedKwh,
    capturedExportEnergyKwh: metrics.capturedExportEnergyKwh,
    shiftedExportedLaterKwh: metrics.shiftedExportedLaterKwh,
    storedPvUsedOnsiteKwh: metrics.storedPvUsedOnsiteKwh,
    totalUsefulDischargedEnergyKwh: metrics.totalUsefulDischargedEnergyKwh,
    batteryUtilizationAgainstExport: metrics.batteryUtilizationAgainstExport,
    achievedSelfConsumption: metrics.selfConsumptionRatio,
    selfSufficiency: metrics.selfSufficiency,
    importReductionKwh: metrics.importReductionKwh,
    exportReduction: metrics.exportReduction,
    avoidedImportValueEur: metrics.avoidedImportValueEur,
    tradingExportValueEur: metrics.tradingExportValueEur,
    totalEconomicValueEur: metrics.totalEconomicValueEur,
    socSeries: metrics.socSeries
  };
}

export function simulateAllPvScenarios(
  intervals: ProcessedInterval[],
  targetKwhOrConfig?: number | PvSimulationConfig,
  config?: PvSimulationConfig
): ScenarioResult[] {
  const fallbackTargetKwh = Math.max(
    64,
    ...intervals.map((interval) => Math.max(0, interval.exportKwh ?? interval.pvKwh ?? 0) * 4)
  );
  const targetKwh = typeof targetKwhOrConfig === 'number' ? targetKwhOrConfig : fallbackTargetKwh;
  const effectiveConfig = typeof targetKwhOrConfig === 'number' ? config : targetKwhOrConfig;
  const options = generateScenarioOptions({ targetKwh });
  return options.map((option) => simulatePvScenario(intervals, option.capacityKwh, effectiveConfig, option.label));
}

export function buildPvSummaryFromScenario(scenario: ScenarioResult | null): PvSummary | null {
  if (!scenario) return null;

  return {
    mode: scenario.pvAnalysisMode ?? 'EXPORT_ONLY',
    strategy: scenario.pvStrategy ?? 'SELF_CONSUMPTION_ONLY',
    warnings: scenario.limitations ?? [],
    totalPvKwh: scenario.totalPvKwh ?? null,
    totalConsumptionKwh: scenario.totalConsumptionKwh ?? 0,
    selfConsumptionBeforeKwh: scenario.selfConsumptionBeforeKwh ?? null,
    selfConsumptionAfterKwh: scenario.selfConsumptionAfterKwh ?? null,
    importedBefore: scenario.importedEnergyBeforeKwh ?? 0,
    importedAfter: scenario.importedEnergyAfterKwh ?? 0,
    exportBefore: scenario.exportedEnergyBeforeKwh ?? 0,
    exportAfter: scenario.exportedEnergyAfterKwh ?? 0,
    immediateExportedKwh: scenario.immediateExportedKwh ?? 0,
    capturedExportEnergyKwh: scenario.capturedExportEnergyKwh ?? 0,
    shiftedExportedLaterKwh: scenario.shiftedExportedLaterKwh ?? 0,
    storedPvUsedOnsiteKwh: scenario.storedPvUsedOnsiteKwh ?? 0,
    totalUsefulDischargedEnergyKwh: scenario.totalUsefulDischargedEnergyKwh ?? 0,
    batteryUtilizationAgainstExport: scenario.batteryUtilizationAgainstExport ?? 0,
    selfConsumptionRatio: scenario.achievedSelfConsumption ?? null,
    selfSufficiency: scenario.selfSufficiency ?? null,
    importReductionKwh: scenario.importReductionKwh ?? 0,
    exportReduction: scenario.exportReduction ?? 0,
    avoidedImportValueEur: scenario.avoidedImportValueEur ?? null,
    tradingExportValueEur: scenario.tradingExportValueEur ?? null,
    totalEconomicValueEur: scenario.totalEconomicValueEur ?? null
  };
}


