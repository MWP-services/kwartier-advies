import { BATTERY_OPTIONS, type ProcessedInterval } from './calculations';
import { getBatterySpecForCapacity } from './batterySpecs';
import { getLocalDayIso } from './datetime';

export interface SimulationConfig {
  powerCapKw?: number;
  initialSocRatio?: number;
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
    const closestPerBase = allOptions
      .filter((option) => option.capacityKwh % baseSize === 0)
      .sort(relevanceSort)[0];
    if (closestPerBase) selected.set(closestPerBase.capacityKwh, closestPerBase);
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
  const powerCapKw = config?.powerCapKw ?? (sizingKwNeeded > 0 ? sizingKwNeeded : Math.min(maxExcessKw, batteryCapacityKwh / 0.5));
  const initialSocRatio = config?.initialSocRatio ?? 0.5;
  const spec = getBatterySpecForCapacity(batteryCapacityKwh);
  const chargeEff = Math.sqrt(spec.roundTripEfficiency);
  const dischargeEff = Math.sqrt(spec.roundTripEfficiency);
  const maxChargeKw = spec.maxChargeKw;
  const maxDischargeKw = spec.maxDischargeKw;
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

    if (interval.excessKw > 0) {
      exceedanceIntervalsBefore += 1;
      exceedanceEnergyKwhBefore += interval.excessKwh;
      dayTotal.before += interval.excessKwh;

      const dischargeLimitKw = Math.min(maxDischargeKw, powerCapKw);
      const dischargeNeedKwh = Math.min(interval.excessKw, dischargeLimitKw) * 0.25;
      const deliveredFromSocKwh = Math.min(dischargeNeedKwh / dischargeEff, soc);
      soc -= deliveredFromSocKwh;
      const deliveredToLoadKwh = deliveredFromSocKwh * dischargeEff;
      const shavedKw = deliveredToLoadKwh / 0.25;

      const remainingExcessKw = Math.max(0, interval.excessKw - shavedKw);
      if (remainingExcessKw > 0) {
        exceedanceIntervalsAfter += 1;
        exceedanceEnergyKwhAfter += remainingExcessKw * 0.25;
        dayTotal.after += remainingExcessKw * 0.25;
      }
      maxRemainingExcessKw = Math.max(maxRemainingExcessKw, remainingExcessKw);

      return {
        timestamp: interval.timestamp,
        originalKw: interval.consumptionKw,
        shavedKw: interval.consumptionKw - shavedKw
      };
    }

    return {
      timestamp: interval.timestamp,
      originalKw: interval.consumptionKw,
      shavedKw: interval.consumptionKw
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
