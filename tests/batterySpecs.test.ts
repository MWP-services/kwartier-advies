import { describe, expect, it } from 'vitest';
import { getBatterySpecForCapacity } from '@/lib/batterySpecs';

describe('batterySpecs', () => {
  it.each([[64, 64.3, 32, 30, 0.9], [96, 96.46, 48, 48, 0.9], [232, 232, 115, 115, 0.9], [261, 261.24, 125, 125, 0.9], [2090, 2090, 1000, 1000, 0.9], [5015, 5015.88, 2580, 2580, 0.88]])('records brochure source and verified fields for %s kWh', (key, capacity, charge, discharge, efficiency) => {
    expect(getBatterySpecForCapacity(key)).toMatchObject({ capacityKwh: capacity, maxChargeKw: charge, maxDischargeKw: discharge, roundTripEfficiency: efficiency });
    expect(getBatterySpecForCapacity(key).source).toContain(`public/assets/${key}.pdf`);
  });
  it.each([7.68, 10.24, 12.8, 15.36, 17.92, 20.48, 23.04, 30, 40])('keeps %s kWh fallback where no complete AC system sheet exists', capacity => {
    const spec = getBatterySpecForCapacity(capacity);
    expect(spec.fallback).toBe(true);
    expect(spec.maxChargeKw).toBe(capacity / 2);
    expect(spec.maxDischargeKw).toBe(capacity / 2);
    expect(spec.roundTripEfficiency).toBe(0.9);
    expect(spec.assumptions).toContain('aangenomen');
  });
  it.each([64, 96])('marks missing efficiency as an assumption without discarding verified %s kWh power', capacity => {
    expect(getBatterySpecForCapacity(capacity).fallback).toBe(true);
    expect(getBatterySpecForCapacity(capacity).assumptions).toContain('rendement ontbreekt');
  });
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

  it('returns brochure specs for 232 kWh cabinet family', () => {
    const spec232 = getBatterySpecForCapacity(232);
    expect(spec232.maxChargeKw).toBe(115);
    expect(spec232.maxDischargeKw).toBe(115);
    expect(spec232.roundTripEfficiency).toBe(0.9);
  });

  it('scales modular 232 kWh variants linearly', () => {
    const spec464 = getBatterySpecForCapacity(464);
    expect(spec464.maxChargeKw).toBe(230);
    expect(spec464.maxDischargeKw).toBe(230);
    expect(spec464.roundTripEfficiency).toBe(0.9);
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
