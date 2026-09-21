import type { AnnualBillRawExtract } from './schema';
import { BILL_NUMBER_PATTERN, parseBillNumber } from './numbers';
import { isUsableAnnualTariff } from './tariffs';
import { logAnnualBill } from './logging';

/** Recover electricity tax rows; never divide combined gas/electricity tax totals by kWh. */
export function extractElectricityTaxes(text: string, traceId?: string): AnnualBillRawExtract {
  const raw: AnnualBillRawExtract = {};
  const start = text.search(/(?:Energiebelasting op levering|Belasting op stroom)/i);
  if (start < 0) return raw;
  let section = text.slice(start);
  const end = section.search(/(?:^|\n)\s*(?:\d+\s+)?Netbeheer\s*(?:\r?\n|$)/i);
  if (end >= 0) section = section.slice(0, end);
  const rows = [...section.matchAll(/Belasting op stroom[^\r\n]*\s*\((\d{2}-\d{2}-\d{4})\/(\d{2}-\d{2}-\d{4})\)/gi)];
  if (!rows.length) return raw;
  // Anchoring excludes quantities printed in bracket labels ("0 t/m 2.900 kWh").
  const quantities = [...section.matchAll(new RegExp(`^\\s*(${BILL_NUMBER_PATTERN})\\s*kWh\\s*$`, 'gmi'))].map((match) => ({ value: parseBillNumber(match[1])!, evidence: match[0].trim() }));
  const rates = [...section.matchAll(/^\s*(\d+[,.]\d{4,6})\s*$/gm)].map((match) => parseBillNumber(match[1], true)!);
  const amounts = [...section.matchAll(new RegExp(`[€¤]\\s*(${BILL_NUMBER_PATTERN})\\s+(\\d+(?:[,.]\\d+)?)%\\s*btw`, 'gi'))].map((match) => ({ amount: parseBillNumber(match[1])!, vat: parseBillNumber(match[2], true)!, evidence: match[0] }));
  logAnnualBill('tax.table.detected', traceId, { electricityRowCount: rows.length, kwhQuantityCount: quantities.length, rateCount: rates.length, amountCount: amounts.length });
  if (quantities.length !== rows.length) {
    logAnnualBill('tax.table.rejected', traceId, { reason: 'electricity_quantity_count_mismatch' }, 'warn');
    return raw;
  }
  const usedAmounts = new Set<number>();
  const checked = quantities.map((quantity, index) => {
    const candidates = [...new Set(rates)].filter((rate) => isUsableAnnualTariff(rate) && rate >= 0).flatMap((rate) => amounts.flatMap((amount, amountIndex) =>
      !usedAmounts.has(amountIndex) && amount.amount >= 0 && Math.abs(quantity.value * rate - amount.amount) <= 0.02
        ? [{ rate, ...amount, amountIndex }] : []));
    const distinct = [...new Map(candidates.map((candidate) => [`${candidate.rate}:${candidate.amount}:${candidate.vat}`, candidate])).values()];
    const match = distinct.length === 1 ? distinct[0] : undefined;
    if (match) usedAmounts.add(match.amountIndex);
    logAnnualBill('tax.row.checked', traceId, { row: index + 1, periodStart: rows[index][1], periodEnd: rows[index][2], quantityKwh: quantity.value, matched: Boolean(match), candidateCount: distinct.length, tariff: match?.rate, amountEur: match?.amount, vatPercent: match?.vat, differenceEur: match ? quantity.value * match.rate - match.amount : undefined }, match ? 'info' : 'warn');
    return match ? { ...match, quantity, row: rows[index][0] } : undefined;
  });
  if (checked.some((row) => !row)) {
    logAnnualBill('tax.table.rejected', traceId, { reason: 'electricity_tax_row_not_uniquely_verified' }, 'warn');
    return raw;
  }
  const verified = checked.filter((row): row is NonNullable<typeof row> => Boolean(row));
  const totalKwh = verified.reduce((sum, row) => sum + row.quantity.value, 0);
  const totalEur = verified.reduce((sum, row) => sum + row.amount, 0);
  if (totalKwh <= 0) return raw;
  const evidence = verified.map((row) => `${row.row}\n${row.quantity.evidence} × ${row.rate}\n${row.evidence}`).join('\n');
  const entry = (value: string | number) => ({ value, confidence: 0.92, source: 'rules' as const, evidenceSnippet: evidence });
  raw.energyTaxElectricityEur = entry(Math.round(totalEur * 100) / 100);
  raw.energyTaxWeightKwh = entry(totalKwh);
  raw.energyTaxEurPerKwh = entry(totalEur / totalKwh);
  const percentages = [...new Set(verified.map((row) => row.vat))];
  if (percentages.length === 1) {
    raw.electricityVatPercent = entry(percentages[0]);
    raw.energyTaxVat = entry('excluded');
  }
  logAnnualBill('tax.table.completed', traceId, { electricityTaxEur: raw.energyTaxElectricityEur.value, taxedKwh: totalKwh, energyTaxEurPerKwh: totalEur / totalKwh, vatPercent: raw.electricityVatPercent?.value, excluded: ['gas_tax', 'fixed_tax_reduction', 'network_costs'] });
  return raw;
}
