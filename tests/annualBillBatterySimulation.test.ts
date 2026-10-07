import { describe, expect, it } from 'vitest';
import { simulateAnnualBillBattery as simulate } from '../src/lib/annual-bill/simulateAnnualBillBattery';
import { buildAnnualBillSyntheticProfile } from '../src/lib/annual-bill/buildAnnualBillSyntheticProfile';
import type { BatterySpec } from '../lib/batterySpecs';

const spec: BatterySpec = { capacityKwh: 10, maxChargeKw: 4, maxDischargeKw: 2, roundTripEfficiency: 0.81 };
const rows = (pairs: number[][]) => pairs.map(([importKwh, exportKwh], i) => ({ start: new Date(Date.UTC(2025, 0, 1) + i * 900000).toISOString(), importKwh, exportKwh }));
describe('annual battery physics', () => {
  it('enforces independent quarter-hour charge and discharge power', () => {
    const result = simulate(rows([[0, 100], [100, 0]]), spec);
    expect(result.annualChargedFromSolarKwh).toBe(1);
    expect(result.annualDeliveredFromBatteryKwh).toBe(0.5);
    expect(result.unusedExportBecausePowerLimitKwh).toBe(99);
  });
  it.each([0, 0.1, 0.5, 0.9])('preserves energy, capacity and reserve with %s emergency fraction', emergency => {
    const result = simulate(buildAnnualBillSyntheticProfile(4200, 1800), spec, { emergencyReserveFraction: emergency });
    expect(result.minimumObservedSocKwh).toBeGreaterThanOrEqual((0.1 + emergency) * 10 - 1e-9);
    expect(result.maximumObservedSocKwh).toBeLessThanOrEqual(10 + 1e-9);
    expect(result.annualChargedFromSolarKwh).toBeCloseTo(result.annualDeliveredFromBatteryKwh + result.annualLossesKwh + result.endingSocKwh - result.startingSocKwh, 7);
    expect(result.annualGridImportReductionKwh).toBe(result.annualDeliveredFromBatteryKwh);
    expect(result.annualExportReductionKwh).toBe(result.annualChargedFromSolarKwh);
    expect(result.annualLossesKwh).toBeGreaterThanOrEqual(0);
    expect(result.equivalentCyclesPerYear).toBeCloseTo(result.usableCapacityKwh > 0 ? result.annualDeliveredFromBatteryKwh / 0.9 / result.usableCapacityKwh : 0, 7);
  });
  it('applies the square-root round-trip split exactly once in each direction', () => {
    const result = simulate(rows([[0, 1], [100, 0]]), { ...spec, maxDischargeKw: 100 });
    expect(result.annualDeliveredFromBatteryKwh).toBeCloseTo(0.81);
    expect(result.annualLossesKwh).toBeCloseTo(0.19);
    expect(result.endingSocKwh).toBeCloseTo(1);
  });
  it('never obtains artificial benefit from simultaneous import/export, even after warm-up', () => {
    expect(simulate(rows([[100, 100]]), spec).annualGridImportReductionKwh).toBe(0);
    const result = simulate(rows([[5, 10], [10, 5]]), { ...spec, maxChargeKw: 100, maxDischargeKw: 100 });
    expect(result.annualExportReductionKwh).toBeCloseTo(5);
    expect(result.annualGridImportReductionKwh).toBeCloseTo(4.05);
  });
  it('reports year two using energy carried from year-one warm-up, with no free initial energy', () => {
    const result = simulate(rows([[100, 0], [0, 1]]), { ...spec, maxDischargeKw: 100 });
    expect(result.startingSocKwh).toBeCloseTo(1.9);
    expect(result.annualDeliveredFromBatteryKwh).toBeCloseTo(0.81);
    expect(result.endingSocKwh).toBeCloseTo(1.9);
    expect(simulate(rows([[100, 0]]), spec).annualGridImportReductionKwh).toBe(0);
  });
  it('tracks export blocked by a full battery independently of power limits', () => {
    const result = simulate(rows([[0, 100]]), { ...spec, maxChargeKw: 1000 });
    expect(result.annualChargedFromSolarKwh).toBeCloseTo(0);
    expect(result.unusedExportBecauseBatteryFullKwh).toBeCloseTo(100);
    expect(result.maximumObservedSocKwh).toBeCloseTo(10);
  });
  it('larger capacity cannot reduce import reduction at identical power and efficiency', () => {
    const profile = buildAnnualBillSyntheticProfile(35000, 16000, 'business');
    let previous = 0;
    for (const capacityKwh of [1, 5, 10, 20, 40, 64, 96, 232]) {
      const result = simulate(profile, { ...spec, capacityKwh, maxChargeKw: 50, maxDischargeKw: 50 });
      expect(result.annualGridImportReductionKwh + 1e-8).toBeGreaterThanOrEqual(previous);
      previous = result.annualGridImportReductionKwh;
    }
  });
  it('rejects invalid physics and invalid interval energy', () => {
    expect(() => simulate(rows([[0, -1]]), spec)).toThrow();
    expect(() => simulate([], { ...spec, roundTripEfficiency: 1.1 })).toThrow();
    expect(() => simulate([], { ...spec, maxChargeKw: Infinity })).toThrow();
    expect(() => simulate([], spec, { emergencyReserveFraction: -0.1 })).toThrow();
  });
});
