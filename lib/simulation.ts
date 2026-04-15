import { BATTERY_OPTIONS, derivePvIntervalFlow, type ProcessedInterval } from './calculations';
import { getBatterySpecForCapacity } from './batterySpecs';
import { getLocalDayIso } from './datetime';

export interface SimulationConfig {
  powerCapKw?: number;
  initialSocRatio?: number;
  // Use the sizing efficiency directly as battery-side -> grid-side discharge efficiency.
  dischargeEfficiency?: number;
}

export interface ScenarioResult {
  optionLabel: string;
  capacityKwh: number;
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
  totalPvKwh?: number;
  totalConsumptionKwh?: number;
  selfConsumptionBeforeKwh?: number;
  selfConsumptionAfterKwh?: number;
  importedEnergyBeforeKwh?: number;
  importedEnergyAfterKwh?: number;
  exportedEnergyBeforeKwh?: number;
  exportedEnergyAfterKwh?: number;
  achievedSelfConsumption?: number;
  selfSufficiency?: number;
  exportReduction?: number;
  socSeries?: { timestamp: string; socKwh: number }[];
}

export interface PvSummary {
  totalPvKwh: number;
  totalConsumptionKwh: number;
  selfConsumptionBeforeKwh: number;
  selfConsumptionAfterKwh: number;
  importedBefore: number;
  importedAfter: number;
  exportBefore: number;
  exportAfter: number;
  selfConsumptionRatio: number;
  selfSufficiency: number;
  exportReduction: number;
}

export interface ScenarioOption {
  capacityKwh: number;
  label: string;
  modular?: {
    baseSize: number;
    count: number;
  };
}

const MODULAR_BASE_SIZES = [64, 96, 261];
const FIXED_SCENARIO_OPTIONS: ScenarioOption[] = [
  { capacityKwh: 64, label: '64 kWh' },
  { capacityKwh: 96, label: '96 kWh' },
  { capacityKwh: 261, label: '261 kWh' },
  { capacityKwh: 2090, label: '2.09 MWh (2090 kWh)' },
  { capacityKwh: 5015, label: '5.015 MWh (5015 kWh)' }
];

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

    // Also include one smaller and one larger option per base so charts show impact progression.
    const belowTarget = [...optionsForBase].reverse().find((option) => option.capacityKwh < targetKwh);
    const aboveTarget = optionsForBase.find((option) => option.capacityKwh > targetKwh);
    if (belowTarget) selected.set(belowTarget.capacityKwh, belowTarget);
    if (aboveTarget) selected.set(aboveTarget.capacityKwh, aboveTarget);
  });

  allOptions
    .sort(relevanceSort)
    .forEach((option) => {
      if (selected.size >= maxTotalOptions) return;
      selected.set(option.capacityKwh, option);
    });

  return Array.from(selected.values())
    .slice(0, maxTotalOptions)
    .sort((a, b) => a.capacityKwh - b.capacityKwh);
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
  const spec = getBatterySpecForCapacity(batteryCapacityKwh);
  const hasDischargeEfficiencyOverride = config?.dischargeEfficiency != null;
  const dischargeEff = hasDischargeEfficiencyOverride
    ? Math.max(0, Math.min(1, config?.dischargeEfficiency ?? 1))
    : Math.sqrt(spec.roundTripEfficiency);
  const chargeEff = hasDischargeEfficiencyOverride ? 1 : Math.sqrt(spec.roundTripEfficiency);
  const maxChargeKw = spec.maxChargeKw;
  const maxDischargeKw = spec.maxDischargeKw;
  // By default simulate each scenario with its own physical power capability.
  // A global powerCapKw can still be provided explicitly through config when needed.
  const powerCapKw = config?.powerCapKw ?? Math.min(maxExcessKw, maxDischargeKw);
  const batteryCapacityLimitKwh = spec.capacityKwh;
  const contractKw = Math.max(0, ...intervals.map((interval) => interval.consumptionKw - interval.excessKw));

  let soc = batteryCapacityLimitKwh * initialSocRatio;
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
    const chargeKwh = actualChargeKw * 0.25 * chargeEff;
    soc = Math.min(batteryCapacityLimitKwh, soc + chargeKwh);
    // Show the actual post-battery grid load in overlays: charging increases grid load, discharge reduces it.
    let postBatteryGridKw = interval.consumptionKw + actualChargeKw;

    if (interval.excessKw > 0) {
      exceedanceIntervalsBefore += 1;
      exceedanceEnergyKwhBefore += interval.excessKwh;
      dayTotal.before += interval.excessKwh;

      const dischargeLimitKw = Math.min(maxDischargeKw, powerCapKw);
      const dischargeNeedKwh = Math.min(interval.excessKw, dischargeLimitKw) * 0.25;
      const deliveredFromSocKwh = Math.min(dischargeNeedKwh / dischargeEff, soc);
      soc -= deliveredFromSocKwh;
      const deliveredToLoadKwh = deliveredFromSocKwh * dischargeEff;
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

export function simulatePvScenario(
  intervals: ProcessedInterval[],
  batteryCapacityKwh: number,
  config?: SimulationConfig,
  optionLabel?: string
): ScenarioResult {
  const initialSocRatio = config?.initialSocRatio ?? 0;
  const spec = getBatterySpecForCapacity(batteryCapacityKwh);
  const hasDischargeEfficiencyOverride = config?.dischargeEfficiency != null;
  const dischargeEff = hasDischargeEfficiencyOverride
    ? Math.max(0, Math.min(1, config?.dischargeEfficiency ?? 1))
    : Math.sqrt(spec.roundTripEfficiency);
  const chargeEff = hasDischargeEfficiencyOverride ? 1 : Math.sqrt(spec.roundTripEfficiency);
  const intervalHours = 0.25;

  let soc = spec.capacityKwh * initialSocRatio;
  let exportedEnergyBeforeKwh = 0;
  let exportedEnergyAfterKwh = 0;
  let importedEnergyBeforeKwh = 0;
  let importedEnergyAfterKwh = 0;
  let selfConsumptionBeforeKwh = 0;
  let selfConsumptionAfterKwh = 0;
  let totalPvKwh = 0;
  let totalConsumptionKwh = 0;
  let exportIntervalsBefore = 0;
  let exportIntervalsAfter = 0;
  let maxRemainingExportKw = 0;
  const socSeries: { timestamp: string; socKwh: number }[] = [];

  intervals.forEach((interval) => {
    const flow = derivePvIntervalFlow(interval);
    const pvKwh = Math.max(0, interval.pvKwh ?? 0);
    const consumptionKwh = Math.max(0, interval.consumptionKwh ?? 0);
    const maxChargeKwh = spec.maxChargeKw * intervalHours;
    const maxDischargeKwh = spec.maxDischargeKw * intervalHours;

    totalPvKwh += pvKwh;
    totalConsumptionKwh += consumptionKwh;
    selfConsumptionBeforeKwh += flow.directSelfConsumptionKwh;
    importedEnergyBeforeKwh += flow.loadDeficitKwh;
    exportedEnergyBeforeKwh += flow.surplusKwh;
    if (flow.surplusKwh > 0) {
      exportIntervalsBefore += 1;
    }

    const remainingCapacityKwh = Math.max(0, spec.capacityKwh - soc);
    const chargeInputLimitKwh = chargeEff > 0 ? remainingCapacityKwh / chargeEff : 0;
    const chargeFromPvKwh = Math.min(flow.surplusKwh, maxChargeKwh, chargeInputLimitKwh);
    soc = Math.min(spec.capacityKwh, soc + chargeFromPvKwh * chargeEff);

    const batteryDeliverableKwh = Math.min(maxDischargeKwh, soc * dischargeEff);
    const dischargeToLoadKwh = Math.min(flow.loadDeficitKwh, batteryDeliverableKwh);
    if (dischargeEff > 0) {
      soc = Math.max(0, soc - dischargeToLoadKwh / dischargeEff);
    }

    importedEnergyAfterKwh += Math.max(0, flow.loadDeficitKwh - dischargeToLoadKwh);
    const exportedAfterKwh = Math.max(0, flow.surplusKwh - chargeFromPvKwh);
    exportedEnergyAfterKwh += exportedAfterKwh;
    if (exportedAfterKwh > 0) {
      exportIntervalsAfter += 1;
    }
    maxRemainingExportKw = Math.max(maxRemainingExportKw, exportedAfterKwh / intervalHours);
    selfConsumptionAfterKwh += flow.directSelfConsumptionKwh + dischargeToLoadKwh;
    socSeries.push({ timestamp: interval.timestamp, socKwh: soc });
  });

  const achievedSelfConsumption = totalPvKwh > 0 ? selfConsumptionAfterKwh / totalPvKwh : 0;
  const selfSufficiency = totalConsumptionKwh > 0 ? selfConsumptionAfterKwh / totalConsumptionKwh : 0;
  const exportReduction =
    exportedEnergyBeforeKwh > 0 ? (exportedEnergyBeforeKwh - exportedEnergyAfterKwh) / exportedEnergyBeforeKwh : 0;

  return {
    optionLabel:
      optionLabel ?? BATTERY_OPTIONS.find((b) => b.capacityKwh === batteryCapacityKwh)?.label ?? `${batteryCapacityKwh} kWh`,
    capacityKwh: batteryCapacityKwh,
    exceedanceIntervalsBefore: exportIntervalsBefore,
    exceedanceIntervalsAfter: exportIntervalsAfter,
    exceedanceEnergyKwhBefore: exportedEnergyBeforeKwh,
    exceedanceEnergyKwhAfter: exportedEnergyAfterKwh,
    achievedComplianceDataset: achievedSelfConsumption,
    achievedComplianceDailyAverage: selfSufficiency,
    achievedCompliance: achievedSelfConsumption,
    maxRemainingExcessKw: maxRemainingExportKw,
    maxChargeKw: spec.maxChargeKw,
    maxDischargeKw: spec.maxDischargeKw,
    endingSocKwh: soc,
    shavedSeries: [],
    totalPvKwh,
    totalConsumptionKwh,
    selfConsumptionBeforeKwh,
    selfConsumptionAfterKwh,
    importedEnergyBeforeKwh,
    importedEnergyAfterKwh,
    exportedEnergyBeforeKwh,
    exportedEnergyAfterKwh,
    achievedSelfConsumption,
    selfSufficiency,
    exportReduction,
    socSeries
  };
}

export function simulateAllPvScenarios(
  intervals: ProcessedInterval[],
  targetKwhOrConfig?: number | SimulationConfig,
  config?: SimulationConfig
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
    totalPvKwh: scenario.totalPvKwh ?? 0,
    totalConsumptionKwh: scenario.totalConsumptionKwh ?? 0,
    selfConsumptionBeforeKwh: scenario.selfConsumptionBeforeKwh ?? 0,
    selfConsumptionAfterKwh: scenario.selfConsumptionAfterKwh ?? 0,
    importedBefore: scenario.importedEnergyBeforeKwh ?? 0,
    importedAfter: scenario.importedEnergyAfterKwh ?? 0,
    exportBefore: scenario.exportedEnergyBeforeKwh ?? 0,
    exportAfter: scenario.exportedEnergyAfterKwh ?? 0,
    selfConsumptionRatio: scenario.achievedSelfConsumption ?? 0,
    selfSufficiency: scenario.selfSufficiency ?? 0,
    exportReduction: scenario.exportReduction ?? 0
  };
}

export function findHighestPeakDay(intervals: ProcessedInterval[]): string | null {
  const totalsByDay = new Map<string, number>();
  intervals.forEach((interval) => {
    const day = getLocalDayIso(interval.timestamp);
    if (!day) return;
    totalsByDay.set(day, (totalsByDay.get(day) ?? 0) + interval.excessKw);
  });

  let highestDay: string | null = null;
  let maxTotal = -1;
  totalsByDay.forEach((total, day) => {
    if (total > maxTotal) {
      maxTotal = total;
      highestDay = day;
    }
  });

  return highestDay;
}
