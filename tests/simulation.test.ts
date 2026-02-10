import { describe, expect, it } from 'vitest';
import { processIntervals } from '@/lib/calculations';
import { simulateAllScenarios, simulateSingleScenario } from '@/lib/simulation';

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

  it('returns all predefined battery scenarios', () => {
    const intervals = processIntervals(rows, 500);
    const scenarios = simulateAllScenarios(intervals, 200);
    expect(scenarios).toHaveLength(5);
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
});
