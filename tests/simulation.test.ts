import { describe, expect, it } from 'vitest';
import { processIntervals } from '@/lib/calculations';
import { simulateAllScenarios, simulateSingleScenario } from '@/lib/simulation';

const rows = Array.from({ length: 16 }, (_, idx) => ({
  timestamp: new Date(Date.UTC(2024, 0, 1, 0, idx * 15)).toISOString(),
  consumptionKwh: idx > 3 && idx < 10 ? 180 : 100
}));

describe('simulation', () => {
  it('reduces exceedance energy for sufficiently large battery', () => {
    const intervals = processIntervals(rows, 500);
    const result = simulateSingleScenario(intervals, 261, 200, 300, { initialSocRatio: 1 });

    expect(result.exceedanceEnergyKwhAfter).toBeLessThan(result.exceedanceEnergyKwhBefore);
    expect(result.achievedCompliance).toBeGreaterThan(0);
  });

  it('returns all predefined battery scenarios', () => {
    const intervals = processIntervals(rows, 500);
    const scenarios = simulateAllScenarios(intervals, 200);
    expect(scenarios).toHaveLength(5);
  });
});
