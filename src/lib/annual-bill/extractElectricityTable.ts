import type { AnnualBillRawExtract } from './schema';
import { BILL_NUMBER_PATTERN, parseBillNumber } from './numbers';
import { isUsableAnnualTariff } from './tariffs';
import { logAnnualBill } from './logging';

/** Recover column-ordered PDF text only when row units and quantity × rate agree. */
export function extractElectricityTable(text: string, traceId?: string): AnnualBillRawExtract {
  const rowPattern = /(?:Verbruik stroom\s*\((daltarief|normaaltarief)\)|kWh terugleververgoeding|Vaste leveringskosten voor stroom)\s*\((\d{2}-\d{2}-\d{4})\/(\d{2}-\d{2}-\d{4})\)/gi;
  const rows = [...text.matchAll(rowPattern)].map((match) => ({
    kind: match[1]?.toLowerCase() === 'daltarief' ? 'offPeak' : match[1] ? 'normal' : /vaste/i.test(match[0]) ? 'fixed' : 'feedIn',
    start: match[2], end: match[3], index: match.index!, evidence: match[0]
  }));
  if (!rows.some((row) => row.kind === 'normal' || row.kind === 'offPeak')) return {};
  const quantityPattern = new RegExp(`(?<![\\d.,])(${BILL_NUMBER_PATTERN})\\s*(kWh|maand)\\b`, 'gi');
  const quantities = [...text.matchAll(quantityPattern)].filter((match) => match.index! >= rows[0].index).map((match) => ({
    value: parseBillNumber(match[1])!, unit: match[2].toLowerCase(), evidence: match[0]
  }));
  const offsets = quantities.flatMap((_, offset) => rows.every((row, i) => quantities[offset + i]?.unit === (row.kind === 'fixed' ? 'maand' : 'kwh')) ? [offset] : []);
  logAnnualBill('rules.table.detected', traceId, { rowCount: rows.length, quantityCount: quantities.length, alignmentCandidates: offsets.length });
  if (offsets.length !== 1) {
    logAnnualBill('rules.table.rejected', traceId, { reason: 'quantity_column_alignment_ambiguous' }, 'warn');
    return {};
  }
  const ratePattern = new RegExp(`(?<![\\d.,])(${BILL_NUMBER_PATTERN})\\s*\\*\\s*[€¤]\\s*(${BILL_NUMBER_PATTERN})(?:\\s*(\\d+(?:,\\d+)?)%\\s*btw)?`, 'gi');
  const rates = [...text.matchAll(ratePattern)].map((match) => ({
    rate: parseBillNumber(match[1], true)!, amount: parseBillNumber(match[2])!,
    vat: match[3] ? parseBillNumber(match[3]) : null, evidence: match[0]
  }));
  const recovered = rows.map((row, i) => {
    const quantity = quantities[offsets[0] + i];
    const matches = rates.filter((rate) => isUsableAnnualTariff(rate.rate) && Math.abs(quantity.value * rate.rate - rate.amount) <= 0.02);
    const distinct = [...new Map(matches.map((rate) => [rate.rate, rate])).values()];
    const price = quantity.value > 0 && distinct.length === 1 ? distinct[0] : undefined;
    if (row.kind !== 'fixed') logAnnualBill('rules.table.row_checked', traceId, {
      row: i + 1, kind: row.kind, periodStart: row.start, periodEnd: row.end, quantityKwh: quantity.value,
      matchingRateCount: distinct.length, tariff: price?.rate, lineAmount: price?.amount,
      calculatedAmount: price ? quantity.value * price.rate : undefined,
      differenceEur: price ? quantity.value * price.rate - price.amount : undefined,
      printedVatPercent: price?.vat, status: quantity.value === 0 ? 'explicit_zero' : price ? 'quantity_times_tariff_verified' : 'unresolved'
    }, quantity.value > 0 && !price && row.kind !== 'fixed' ? 'warn' : 'info');
    return { ...row, quantity, price };
  });
  // A failed positive energy-row check invalidates the entire column alignment.
  if (recovered.some((row) => row.kind !== 'fixed' && row.quantity.value > 0 && !row.price)) {
    logAnnualBill('rules.table.rejected', traceId, { reason: 'positive_energy_row_could_not_be_verified' }, 'warn');
    return {};
  }
  const raw: AnnualBillRawExtract = {};
  for (const [kind, usageField, tariffField] of [
    ['normal', 'usageNormalKwh', 'normalTariffEurPerKwh'],
    ['offPeak', 'usageOffPeakKwh', 'offPeakTariffEurPerKwh'],
    ['feedIn', 'compensatedFeedInKwh', 'feedInTariffEurPerKwh']
  ] as const) {
    const selected = recovered.filter((row) => row.kind === kind);
    if (!selected.length) continue;
    const total = selected.reduce((sum, row) => sum + row.quantity.value, 0);
    const evidence = selected.map((row) => `${row.evidence} ${row.quantity.evidence} ${row.price?.evidence ?? ''}`).join('\n');
    raw[usageField] = { value: total, confidence: 0.92, source: 'rules', evidenceSnippet: evidence };
    if (total > 0) {
      const weighted = selected.reduce((sum, row) => sum + row.quantity.value * (row.price?.rate ?? 0), 0) / total;
      raw[tariffField] = { value: weighted, confidence: 0.85, source: 'rules', evidenceSnippet: evidence, requiresReview: true,
        reasoning: 'Gewogen leveringstarief uit factuurregels; controleer btw en energiebelasting voor de volledige stroomprijs.' };
    }
  }
  raw.totalUsageKwh = { value: Number(raw.usageNormalKwh?.value ?? 0) + Number(raw.usageOffPeakKwh?.value ?? 0), confidence: 0.92, source: 'rules', evidenceSnippet: recovered.filter((row) => row.kind === 'normal' || row.kind === 'offPeak').map((row) => row.quantity.evidence).join('; ') };
  raw.tariffBasis = { value: 'supply_only', confidence: 0.9, source: 'rules', requiresReview: true };
  const vatRows = recovered.filter((row) => (row.kind === 'normal' || row.kind === 'offPeak') && row.quantity.value > 0);
  const vatRates = [...new Set(vatRows.map((row) => row.price?.vat))];
  if (vatRates.length === 1 && vatRates[0] != null) {
    raw.electricityVatPercent = { value: vatRates[0], confidence: 0.9, source: 'rules', evidenceSnippet: vatRows.map((row) => row.price?.evidence).join('\n') };
    // The checked row amount is quantity × tariff, followed by a separate VAT column.
    raw.supplyTariffVat = { value: 'excluded', confidence: 0.9, source: 'rules', evidenceSnippet: raw.electricityVatPercent.evidenceSnippet };
  }
  if (raw.usageNormalKwh) raw.tariffWeightNormalKwh = { ...raw.usageNormalKwh };
  if (raw.usageOffPeakKwh) raw.tariffWeightOffPeakKwh = { ...raw.usageOffPeakKwh };
  const isoDate = (date: string) => date.split('-').reverse().join('-');
  const energyRows = recovered.filter((row) => row.kind === 'normal' || row.kind === 'offPeak');
  raw.periodStart = { value: energyRows.map((row) => isoDate(row.start)).sort()[0], confidence: 0.85, source: 'rules', evidenceSnippet: energyRows.map((row) => row.start).join('; ') };
  raw.periodEnd = { value: energyRows.map((row) => isoDate(row.end)).sort().at(-1)!, confidence: 0.85, source: 'rules', evidenceSnippet: energyRows.map((row) => row.end).join('; ') };
  logAnnualBill('rules.table.completed', traceId, {
    billedUsageKwh: raw.totalUsageKwh.value, compensatedFeedInKwh: raw.compensatedFeedInKwh?.value,
    compensationIsNotPhysicalExport: true,
    normalTariff: raw.normalTariffEurPerKwh?.value, offPeakTariff: raw.offPeakTariffEurPerKwh?.value,
    tariffBasis: 'supply_only', requiresReview: true
  });
  return raw;
}
