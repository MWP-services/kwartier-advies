import { describe, expect, it } from 'vitest';
import { resolveBatteryPhysics } from '@/lib/batteryPhysics';

describe('battery minimum charge', () => {
  it('always retains 10% without an additional reserve', () => {
    expect(resolveBatteryPhysics(64).minSocKwh).toBeCloseTo(6.43);
  });

  it('adds a 10% reserve above the protected 10%', () => {
    expect(resolveBatteryPhysics(64, { reserveEnergyForTradingKwh: 6.43 }).minSocKwh).toBeCloseTo(12.86);
  });
});
