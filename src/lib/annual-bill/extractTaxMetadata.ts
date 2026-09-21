import type { AnnualBillRawExtract } from './schema';
import { logAnnualBill } from './logging';

export function extractTaxMetadata(text: string, raw: AnnualBillRawExtract, traceId?: string): void {
  const supplyLines = text.split(/\r?\n/).filter((line) => /normaaltarief|daltarief|leveringstarief|(?:alle|getoonde) tarieven|btw (?:op )?(?:stroom|elektriciteit)/i.test(line));
  const taxLines = text.split(/\r?\n/).filter((line) => /(?:energiebelasting|belasting op) (?:stroom|elektriciteit)/i.test(line) && !/vermindering|gas/i.test(line));
  const treatment = (lines: string[]) => {
    const values = new Set(lines.flatMap((line) => /excl(?:usief)?\.?\s*(?:\d+%\s*)?btw/i.test(line) ? ['excluded'] : /incl(?:usief)?\.?\s*(?:\d+%\s*)?btw/i.test(line) ? ['included'] : []));
    return values.size === 1 ? [...values][0] : undefined;
  };
  for (const [field, lines] of [['supplyTariffVat', supplyLines], ['energyTaxVat', taxLines]] as const) {
    const value = treatment(lines);
    if (value) raw[field] = { value, confidence: 0.92, source: 'rules', evidenceSnippet: lines.join('\n') };
  }
  const allIn = supplyLines.find((line) => /incl(?:usief)?\.?[^\n]*(?:btw[^\n]*energiebelasting|energiebelasting[^\n]*btw)/i.test(line) && !/excl/i.test(line));
  if (allIn) raw.tariffBasis = { value: 'all_in', confidence: 0.92, source: 'rules', evidenceSnippet: allIn };
  else if (!raw.tariffBasis && supplyLines.some((line) => /leveringstarief|excl(?:usief)?[^\n]*energiebelasting/i.test(line))) raw.tariffBasis = { value: 'supply_only', confidence: 0.85, source: 'rules', evidenceSnippet: supplyLines.join('\n') };
  const vatRates = [...new Set([...supplyLines, ...taxLines].flatMap((line) => [...line.matchAll(/(\d{1,2}(?:[,.]\d+)?)\s*%\s*btw/gi)].map((match) => Number(match[1].replace(',', '.')))))];
  if (!raw.electricityVatPercent && vatRates.length === 1) raw.electricityVatPercent = { value: vatRates[0], confidence: 0.85, source: 'rules', evidenceSnippet: [...supplyLines, ...taxLines].join('\n') };
  logAnnualBill('tax.metadata.resolved', traceId, { tariffBasis: raw.tariffBasis?.value, supplyTariffVat: raw.supplyTariffVat?.value, energyTaxVat: raw.energyTaxVat?.value, vatPercent: raw.electricityVatPercent?.value, energyTaxEurPerKwh: raw.energyTaxEurPerKwh?.value });
}
