import { describe, expect, it } from 'vitest';
import { processIntervals } from '@/lib/calculations';
import {
  generateScenarioOptions,
  simulateAllScenarios,
  simulateSingleScenario
} from '@/lib/simulation';

const rows = Array.from({ length: 32 }, (_, idx) => ({
  timestamp: new Date(Date.UTC(2024, 0, 1, 0, idx * 15)).toISOString(),
  consumptionKwh: idx % 8 === 0 || idx % 8 === 1 ? 180 : 60
}));

describe('simulation', () => {
  it('recharges and discharges repeatedly instead of only once', () => {
    const intervals = processIntervals(rows, 500);
    const result = simulateSingleScenario(intervals, 64, 300, 300, { initialSocRatio: 0 });

    expect(result.exceedanceEnergyKwhAfter).toBeLessThan(result.exceedanceEnergyKwhBefore);
    expect(result.achievedComplianceDataset).toBeGreaterThan(0);
    expect(result.exceedanceIntervalsAfter).toBeLessThan(result.exceedanceIntervalsBefore);
  });

  it('returns a compact relevant scenario set including fixed jumps', () => {
    const intervals = processIntervals(rows, 500);
    const scenarios = simulateAllScenarios(intervals, 200, 500);
    expect(scenarios.length).toBeLessThanOrEqual(12);
    expect(scenarios.find((scenario) => scenario.capacityKwh === 2090)).toBeTruthy();
    expect(scenarios.find((scenario) => scenario.capacityKwh === 5015)).toBeTruthy();
  });

  it('reports dataset and daily average compliance separately', () => {
    const unevenRows = [
      ...Array.from({ length: 8 }, (_, idx) => ({
        timestamp: new Date(Date.UTC(2024, 0, 1, 0, idx * 15)).toISOString(),
        consumptionKwh: idx < 2 ? 220 : 50
      })),
      ...Array.from({ length: 8 }, (_, idx) => ({
        timestamp: new Date(Date.UTC(2024, 0, 2, 0, idx * 15)).toISOString(),
        consumptionKwh: idx < 4 ? 140 : 60
      }))
    ];

    const intervals = processIntervals(unevenRows, 500);
    const result = simulateSingleScenario(intervals, 64, 300, 380, { initialSocRatio: 0.25 });

    expect(result.achievedComplianceDataset).toBeGreaterThanOrEqual(0);
    expect(result.achievedComplianceDataset).toBeLessThanOrEqual(1);
    expect(result.achievedComplianceDailyAverage).toBeGreaterThanOrEqual(0);
    expect(result.achievedComplianceDailyAverage).toBeLessThanOrEqual(1);
  });

  it('larger battery achieves equal or better compliance than smaller battery', () => {
    const intervals = processIntervals(rows, 500);
    const small = simulateSingleScenario(intervals, 64, 300, 300, { initialSocRatio: 0 });
    const large = simulateSingleScenario(intervals, 261, 300, 300, { initialSocRatio: 0 });

    expect(large.achievedComplianceDataset).toBeGreaterThanOrEqual(small.achievedComplianceDataset);
  });

  it('target=500 includes nearby modular 2x261 (522 kWh)', () => {
    const options = generateScenarioOptions({ targetKwh: 500, maxTotalOptions: 12 });
    expect(options.find((option) => option.label === '2x261 (522 kWh)')).toBeTruthy();
  });

  it('target=70 includes close modular options around 64/96', () => {
    const options = generateScenarioOptions({ targetKwh: 70, maxTotalOptions: 12 });
    const has1x96 = options.some((option) => option.label === '1x96 (96 kWh)');
    const has2x64 = options.some((option) => option.label === '2x64 (128 kWh)');
    expect(has1x96 || has2x64).toBe(true);
  });

  it('scenario options are deduplicated by capacity', () => {
    const options = generateScenarioOptions({ targetKwh: 500, maxTotalOptions: 12 });
    const uniqueCapacities = new Set(options.map((option) => option.capacityKwh));
    expect(uniqueCapacities.size).toBe(options.length);
  });
});
