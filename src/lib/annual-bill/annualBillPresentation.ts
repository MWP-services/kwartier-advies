import type { AnnualBillAdviceResult } from './calculateAnnualBillAdvice';

/** Also protects reports made from old payloads without savingsCalculationStatus. */
export function annualBillHasCalculatedSavings(advice: AnnualBillAdviceResult): boolean {
  return advice.recommendationStatus !== 'insufficient_data' && advice.savingsCalculationStatus !== 'not_calculated';
}

export function annualBillStatusLabel(advice: AnnualBillAdviceResult): string {
  if (!annualBillHasCalculatedSavings(advice)) return 'Onvoldoende betrouwbare energiegegevens';
  return advice.recommendationStatus === 'no_solar_shift' ? 'Bruikbare gegevens, geen relevante PV-opslag' : 'Batterijadvies berekend';
}
