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
    expect(result.exceedanceIntervalsAfter).toBeLessThanOrEqual(result.exceedanceIntervalsBefore);
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

  it('includes smaller-than-target options so impact progression remains visible', () => {
    const options = generateScenarioOptions({ targetKwh: 500, maxTotalOptions: 12 });

    expect(options.some((option) => option.capacityKwh < 500)).toBe(true);
    expect(options.some((option) => option.capacityKwh >= 500)).toBe(true);
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

  it('charges 64 kWh battery with its own max charge limit (32 kW)', () => {
    const chargeRows = [
      { timestamp: '2024-01-01T00:00:00.000Z', consumptionKwh: 43 * 0.25 },
      { timestamp: '2024-01-01T00:15:00.000Z', consumptionKwh: 2 * 0.25 }
    ];
    const intervals = processIntervals(chargeRows, 43);
    const result = simulateSingleScenario(intervals, 64, 300, 300, { initialSocRatio: 0 });

    expect(result.maxChargeKw).toBe(32);
    expect(result.endingSocKwh).toBeCloseTo(32 * 0.25 * Math.sqrt(0.9), 5);
    expect(result.shavedSeries[1].originalKw).toBeCloseTo(2, 5);
    expect(result.shavedSeries[1].shavedKw).toBeCloseTo(34, 5);
  });

  it('charges 96 kWh battery up to headroom when headroom is below max charge', () => {
    const chargeRows = [
      { timestamp: '2024-01-01T00:00:00.000Z', consumptionKwh: 43 * 0.25 },
      { timestamp: '2024-01-01T00:15:00.000Z', consumptionKwh: 2 * 0.25 }
    ];
    const intervals = processIntervals(chargeRows, 43);
    const result = simulateSingleScenario(intervals, 96, 300, 300, { initialSocRatio: 0 });

    expect(result.maxChargeKw).toBe(48);
    expect(result.endingSocKwh).toBeCloseTo(41 * 0.25 * Math.sqrt(0.9), 5);
  });

  it('limits discharge by battery maxDischargeKw (64 kWh => 30 kW)', () => {
    const dischargeRows = [{ timestamp: '2024-01-01T00:00:00.000Z', consumptionKwh: 143 * 0.25 }];
    const intervals = processIntervals(dischargeRows, 43);
    const result = simulateSingleScenario(intervals, 64, 300, 300, { initialSocRatio: 1 });

    expect(result.maxDischargeKw).toBe(30);
    expect(result.exceedanceEnergyKwhBefore).toBeCloseTo(25, 5);
    expect(result.exceedanceEnergyKwhAfter).toBeCloseTo(17.5, 5);
  });

  it('uses each scenario battery power capability by default (no fixed residual across all batteries)', () => {
    const onePeakRows = [{ timestamp: '2024-01-01T00:00:00.000Z', consumptionKwh: 143 * 0.25 }];
    const intervals = processIntervals(onePeakRows, 43); // excess = 100 kW => 25 kWh in one interval

    const small = simulateSingleScenario(intervals, 64, 60, 100, { initialSocRatio: 1 });
    const large = simulateSingleScenario(intervals, 261, 60, 100, { initialSocRatio: 1 });

    expect(small.exceedanceEnergyKwhAfter).toBeCloseTo(17.5, 5); // 30 kW discharge limit => 7.5 kWh shaved
    expect(large.exceedanceEnergyKwhAfter).toBeCloseTo(0, 5); // 125 kW discharge limit can shave full 100 kW interval
    expect(large.exceedanceEnergyKwhAfter).toBeLessThan(small.exceedanceEnergyKwhAfter);
  });

  it('uses sizing discharge efficiency consistently so safetyFactor=1 can fully eliminate a matching exceedance', () => {
    const beforeExcessKwh = 5.72;
    const efficiency = 0.84;
    const kWhNeeded = beforeExcessKwh / efficiency;
    const rows = [{ timestamp: '2024-01-01T00:00:00.000Z', consumptionKwh: (43 + beforeExcessKwh / 0.25) * 0.25 }];
    const intervals = processIntervals(rows, 43);

    const result = simulateSingleScenario(intervals, 64, 100, 100, {
      initialSocRatio: kWhNeeded / 64,
      dischargeEfficiency: efficiency
    });

    expect(result.exceedanceEnergyKwhBefore).toBeCloseTo(beforeExcessKwh, 6);
    expect(result.exceedanceEnergyKwhAfter).toBeLessThan(1e-6);
  });

  it('clamps after exceedance to zero when safety factor makes battery-side budget larger than before energy', () => {
    const beforeExcessKwh = 5.72;
    const efficiency = 0.84;
    const safetyFactor = 1.2;
    const kWhNeeded = (beforeExcessKwh / efficiency) * safetyFactor;
    const rows = [{ timestamp: '2024-01-01T00:00:00.000Z', consumptionKwh: (43 + beforeExcessKwh / 0.25) * 0.25 }];
    const intervals = processIntervals(rows, 43);

    const result = simulateSingleScenario(intervals, 64, 100, 100, {
      initialSocRatio: kWhNeeded / 64,
      dischargeEfficiency: efficiency
    });

    expect(result.exceedanceEnergyKwhBefore).toBeCloseTo(beforeExcessKwh, 6);
    expect(result.exceedanceEnergyKwhAfter).toBeLessThan(1e-6);
  });
});
