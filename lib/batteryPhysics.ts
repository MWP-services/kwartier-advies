import { getBatterySpecForCapacity, type BatterySpec } from './batterySpecs';

export interface BatteryPhysicsConfig {
  dischargeEfficiency?: number;
  reserveEnergyForTradingKwh?: number;
  reserveEmptyCapacityForTradingKwh?: number;
}

export interface ResolvedBatteryPhysics {
  spec: BatterySpec;
  chargeEfficiency: number;
  dischargeEfficiency: number;
  minSocKwh: number;
  maxSocKwh: number;
}

export function resolveBatteryPhysics(
  capacityKwh: number,
  config?: BatteryPhysicsConfig
): ResolvedBatteryPhysics {
  const spec = getBatterySpecForCapacity(capacityKwh);
  const hasDischargeEfficiencyOverride = config?.dischargeEfficiency != null;
  const dischargeEfficiency = hasDischargeEfficiencyOverride
    ? Math.max(0, Math.min(1, config?.dischargeEfficiency ?? 1))
    : Math.sqrt(spec.roundTripEfficiency);
  const chargeEfficiency = hasDischargeEfficiencyOverride ? 1 : Math.sqrt(spec.roundTripEfficiency);
  const reserveEnergy = Math.max(0, config?.reserveEnergyForTradingKwh ?? 0);
  const reserveEmpty = Math.max(0, config?.reserveEmptyCapacityForTradingKwh ?? 0);
  const minSocKwh = Math.min(spec.capacityKwh, reserveEnergy);
  const maxSocKwh = Math.max(minSocKwh, spec.capacityKwh - reserveEmpty);

  return {
    spec,
    chargeEfficiency,
    dischargeEfficiency,
    minSocKwh,
    maxSocKwh
  };
}

export function getInitialSocKwh(
  capacityKwh: number,
  initialSocRatio = 0,
  config?: BatteryPhysicsConfig
): number {
  const { minSocKwh, maxSocKwh } = resolveBatteryPhysics(capacityKwh, config);
  const usableCapacityKwh = Math.max(0, maxSocKwh - minSocKwh);
  const clampedRatio = Math.max(0, Math.min(1, initialSocRatio));
  return minSocKwh + usableCapacityKwh * clampedRatio;
}

export function getMaxChargeIntervalKwh(maxChargeKw: number, intervalHours = 0.25): number {
  return Math.max(0, maxChargeKw) * intervalHours;
}

export function getMaxDischargeIntervalKwh(maxDischargeKw: number, intervalHours = 0.25): number {
  return Math.max(0, maxDischargeKw) * intervalHours;
}
