import type { BatterySpec } from '../../../lib/batterySpecs';
import type { AnnualBillInterval } from './buildAnnualBillSyntheticProfile';
export function simulateAnnualBillBattery(profile: AnnualBillInterval[], spec: BatterySpec, config: { minimumSocFraction?: number; emergencyReserveFraction?: number } = {}) {
  const efficiency = Math.sqrt(spec.roundTripEfficiency);
  if (!(efficiency > 0 && efficiency <= 1) || ![spec.capacityKwh, spec.maxChargeKw, spec.maxDischargeKw].every(n => Number.isFinite(n) && n >= 0)) throw new Error('Ongeldige batterijspecificatie');
  const minimum = config.minimumSocFraction ?? 0.1;
  const emergency = config.emergencyReserveFraction ?? 0;
  if (![minimum, emergency].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) throw new Error('Ongeldige SOC-reserve');
  const reserve = spec.capacityKwh * Math.min(1, minimum + emergency);
  const usableCapacityKwh = spec.capacityKwh - reserve;
  let soc = reserve;
  const empty = () => ({ annualGridImportReductionKwh: 0, annualExportReductionKwh: 0, annualChargedFromSolarKwh: 0,
    annualDeliveredFromBatteryKwh: 0, annualLossesKwh: 0, equivalentCyclesPerYear: 0,
    unusedExportBecauseBatteryFullKwh: 0, unusedExportBecausePowerLimitKwh: 0,
    startingSocKwh: soc, endingSocKwh: soc, minimumObservedSocKwh: soc, maximumObservedSocKwh: soc, usableCapacityKwh });
  let result = empty();
  for (let year = 0; year < 2; year++) {
    result = empty();
    for (const row of profile) {
      const powerLimited = Math.min(row.exportKwh, spec.maxChargeKw * 0.25);
      const charge = Math.max(0, Math.min(powerLimited, (spec.capacityKwh - soc) / efficiency));
      result.unusedExportBecausePowerLimitKwh += row.exportKwh - powerLimited;
      result.unusedExportBecauseBatteryFullKwh += powerLimited - charge;
      soc += charge * efficiency;
      result.maximumObservedSocKwh = Math.max(result.maximumObservedSocKwh, soc);
      const delivered = Math.max(0, Math.min(row.importKwh, spec.maxDischargeKw * 0.25, (soc - reserve) * efficiency));
      soc -= delivered / efficiency;
      result.minimumObservedSocKwh = Math.min(result.minimumObservedSocKwh, soc);
      result.annualChargedFromSolarKwh += charge;
      result.annualDeliveredFromBatteryKwh += delivered;
      result.annualLossesKwh += charge * (1 - efficiency) + delivered * (1 / efficiency - 1);
    }
  }
  result.endingSocKwh = soc;
  result.annualGridImportReductionKwh = result.annualDeliveredFromBatteryKwh;
  result.annualExportReductionKwh = result.annualChargedFromSolarKwh;
  result.equivalentCyclesPerYear = usableCapacityKwh > 0 ? result.annualDeliveredFromBatteryKwh / efficiency / usableCapacityKwh : 0;
  return result;
}
export type AnnualBillBatterySimulation = ReturnType<typeof simulateAnnualBillBattery>;
