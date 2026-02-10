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

  let soc = batteryCapacityKwh * initialSocRatio;
  let exceedanceIntervalsBefore = 0;
  let exceedanceIntervalsAfter = 0;
  let exceedanceEnergyKwhBefore = 0;
  let exceedanceEnergyKwhAfter = 0;
  let maxRemainingExcessKw = 0;

  const shavedSeries = intervals.map((interval) => {
    if (interval.excessKw > 0) {
      exceedanceIntervalsBefore += 1;
      exceedanceEnergyKwhBefore += interval.excessKwh;

      const targetShaveKw = Math.min(interval.excessKw, powerCapKw);
      const energyNeededKwh = targetShaveKw * 0.25;
      const energyDeliveredKwh = Math.min(energyNeededKwh, soc);
      const shavedKw = energyDeliveredKwh / 0.25;
      soc -= energyDeliveredKwh;

      const remainingExcessKw = interval.excessKw - shavedKw;
      if (remainingExcessKw > 0) {
        exceedanceIntervalsAfter += 1;
        exceedanceEnergyKwhAfter += remainingExcessKw * 0.25;
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

  const achievedCompliance =
    exceedanceEnergyKwhBefore === 0
      ? 1
      : 1 - exceedanceEnergyKwhAfter / exceedanceEnergyKwhBefore;

  return {
    optionLabel: BATTERY_OPTIONS.find((b) => b.capacityKwh === batteryCapacityKwh)?.label ?? `${batteryCapacityKwh} kWh`,
    capacityKwh: batteryCapacityKwh,
    exceedanceIntervalsBefore,
    exceedanceIntervalsAfter,
    exceedanceEnergyKwhBefore,
    exceedanceEnergyKwhAfter,
    achievedCompliance,
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
