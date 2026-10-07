export interface BatterySpec {
  capacityKwh: number;
  fallback?: boolean;
  source?: string;
  assumptions?: string;
  maxChargeKw: number;
  maxDischargeKw: number;
  roundTripEfficiency: number;
}

// Values below come from the product brochures provided by the user.
const BASE_BATTERY_SPECS: Record<number, BatterySpec> = {
  64: {
    source: 'public/assets/64.pdf, pagina 2: ES64/30K-A/EU',
    fallback: true,
    assumptions: 'Capaciteit en vermogen uit brochure; round-trip rendement ontbreekt, 90% aangenomen.',
    capacityKwh: 64.3,
    maxChargeKw: 32,
    maxDischargeKw: 30,
    roundTripEfficiency: 0.9
  },
  96: {
    source: 'public/assets/96.pdf, pagina 2: ES96/48K-A/EU',
    fallback: true,
    assumptions: 'Capaciteit en vermogen uit brochure; round-trip rendement ontbreekt, 90% aangenomen.',
    capacityKwh: 96.46,
    maxChargeKw: 48,
    maxDischargeKw: 48,
    roundTripEfficiency: 0.9
  },
  232: {
    source: 'public/assets/232.pdf, pagina 2: ES232/115K-A/EU',
    assumptions: 'Nominale capaciteit afgerond op 232 kWh. Brochure Max. Efficiency 90% als systeemefficiëntie geïnterpreteerd.',
    capacityKwh: 232,
    maxChargeKw: 115,
    maxDischargeKw: 115,
    roundTripEfficiency: 0.9
  },
  261: {
    source: 'public/assets/261.pdf, pagina 2: ESS261/125K-A/EU',
    assumptions: 'Brochure Max. Efficiency 90% als systeemefficiëntie geïnterpreteerd.',
    capacityKwh: 261.24,
    maxChargeKw: 125,
    maxDischargeKw: 125,
    roundTripEfficiency: 0.9
  },
  2090: {
    source: 'public/assets/2090.pdf, pagina 2: ES2090/1000K-A/EU',
    assumptions: 'Brochure Max. Efficiency 90% als systeemefficiëntie geïnterpreteerd.',
    capacityKwh: 2090,
    maxChargeKw: 1000,
    maxDischargeKw: 1000,
    roundTripEfficiency: 0.9
  },
  5015: {
    source: 'public/assets/5015.pdf, pagina 2: ES5015/2580K-C/EU',
    assumptions: 'Brochure Max. Efficiency 88% als systeemefficiëntie geïnterpreteerd.',
    capacityKwh: 5015.88,
    maxChargeKw: 2580,
    maxDischargeKw: 2580,
    roundTripEfficiency: 0.88
  }
};

const MODULAR_BASES = [232, 261, 64, 96] as const;
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
  const candidates: Array<keyof typeof BASE_BATTERY_SPECS> = [64, 96, 232, 261];
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
        source: baseSpec.source,
        assumptions: baseSpec.assumptions,
        fallback: baseSpec.fallback,
        capacityKwh,
        maxChargeKw: baseSpec.maxChargeKw * count,
        maxDischargeKw: baseSpec.maxDischargeKw * count,
        roundTripEfficiency: baseSpec.roundTripEfficiency
      };
    }
  }

  return {
    fallback: true,
    source: [7.68, 10.24, 12.8, 15.36, 17.92, 20.48, 23.04].includes(capacityKwh)
      ? 'public/assets/2.5_22.5.pdf, pagina 2: alleen DC-modulespecificatie'
      : 'Geen volledige productspecificatie beschikbaar',
    assumptions: '0,5C AC-laad-/ontlaadvermogen en 90% round-trip rendement aangenomen; omvormer en systeemrendement niet gespecificeerd.',
    capacityKwh,
    maxChargeKw: capacityKwh / 2,
    maxDischargeKw: capacityKwh / 2,
    roundTripEfficiency: 0.9
  };
}
