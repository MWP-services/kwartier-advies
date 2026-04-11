import { describe, expect, it } from 'vitest';
import { getBatterySpecForCapacity } from '@/lib/batterySpecs';

describe('batterySpecs', () => {
  it('returns brochure specs for 64 kWh cabinet family', () => {
    const spec64 = getBatterySpecForCapacity(64);
    expect(spec64.maxChargeKw).toBe(32);
    expect(spec64.maxDischargeKw).toBe(30);
    expect(spec64.roundTripEfficiency).toBe(0.9);
  });

  it('scales modular 64 kWh variants linearly', () => {
    const spec128 = getBatterySpecForCapacity(128);
    const spec192 = getBatterySpecForCapacity(192);

    expect(spec128.maxChargeKw).toBe(64);
    expect(spec128.maxDischargeKw).toBe(60);
    expect(spec128.roundTripEfficiency).toBe(0.9);

    expect(spec192.maxChargeKw).toBe(96);
    expect(spec192.maxDischargeKw).toBe(90);
    expect(spec192.roundTripEfficiency).toBe(0.9);
  });

  it('scales modular 261 kWh variants linearly', () => {
    const spec522 = getBatterySpecForCapacity(522);
    expect(spec522.maxChargeKw).toBe(250);
    expect(spec522.maxDischargeKw).toBe(250);
    expect(spec522.roundTripEfficiency).toBe(0.9);
  });

  it('returns fixed container specs for 5.015 MWh container', () => {
    const spec5015 = getBatterySpecForCapacity(5015.88);
    expect(spec5015.maxChargeKw).toBe(2580);
    expect(spec5015.maxDischargeKw).toBe(2580);
    expect(spec5015.roundTripEfficiency).toBe(0.88);
  });
});

