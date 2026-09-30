import type { AnnualBillField, AnnualBillRawExtract } from './schema';
import { BILL_NUMBER_PATTERN, parseBillNumber } from './numbers';
import { isUsableAnnualTariff } from './tariffs';
import { logAnnualBill } from './logging';
import { extractElectricityTable } from './extractElectricityTable';
import { extractElectricityTaxes } from './extractElectricityTaxes';
import { extractTaxMetadata } from './extractTaxMetadata';
import { extractContractType } from './contractType';

type NumericFieldConfig = {
  field: AnnualBillField;
  labels: string[];
  unit?: 'kwh' | 'eur_per_kwh' | 'eur';
};

const NUMERIC_FIELDS: NumericFieldConfig[] = [
  {
    field: 'usageNormalKwh',
    labels: ['normaal verbruik', 'verbruik normaal', 'levering normaal', 'enkeltarief verbruik', 'afname normaal'],
    unit: 'kwh'
  },
  {
    field: 'usageOffPeakKwh',
    labels: ['dal verbruik', 'verbruik dal', 'levering dal', 'laag verbruik', 'afname dal'],
    unit: 'kwh'
  },
  {
    field: 'feedInNormalKwh',
    labels: ['teruglevering normaal', 'teruglever normaal', 'injectie normaal'],
    unit: 'kwh'
  },
  {
    field: 'feedInOffPeakKwh',
    labels: ['teruglevering dal', 'teruglever dal', 'injectie dal'],
    unit: 'kwh'
  },
  {
    field: 'totalUsageKwh',
    labels: ['totaal verbruik', 'totale levering', 'totaal afname', 'jaarverbruik elektriciteit', 'elektriciteitsverbruik'],
    unit: 'kwh'
  },
  {
    field: 'totalFeedInKwh',
    labels: ['totaal teruglevering', 'totale teruglevering', 'totaal teruggeleverd', 'teruggeleverde elektriciteit'],
    unit: 'kwh'
  },
  {
    field: 'annualPvProductionKwh',
    labels: ['pv opwek', 'zonnepanelen opbrengst', 'jaaropwek', 'opwek elektriciteit'],
    unit: 'kwh'
  },
  {
    field: 'normalTariffEurPerKwh',
    labels: ['normaaltarief', 'tarief normaal', 'leveringstarief normaal'],
    unit: 'eur_per_kwh'
  },
  {
    field: 'offPeakTariffEurPerKwh',
    labels: ['daltarief', 'tarief dal', 'leveringstarief dal'],
    unit: 'eur_per_kwh'
  },
  {
    field: 'feedInTariffEurPerKwh',
    labels: ['terugleververgoeding', 'teruglevertarief', 'vergoeding teruglevering'],
    unit: 'eur_per_kwh'
  },
  {
    field: 'totalElectricityCostEur',
    labels: ['totaal elektriciteit', 'kosten elektriciteit', 'totaal stroom'],
    unit: 'eur'
  },
  {
    field: 'energyTaxEurPerKwh',
    labels: ['energiebelasting elektriciteit', 'energiebelasting stroom', 'belasting op stroom'],
    unit: 'eur_per_kwh'
  },
  {
    field: 'gridCostElectricityEur',
    labels: ['netbeheerkosten elektriciteit', 'netwerkkosten elektriciteit', 'transportkosten elektriciteit'],
    unit: 'eur'
  }
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findNumericValue(text: string, config: NumericFieldConfig, traceId?: string): { value: number; confidence: number; evidence: string } | null {
  const candidates: { value: number; confidence: number; evidence: string }[] = [];
  const nextLabelPattern = new RegExp(`\\b(?:${[...NUMERIC_FIELDS.flatMap((entry) => entry.labels), 'teruglevering', 'verbruik', 'afname', 'injectie'].map(escapeRegExp).join('|')})\\b`, 'i');
  text.split(/\r?\n/).forEach((line, index) => {
    for (const label of config.labels) {
      const match = new RegExp(`\\b${escapeRegExp(label)}\\b`, 'i').exec(line);
      if (!match) continue;
      let tail = line.slice(match.index + match[0].length);
      const nextLabel = nextLabelPattern.exec(tail);
      if (nextLabel) tail = tail.slice(0, nextLabel.index);
      const rateSuffix = String.raw`\s*(?:(cent|ct|eurocent|€|EUR)\s*)?(?:\/|per)\s*kWh\b`;
      const suffix = config.unit === 'eur_per_kwh' ? rateSuffix : config.unit === 'kwh' ? String.raw`\s*(kWh|kwu)\b(?!\s*(?:\/|per))` : String.raw`\s*(?:€|EUR)?`;
      const pattern = new RegExp(`(?<![\\d.,])(${BILL_NUMBER_PATTERN})${suffix}`, 'gi');
      const matches = [...tail.matchAll(pattern)];
      if (!matches.length) logAnnualBill('rules.candidate.rejected', traceId, { field: config.field, label, lineNumber: index + 1, reason: 'explicit_unit_or_value_missing' }, 'warn');
      for (const found of matches) {
        const parsed = parseBillNumber(found[1], config.unit === 'eur_per_kwh');
        const cents = config.unit === 'eur_per_kwh' && /^(cent|ct|eurocent)$/i.test(found[2] ?? '');
        const value = parsed == null ? null : cents ? parsed / 100 : parsed;
        const accepted = value != null && (config.unit !== 'eur_per_kwh' || isUsableAnnualTariff(value));
        logAnnualBill(accepted ? 'rules.candidate.accepted' : 'rules.candidate.rejected', traceId, {
          field: config.field, label, lineNumber: index + 1, parsedValue: parsed, value,
          unit: cents ? 'cent/kWh' : config.unit, convertedFromCents: cents,
          reason: accepted ? 'label_and_unit_match' : 'tariff_outside_review_range'
        }, accepted ? 'info' : 'warn');
        if (accepted) candidates.push({ value: value!, confidence: 0.78, evidence: `${match[0]}${tail}`.slice(0, 180) });
      }
      break;
    }
  });
  const unique = [...new Set(candidates.map((candidate) => candidate.value))];
  if (unique.length > 1) {
    logAnnualBill('rules.field.ambiguous', traceId, { field: config.field, values: unique, reason: 'multiple_distinct_values_require_review' }, 'warn');
    return null;
  }
  return candidates[0] ?? null;
}

function findDate(text: string, labels: string[]): { value: string; confidence: number; evidence: string } | null {
  for (const label of labels) {
    const pattern = new RegExp(`(${escapeRegExp(label)})[^\\n\\r]{0,80}?(\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}|\\d{4}-\\d{2}-\\d{2})`, 'i');
    const match = text.match(pattern);
    if (!match) continue;
    const raw = match[2];
    const parts = raw.includes('-') ? raw.split('-') : raw.split('/');
    const iso = parts[0].length === 4
      ? raw
      : `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    return { value: iso, confidence: 0.68, evidence: match[0] };
  }
  return null;
}

function findEan(text: string): { value: string; confidence: number; evidence: string } | null {
  const match = text.match(/\b(87\d{16})\b/);
  return match ? { value: match[1], confidence: 0.85, evidence: match[0] } : null;
}

function findSupplierName(text: string): { value: string; confidence: number; evidence: string } | null {
  const firstLines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 12);
  const line = firstLines.find((candidate) => /energie|energy|stroom|essent|eneco|vattenfall|greenchoice|budget|vandebron/i.test(candidate));
  return line ? { value: line.slice(0, 80), confidence: 0.45, evidence: line } : null;
}

export function extractAnnualBillData(text: string, traceId?: string): AnnualBillRawExtract {
  const raw: AnnualBillRawExtract = {};
  const contractType = extractContractType(text);
  if (contractType) raw.contractType = contractType;

  NUMERIC_FIELDS.forEach((config) => {
    const match = findNumericValue(text, config, traceId);
    if (match) raw[config.field] = { ...match, source: 'rules', evidenceSnippet: match.evidence };
  });

  const table = extractElectricityTable(text, traceId);
  if (Object.keys(table).length) {
    // Preserve separately extracted physical energy totals. Compensated export is not physical export.
    if (raw.totalUsageKwh || raw.usageNormalKwh || raw.usageOffPeakKwh) {
      for (const field of ['usageNormalKwh', 'usageOffPeakKwh', 'totalUsageKwh'] as const) delete table[field];
    }
    Object.assign(raw, table);
  }
  const taxes = extractElectricityTaxes(text, traceId);
  if (taxes.electricityVatPercent && raw.electricityVatPercent && taxes.electricityVatPercent.value !== raw.electricityVatPercent.value) {
    logAnnualBill('tax.vat.conflict', traceId, { supplyPercent: raw.electricityVatPercent.value, taxPercent: taxes.electricityVatPercent.value }, 'warn');
    delete taxes.electricityVatPercent;
    delete taxes.energyTaxVat;
  }
  Object.assign(raw, taxes);
  extractTaxMetadata(text, raw, traceId);

  const periodStart = findDate(text, ['periode van', 'leveringsperiode van', 'van']);
  const periodEnd = findDate(text, ['periode tot', 'leveringsperiode tot', 'tot']);
  const invoiceDate = findDate(text, ['factuurdatum', 'nota datum', 'datum nota']);
  const ean = findEan(text);
  const supplier = findSupplierName(text);

  if (periodStart) raw.periodStart = { ...periodStart, source: 'rules', evidenceSnippet: periodStart.evidence };
  if (periodEnd) raw.periodEnd = { ...periodEnd, source: 'rules', evidenceSnippet: periodEnd.evidence };
  if (invoiceDate) raw.invoiceDate = { ...invoiceDate, source: 'rules', evidenceSnippet: invoiceDate.evidence };
  if (ean) raw.eanElectricity = { ...ean, source: 'rules', evidenceSnippet: ean.evidence };
  if (supplier) raw.supplierName = { ...supplier, source: 'rules', evidenceSnippet: supplier.evidence };

  return raw;
}

