export type EnergyPair = {
  gridImportKwh: number; gridExportKwh: number;
  periodStart?: string; periodEnd?: string; annualized?: boolean;
};
export type EnergyBasisInput = {
  physicalEnergy?: EnergyPair; annualizedEnergy?: EnergyPair; confirmedEnergy?: EnergyPair;
  totalUsageKwh?: number; totalFeedInKwh?: number;
  usageNormalKwh?: number; usageOffPeakKwh?: number; feedInNormalKwh?: number; feedInOffPeakKwh?: number;
  periodStart?: string; periodEnd?: string; source?: 'pdf' | 'manual';
  energyTotalsConfirmed?: boolean; extractionConfidence?: number; missingFields?: string[];
};
export type AnnualBillEnergyBasis = {
  gridImportKwh: number; gridExportKwh: number;
  originalImportKwh?: number; originalExportKwh?: number;
  periodStart?: string; periodEnd?: string; periodDays?: number; annualizationFactor: number;
  source: 'physical_meter' | 'annualized_summary' | 'billing' | 'manual';
  annualized: boolean; confidence: 'low' | 'medium'; warnings: string[];
  status: 'usable' | 'insufficient_data';
};
const valid = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
function total(value?: number, a?: number, b?: number) {
  if (value != null) return value;
  return a != null && b != null ? a + b : undefined;
}
export function resolveAnnualBillEnergyBasis(input: EnergyBasisInput): AnnualBillEnergyBasis {
  const pair = input.physicalEnergy ?? input.annualizedEnergy ?? input.confirmedEnergy;
  const source = input.physicalEnergy ? 'physical_meter' : input.annualizedEnergy ? 'annualized_summary' : input.confirmedEnergy || input.source === 'manual' ? 'manual' : 'billing';
  const imp = pair?.gridImportKwh ?? total(input.totalUsageKwh, input.usageNormalKwh, input.usageOffPeakKwh);
  const exp = pair?.gridExportKwh ?? total(input.totalFeedInKwh, input.feedInNormalKwh, input.feedInOffPeakKwh);
  const start = pair?.periodStart ?? input.periodStart;
  const end = pair?.periodEnd ?? input.periodEnd;
  const days = start && end ? (Date.parse(end) - Date.parse(start)) / 86400000 : undefined;
  const annualized = !!input.annualizedEnergy && !input.physicalEnergy || pair?.annualized === true;
  const warnings: string[] = [];
  let status: AnnualBillEnergyBasis['status'] = 'usable';
  let confidence: AnnualBillEnergyBasis['confidence'] = 'medium';
  for (const [value, label] of [[imp, 'netafname'], [exp, 'netteruglevering']] as const) {
    if (!valid(value)) { status = 'insufficient_data'; warnings.push(`Geen betrouwbaar batterijcapaciteitsadvies mogelijk: jaarlijkse ${label} ontbreekt of is ongeldig.`); }
  }
  if (!pair && input.source === 'pdf' && !input.energyTotalsConfirmed) {
    status = 'insufficient_data'; warnings.push('Bevestig dat de factuurtotalen fysieke netafname en netteruglevering over dezelfde periode zijn; gesaldeerde waarden zijn niet bruikbaar.');
  }
  if (source === 'billing') { confidence = 'low'; warnings.push('Generieke factuurtotalen: fysieke energiegrondslag niet afzonderlijk vastgelegd.'); }
  if (days !== undefined && (!Number.isFinite(days) || days <= 0 || (!annualized && (days < 270 || days > 450)))) {
    status = 'insufficient_data'; warnings.push('Factuurperiode ongeschikt voor automatisch jaaradvies (vereist 270?450 dagen of expliciete jaarvolumes).');
  } else if (!annualized && days !== undefined && (days < 330 || days > 400)) {
    confidence = 'low'; warnings.push('Afwijkende factuurperiode: sterke annualisering, seizoenvertekening mogelijk.');
  }
  if (days === undefined && !annualized) { confidence = 'low'; warnings.push('Periode ontbreekt: ingevulde totalen worden als jaarvolumes behandeld.'); }
  if ((input.extractionConfidence != null && input.extractionConfidence < 0.8) || input.missingFields?.some(x => /conflict|review|controle/i.test(x))) {
    confidence = 'low'; warnings.push('Extractie vereist controle op conflicten of onzekerheid.');
  }
  const factor = !annualized && days && Number.isFinite(days) && days > 0 ? 365 / days : 1;
  return { gridImportKwh: valid(imp) ? imp * factor : 0, gridExportKwh: valid(exp) ? exp * factor : 0,
    originalImportKwh: imp, originalExportKwh: exp, periodStart: start, periodEnd: end, periodDays: days,
    annualizationFactor: factor, source, annualized, confidence, warnings, status };
}
