// System capacities listed in the technical table of 2.5_22.5.pdf.
// The 2.56 kWh module is not listed as a standalone system.
export const STACK_BATTERY_OPTIONS_KWH = [7.68, 10.24, 12.8, 15.36, 17.92, 20.48, 23.04];

export const BATTERY_ADVICE_OPTIONS_KWH = [
  30, 40, 64, 96, 232, 261, 2090, 5015,
  ...STACK_BATTERY_OPTIONS_KWH
].sort((a, b) => a - b);

export function batteryBrochureKey(capacityKwh: number): string {
  return STACK_BATTERY_OPTIONS_KWH.includes(capacityKwh) ? '2.5_22.5' : String(capacityKwh);
}
