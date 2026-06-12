import type { AnnualBillField, AnnualBillRawExtract } from './schema';

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
    field: 'energyTaxElectricityEur',
    labels: ['energiebelasting elektriciteit', 'energiebelasting stroom'],
    unit: 'eur'
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

function parseNlNumber(value: string): number | null {
  const normalized = value
    .replace(/\s/g, '')
    .replace(/[€]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function findNumericValue(text: string, config: NumericFieldConfig): { value: number; confidence: number; evidence: string } | null {
  for (const label of config.labels) {
    const unitPattern =
      config.unit === 'kwh'
        ? String.raw`(?:kWh|kwu)?`
        : config.unit === 'eur_per_kwh'
          ? String.raw`(?:€|EUR)?\s*(?:\/?\s*kWh|per\s*kWh)?`
          : String.raw`(?:€|EUR)?`;
    const pattern = new RegExp(
      `(${escapeRegExp(label)})[^\\n\\r]{0,80}?(-?\\d{1,3}(?:[.\\s]\\d{3})*(?:,\\d+)?|-?\\d+(?:,\\d+)?)\\s*${unitPattern}`,
      'i'
    );
    const match = text.match(pattern);
    if (!match) continue;

    const value = parseNlNumber(match[2]);
    if (value == null) continue;

    return {
      value,
      confidence: label.startsWith('totaal') || label.includes('tarief') ? 0.78 : 0.7,
      evidence: match[0].slice(0, 180)
    };
  }
  return null;
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

export function extractAnnualBillData(text: string): AnnualBillRawExtract {
  const raw: AnnualBillRawExtract = {};

  NUMERIC_FIELDS.forEach((config) => {
    const match = findNumericValue(text, config);
    if (match) raw[config.field] = match;
  });

  const periodStart = findDate(text, ['periode van', 'leveringsperiode van', 'van']);
  const periodEnd = findDate(text, ['periode tot', 'leveringsperiode tot', 'tot']);
  const invoiceDate = findDate(text, ['factuurdatum', 'nota datum', 'datum nota']);
  const ean = findEan(text);
  const supplier = findSupplierName(text);

  if (periodStart) raw.periodStart = periodStart;
  if (periodEnd) raw.periodEnd = periodEnd;
  if (invoiceDate) raw.invoiceDate = invoiceDate;
  if (ean) raw.eanElectricity = ean;
  if (supplier) raw.supplierName = supplier;

  return raw;
}

