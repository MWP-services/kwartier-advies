/** Calibration parameters are energy-only; no prices enter sizing. */
export const SIZING_POLICIES = { compact: { target: 0.90, label: 'Compact' }, spacious: { target: 0.95, label: 'Ruim' }, future: { target: 0.97, label: 'Toekomstgericht' } } as const;
export type SizingPolicy = keyof typeof SIZING_POLICIES;
export const SIZING_CONFIG = {
  defaultPolicy: 'spacious' as SizingPolicy,
  // Short-duration solar storage: at most three mean days of the limiting energy flow.
  maxStorageDays: 3, plateauSteps: 2, plateauRelativeGain: 0.01,
  minimumAnnualGainKwh: 50, minimumGainPerAddedKwh: 10,
  maxReserveCapacityRatio: 1.5, minimumCycles: 40, scenarioVariation: 0.25,
  maximumFutureGrowthFraction: 0.5,
};
