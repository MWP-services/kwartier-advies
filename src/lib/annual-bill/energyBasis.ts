export type EnergyPair = {
  gridImportKwh: number; gridExportKwh: number;
  periodStart?: string; periodEnd?: string; annualized?: boolean;
  /** Dates are UTC calendar dates. Unmarked end dates are exclusive; t/m is inclusive. */
  periodEndInclusive?: boolean;
  evidence?: string; extractionConfidence?: number;
};
export type EnergyBasisInput = {
  physicalEnergy?: EnergyPair; annualizedEnergy?: EnergyPair; confirmedEnergy?: EnergyPair;
  totalUsageKwh?: number; totalFeedInKwh?: number;
  usageNormalKwh?: number; usageOffPeakKwh?: number; feedInNormalKwh?: number; feedInOffPeakKwh?: number;
  periodStart?: string; periodEnd?: string; source?: 'pdf' | 'manual';
  energyTotalsConfirmed?: boolean; extractionConfidence?: number; missingFields?: string[];
  periodEndInclusive?: boolean; energyConflicts?: string[];
  /** Explicit user declaration, retained when correcting extracted annual volumes. */
  energyVolumesAnnualized?: boolean;
};
export type AnnualBillEnergyBasis = {
  gridImportKwh: number; gridExportKwh: number;
  originalImportKwh?: number; originalExportKwh?: number;
  periodStart?: string; periodEnd?: string; periodDays?: number; annualizationFactor: number;
  source: 'physical_meter' | 'annualized_summary' | 'billing' | 'manual';
  annualized: boolean; confidence: 'low' | 'medium'; warnings: string[];
  status: 'usable' | 'insufficient_data';
  periodEndInclusive: boolean; evidence?: string;
};
const valid = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
function total(value?: number, a?: number, b?: number) {
  if (value != null) return value;
  return a != null && b != null ? a + b : undefined;
}
export function resolveAnnualBillEnergyBasis(input: EnergyBasisInput): AnnualBillEnergyBasis {
  const pair = input.physicalEnergy ?? input.annualizedEnergy ?? input.confirmedEnergy;
  const source = input.physicalEnergy ? 'physical_meter' : input.annualizedEnergy ? 'annualized_summary' : input.confirmedEnergy || input.source !== 'pdf' ? 'manual' : 'billing';
  // An incomplete pair must never borrow the other direction from billing data.
  const imp = pair ? pair.gridImportKwh : total(input.totalUsageKwh, input.usageNormalKwh, input.usageOffPeakKwh);
  const exp = pair ? pair.gridExportKwh : total(input.totalFeedInKwh, input.feedInNormalKwh, input.feedInOffPeakKwh);
  // Dates belong to their pair too: never borrow a billing period for meter data.
  const start = pair ? pair.periodStart : input.periodStart;
  const end = pair ? pair.periodEnd : input.periodEnd;
  const periodEndInclusive = (pair ? pair.periodEndInclusive : input.periodEndInclusive) ?? false;
  const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? Date.parse(value) : NaN;
  const days = start && end ? (date(end) - date(start)) / 86400000 + Number(periodEndInclusive) : undefined;
  const annualized = pair ? (!!input.annualizedEnergy && !input.physicalEnergy || pair.annualized === true) : input.energyVolumesAnnualized === true;
  const warnings: string[] = [];
  let status: AnnualBillEnergyBasis['status'] = 'usable';
  let confidence: AnnualBillEnergyBasis['confidence'] = 'medium';
  for (const [value, label] of [[imp, 'netafname'], [exp, 'netteruglevering']] as const) {
    if (!valid(value)) { status = 'insufficient_data'; warnings.push(`Geen betrouwbaar batterijcapaciteitsadvies mogelijk: jaarlijkse ${label} ontbreekt of is ongeldig.`); }
  }
  if (!pair) {
    for (const [value, normal, offPeak] of [[input.totalUsageKwh, input.usageNormalKwh, input.usageOffPeakKwh], [input.totalFeedInKwh, input.feedInNormalKwh, input.feedInOffPeakKwh]]) {
      if (valid(value) && valid(normal) && valid(offPeak) && Math.abs(value - normal - offPeak) > 1) {
        status = 'insufficient_data'; warnings.push('Energietotaal conflicteert met normaal- en dalregisters; corrigeer eerst de fysieke waarden.');
      }
    }
  }
  if (!pair && input.source === 'pdf' && !input.energyTotalsConfirmed) {
    status = 'insufficient_data'; warnings.push('Bevestig dat de factuurtotalen fysieke netafname en netteruglevering over dezelfde periode zijn; gesaldeerde waarden zijn niet bruikbaar.');
  }
  if (source === 'billing') { confidence = 'low'; warnings.push('Generieke factuurtotalen: fysieke energiegrondslag niet afzonderlijk vastgelegd.'); }
  if (days !== undefined && (!Number.isFinite(days) || days <= 0 || (!annualized && (days < 270 || days > 450)))) {
    status = 'insufficient_data'; warnings.push('Factuurperiode ongeschikt voor automatisch jaaradvies (vereist 270–450 dagen of expliciete jaarvolumes).');
  } else if (!annualized && days !== undefined && (days < 330 || days > 400)) {
    confidence = 'low'; warnings.push('Afwijkende factuurperiode: sterke annualisering, seizoenvertekening mogelijk.');
  }
  if (days === undefined && !annualized) {
    confidence = 'low';
    if (start || end || (source !== 'manual' && !input.energyTotalsConfirmed)) {
      status = 'insufficient_data'; warnings.push('Een volledige representatieve periode of expliciete jaarvolumes ontbreken.');
    } else warnings.push('Periode ontbreekt: handmatig ingevoerde of bevestigde totalen worden als jaarvolumes behandeld.');
  }
  if (input.energyConflicts?.length) {
    status = 'insufficient_data'; warnings.push(...input.energyConflicts);
  }
  const extractionConfidence = pair?.extractionConfidence ?? input.extractionConfidence;
  if (extractionConfidence != null && (!Number.isFinite(extractionConfidence) || extractionConfidence < 0.8)) {
    confidence = 'low'; warnings.push('Extractie vereist controle op conflicten of onzekerheid.');
  }
  const factor = !annualized && days && Number.isFinite(days) && days > 0 ? 365 / days : 1;
  return { gridImportKwh: valid(imp) ? imp * factor : 0, gridExportKwh: valid(exp) ? exp * factor : 0,
    originalImportKwh: imp, originalExportKwh: exp, periodStart: start, periodEnd: end, periodDays: days,
    annualizationFactor: factor, source, annualized, confidence, warnings, status, periodEndInclusive, evidence: pair?.evidence };
}
