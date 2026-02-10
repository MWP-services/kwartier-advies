import { BATTERY_OPTIONS, type ProcessedInterval } from './calculations';

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
  shavedSeries: { timestamp: string; originalKw: number; shavedKw: number }[];
}

export function simulateSingleScenario(
  intervals: ProcessedInterval[],
  batteryCapacityKwh: number,
  sizingKwNeeded: number,
  maxExcessKw: number,
  config?: SimulationConfig
): ScenarioResult {
  const powerCapKw =
    config?.powerCapKw ??
    (sizingKwNeeded > 0
      ? sizingKwNeeded
      : Math.min(maxExcessKw, batteryCapacityKwh / 0.5));
  const initialSocRatio = config?.initialSocRatio ?? 0.5;
  const chargeEfficiency = 0.95;
  const contractKw = Math.max(0, ...intervals.map((interval) => interval.consumptionKw - interval.excessKw));

  let soc = batteryCapacityKwh * initialSocRatio;
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
    const chargeKwh = Math.min(headroomKw, powerCapKw) * 0.25 * chargeEfficiency;
    soc = Math.min(batteryCapacityKwh, soc + chargeKwh);

    if (interval.excessKw > 0) {
      exceedanceIntervalsBefore += 1;
      exceedanceEnergyKwhBefore += interval.excessKwh;
      dayTotal.before += interval.excessKwh;

      const dischargeNeedKwh = Math.min(interval.excessKw, powerCapKw) * 0.25;
      const deliveredKwh = Math.min(dischargeNeedKwh, soc);
      soc -= deliveredKwh;
      const shavedKw = deliveredKwh / 0.25;

      const remainingExcessKw = interval.excessKw - deliveredKwh / 0.25;
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
    optionLabel: BATTERY_OPTIONS.find((b) => b.capacityKwh === batteryCapacityKwh)?.label ?? `${batteryCapacityKwh} kWh`,
    capacityKwh: batteryCapacityKwh,
    exceedanceIntervalsBefore,
    exceedanceIntervalsAfter,
    exceedanceEnergyKwhBefore,
    exceedanceEnergyKwhAfter,
    achievedComplianceDataset,
    achievedComplianceDailyAverage,
    achievedCompliance: achievedComplianceDataset,
    maxRemainingExcessKw,
    shavedSeries
  };
}

export function simulateAllScenarios(
  intervals: ProcessedInterval[],
  sizingKwNeeded: number,
  config?: SimulationConfig
): ScenarioResult[] {
  const maxExcessKw = Math.max(0, ...intervals.map((interval) => interval.excessKw));
  return BATTERY_OPTIONS.map((option) =>
    simulateSingleScenario(intervals, option.capacityKwh, sizingKwNeeded, maxExcessKw, config)
  );
}

export function findHighestPeakDay(intervals: ProcessedInterval[]): string | null {
  const totalsByDay = new Map<string, number>();
  intervals.forEach((interval) => {
    const day = interval.timestamp.slice(0, 10);
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
