import type { AnnualBillAdviceResult, AnnualBillBatteryOptionResult } from './calculateAnnualBillAdvice';

/** Options displayed for report selection, restricted to genuine V3 simulation results. */
export function getAnnualBillReportOptions(advice: AnnualBillAdviceResult): AnnualBillBatteryOptionResult[] {
  if (advice.recommendationStatus !== 'recommended' || advice.energyBasis?.status !== 'usable' ||
      !Number.isFinite(advice.energyBasis.gridImportKwh) || !Number.isFinite(advice.energyBasis.gridExportKwh) ||
      !Number.isFinite(advice.recommendedBatteryKwh)) return [];

  const valid = advice.options
    .filter((option) => Number.isFinite(option.batteryKwh) && option.batteryKwh > 0 &&
      Number.isFinite(option.annualGridImportReductionKwh) && option.annualGridImportReductionKwh! >= 0 &&
      Number.isFinite(option.technicalSimulation?.annualGridImportReductionKwh) &&
      option.technicalSimulation!.annualGridImportReductionKwh === option.annualGridImportReductionKwh)
    .sort((a, b) => a.batteryKwh - b.batteryKwh)
    .filter((option, index, all) => index === 0 || option.batteryKwh !== all[index - 1].batteryKwh);
  const recommended = valid.find((option) => option.batteryKwh === advice.recommendedBatteryKwh);
  if (!recommended) return [];
  const larger = valid.filter((option) => option.batteryKwh > recommended.batteryKwh).slice(0, 2);
  const selected = [recommended, ...larger];
  if (selected.length < 3) {
    selected.push(...valid.filter((option) => option.batteryKwh < recommended.batteryKwh)
      .sort((a, b) => b.batteryKwh - a.batteryKwh).slice(0, 3 - selected.length));
  }
  return selected.sort((a, b) => a.batteryKwh - b.batteryKwh);
}

export function getSelectedAnnualBillReportOption(advice: AnnualBillAdviceResult, capacityKwh: number): AnnualBillBatteryOptionResult {
  if (!Number.isFinite(capacityKwh)) throw new Error('Kies een geldige batterijcapaciteit voor het rapport.');
  const option = getAnnualBillReportOptions(advice).find((candidate) => candidate.batteryKwh === capacityKwh);
  if (!option) throw new Error('Deze batterijcapaciteit heeft geen geldige V3-simulatie voor deze jaarnota.');
  return option;
}
