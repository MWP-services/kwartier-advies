export interface BatterySpec {
  capacityKwh: number;
  maxChargeKw: number;
  maxDischargeKw: number;
  roundTripEfficiency: number;
}

// Values below come from the product brochures provided by the user.
const BASE_BATTERY_SPECS: Record<number, BatterySpec> = {
  64: {
    capacityKwh: 64.3,
    maxChargeKw: 32,
    maxDischargeKw: 30,
    roundTripEfficiency: 0.9
  },
  96: {
    capacityKwh: 96.46,
    maxChargeKw: 48,
    maxDischargeKw: 48,
    roundTripEfficiency: 0.9
  },
  261: {
    capacityKwh: 261.24,
    maxChargeKw: 125,
    maxDischargeKw: 125,
    roundTripEfficiency: 0.9
  },
  2090: {
    capacityKwh: 2090,
    maxChargeKw: 1000,
    maxDischargeKw: 1000,
    roundTripEfficiency: 0.9
  },
  5015: {
    capacityKwh: 5015.88,
    maxChargeKw: 2580,
    maxDischargeKw: 2580,
    roundTripEfficiency: 0.88
  }
};

const MODULAR_BASES = [261, 64, 96] as const;
const CONTAINER_2090 = BASE_BATTERY_SPECS[2090];
const CONTAINER_5015 = BASE_BATTERY_SPECS[5015];
const FIXED_CAPACITY_TOLERANCE_KWH = 1;
const MODULAR_TOLERANCE_KWH = 1e-6;

function isNear(value: number, target: number, tolerance: number): boolean {
  return Math.abs(value - target) <= tolerance;
}

function matchFixedContainer(capacityKwh: number): BatterySpec | null {
  if (
    isNear(capacityKwh, CONTAINER_2090.capacityKwh, FIXED_CAPACITY_TOLERANCE_KWH) ||
    isNear(capacityKwh, 2090, FIXED_CAPACITY_TOLERANCE_KWH)
  ) {
    return { ...CONTAINER_2090 };
  }

  if (
    isNear(capacityKwh, CONTAINER_5015.capacityKwh, FIXED_CAPACITY_TOLERANCE_KWH) ||
    isNear(capacityKwh, 5015, FIXED_CAPACITY_TOLERANCE_KWH)
  ) {
    return { ...CONTAINER_5015 };
  }

  return null;
}

function matchSingleCabinet(capacityKwh: number): BatterySpec | null {
  const candidates: Array<keyof typeof BASE_BATTERY_SPECS> = [64, 96, 261];
  for (const key of candidates) {
    const spec = BASE_BATTERY_SPECS[key];
    if (
      isNear(capacityKwh, key, FIXED_CAPACITY_TOLERANCE_KWH) ||
      isNear(capacityKwh, spec.capacityKwh, FIXED_CAPACITY_TOLERANCE_KWH)
    ) {
      return { ...spec };
    }
  }
  return null;
}

export function getBatterySpecForCapacity(capacityKwh: number): BatterySpec {
  if (!Number.isFinite(capacityKwh) || capacityKwh <= 0) {
    return {
      capacityKwh: 0,
      maxChargeKw: 0,
      maxDischargeKw: 0,
      roundTripEfficiency: 0.9
    };
  }

  const fixedContainer = matchFixedContainer(capacityKwh);
  if (fixedContainer) return fixedContainer;

  const singleCabinet = matchSingleCabinet(capacityKwh);
  if (singleCabinet) return singleCabinet;

  for (const baseSize of MODULAR_BASES) {
    const countRaw = capacityKwh / baseSize;
    const count = Math.round(countRaw);
    if (count >= 1 && isNear(countRaw, count, MODULAR_TOLERANCE_KWH)) {
      const baseSpec = BASE_BATTERY_SPECS[baseSize];
      return {
        capacityKwh,
        maxChargeKw: baseSpec.maxChargeKw * count,
        maxDischargeKw: baseSpec.maxDischargeKw * count,
        roundTripEfficiency: baseSpec.roundTripEfficiency
      };
    }
  }

  return {
    capacityKwh,
    maxChargeKw: capacityKwh / 2,
    maxDischargeKw: capacityKwh / 2,
    roundTripEfficiency: 0.9
  };
}
