import { BILL_NUMBER_PATTERN, parseBillNumber } from './numbers';
import type { EnergyPair } from './energyBasis';
import type { AnnualBillRawExtract } from './schema';

const DATE = String.raw`(?:\d{4}-\d{2}-\d{2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})`;
const iso = (s: string) => s.match(/^\d{4}-/) ? s : s.split(/[-/]/).reverse().map((x, i) => i ? x.padStart(2, '0') : x).join('-');
export function extractEnergyPeriod(text: string): Pick<EnergyPair, 'periodStart' | 'periodEnd' | 'periodEndInclusive'> | undefined {
  const match = text.match(new RegExp(`(${DATE})\\s*(tot en met|t/m|tot|t\\/m|–|—|-)\\s*(${DATE})`, 'i'));
  return match ? { periodStart: iso(match[1]), periodEnd: iso(match[3]), periodEndInclusive: /t\/m|tot en met/i.test(match[2]) } : undefined;
}

/** Conservative rules: a pair must share a semantic section AND explicit period.
 * Billing quantities, compensation and net/saldering rows are never meter data.
 * Unrecognized layouts remain scalar billing input requiring human confirmation.
 */
export function extractEnergyProvenance(text: string): AnnualBillRawExtract {
  type Kind = 'physicalEnergy' | 'annualizedEnergy';
  type Row = { value: number; evidence: string };
  const groups = new Map<string, { kind: Kind; period: ReturnType<typeof extractEnergyPeriod>; imports: Row[]; exports: Row[] }>();
  let kind: Kind | undefined;
  let period: ReturnType<typeof extractEnergyPeriod>;
  let section = 0;
  for (const line of text.split(/\r?\n/).map(x => x.trim()).filter(Boolean)) {
    const nextKind = /meteroverzicht|fysieke meterwaarden|fysiek energieoverzicht|bruto meterverbruik/i.test(line) ? 'physicalEnergy'
      : /geannualiseerd jaaroverzicht|jaaroverzicht elektriciteit|jaarvolumes elektriciteit/i.test(line) ? 'annualizedEnergy' : undefined;
    if (nextKind) { kind = nextKind; period = undefined; section++; }
    if (/^(?:factuurregels|leveringskosten|kostenoverzicht|gas\b|saldering\b)/i.test(line)) { kind = undefined; period = undefined; section++; }
    const rowPeriod = extractEnergyPeriod(line);
    if (rowPeriod && !/kwh/i.test(line)) period = rowPeriod;
    const explicitPhysical = /(?:fysieke?|bruto)\s+(?:netafname|import|afname|netteruglevering|export|teruglevering)/i.test(line);
    const rowKind = explicitPhysical ? 'physicalEnergy' : kind;
    if (!rowKind || /netto|gefactureerd|gesaldeerd|na saldering|vergoeding|compensatie|meterstand/i.test(line)) continue;
    const direction = /\b(?:netteruglevering|teruglevering|export|injectie)\b/i.test(line) ? 'exports'
      : /\b(?:netafname|afname|import|verbruik|levering)\b/i.test(line) ? 'imports' : undefined;
    if (!direction) continue;
    const quantities = [...line.matchAll(new RegExp(`(${BILL_NUMBER_PATTERN})\\s*kWh\\b(?!\\s*(?:/|per))`, 'gi'))];
    if (quantities.length !== 1 || /normaal|daltarief|\bdal\b/i.test(line)) continue;
    const value = parseBillNumber(quantities[0][1]);
    const pairedPeriod = rowPeriod ?? period;
    if (value == null || value < 0 || !pairedPeriod) continue;
    const key = JSON.stringify([section, rowKind, pairedPeriod]);
    const group = groups.get(key) ?? { kind: rowKind, period: pairedPeriod, imports: [], exports: [] };
    group[direction].push({ value, evidence: line }); groups.set(key, group);
  }
  const raw: AnnualBillRawExtract = {};
  for (const energyKind of ['physicalEnergy', 'annualizedEnergy'] as const) {
    const candidates = [...groups.values()].filter(g => g.kind === energyKind);
    const complete = candidates.filter(g => g.imports.length && g.exports.length);
    const conflicts = candidates.some(g => new Set(g.imports.map(r => r.value)).size > 1 || new Set(g.exports.map(r => r.value)).size > 1)
      || new Set(complete.map(g => JSON.stringify([g.period, g.imports[0].value, g.exports[0].value]))).size > 1;
    if (conflicts) {
      raw.energyConflicts = { value: 'conflict', confidence: 0, energyConflicts: ['Conflicterende energieoverzichten: bevestig eerst de juiste fysieke waarden en periode.'], requiresReview: true, source: 'rules' };
      continue;
    }
    const group = complete[0];
    if (!group) continue;
    const evidence = [...group.imports, ...group.exports].map(r => r.evidence).join('\n');
    raw[energyKind] = { value: energyKind, confidence: 0.95, source: 'rules', evidenceSnippet: evidence,
      energyPair: { gridImportKwh: group.imports[0].value, gridExportKwh: group.exports[0].value,
        ...group.period, annualized: energyKind === 'annualizedEnergy', evidence, extractionConfidence: 0.95 } };
  }
  return raw;
}
