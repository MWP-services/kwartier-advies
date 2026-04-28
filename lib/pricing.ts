import { getLocalDayIso, getLocalHourMinute, parseTimestamp } from './datetime';
import { parseCsv, parseXlsx } from './parsing';
import type { ProcessedInterval } from './calculations';

export type PricingMode = 'average' | 'variable' | 'dynamic';

export type PriceSource =
  | 'manual'
  | 'variable_period'
  | 'dynamic_exact'
  | 'dynamic_hour'
  | 'average_fallback'
  | 'missing';

export type PriceInterval = {
  ts?: string;
  startTs?: string;
  endTs?: string;
  importPriceEurPerKwh: number;
  exportPriceEurPerKwh?: number;
  feedInCostEurPerKwh?: number;
  fixedEnergyTaxEurPerKwh?: number;
  source?: PriceSource;
};

export interface PricingStats {
  totalIntervals: number;
  exactMatches: number;
  hourlyMatches: number;
  variablePeriodMatches: number;
  fallbackMatches: number;
  missingPrices: number;
  matchedShare: number;
}

export type PricingConfig = {
  pricingMode: PricingMode;
  averageImportPriceEurPerKwh: number;
  averageExportPriceEurPerKwh: number;
  averageFeedInCostEurPerKwh?: number;
  averageFixedEnergyTaxEurPerKwh?: number;
  priceIntervals?: PriceInterval[];
  fallbackToAveragePrices: boolean;
};

export interface ResolvedIntervalPrice {
  importPriceEurPerKwh: number;
  exportPriceEurPerKwh: number;
  feedInCostEurPerKwh: number;
  fixedEnergyTaxEurPerKwh: number;
  priceSource: PriceSource;
  isFallbackPrice: boolean;
}

interface PriceLookup {
  exactPriceMap: Map<string, PriceInterval>;
  hourlyPriceMap: Map<string, PriceInterval>;
  variablePeriods: PriceInterval[];
}

export interface PriceColumnMapping {
  timestamp: string;
  importPriceEurPerKwh: string;
  exportPriceEurPerKwh?: string;
  feedInCostEurPerKwh?: string;
  fixedEnergyTaxEurPerKwh?: string;
  endTimestamp?: string;
}

const TIMESTAMP_HEADER_CANDIDATES = ['timestamp', 'date', 'datum', 'datetime', 'tijdstip', 'start_time', 'start'];
const END_TIMESTAMP_HEADER_CANDIDATES = ['end_time', 'end', 'eindtijd', 'tot'];
const IMPORT_PRICE_HEADER_CANDIDATES = [
  'importPriceEurPerKwh',
  'import_price',
  'prijs',
  'afnameprijs',
  'stroomprijs',
  'purchasePrice',
  'buyPrice'
];
const EXPORT_PRICE_HEADER_CANDIDATES = [
  'exportPriceEurPerKwh',
  'export_price',
  'terugleververgoeding',
  'feedInPrice',
  'sellPrice'
];
const FEED_IN_COST_HEADER_CANDIDATES = [
  'feedInCostEurPerKwh',
  'feed_in_cost',
  'terugleverkosten',
  'export_cost'
];
const FIXED_ENERGY_TAX_HEADER_CANDIDATES = [
  'fixedEnergyTaxEurPerKwh',
  'energy_tax',
  'energiebelasting'
];

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function parseNumericCell(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return Number(value);
  const trimmed = value.trim();
  if (!trimmed) return Number.NaN;
  const normalized = trimmed
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(/,(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  return Number(normalized);
}

function toIsoString(value: unknown): string | null {
  const parsed = parseTimestamp(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function autoDetectPriceColumns(headers: string[]): PriceColumnMapping | null {
  const lookup = new Map(headers.map((header) => [normalizeHeader(header), header]));
  const findHeader = (candidates: string[]): string | undefined =>
    candidates.map((candidate) => lookup.get(normalizeHeader(candidate))).find((value) => value != null);

  const timestamp = findHeader(TIMESTAMP_HEADER_CANDIDATES);
  const importPriceEurPerKwh = findHeader(IMPORT_PRICE_HEADER_CANDIDATES);
  const exportPriceEurPerKwh = findHeader(EXPORT_PRICE_HEADER_CANDIDATES);

  if (!timestamp || !importPriceEurPerKwh) return null;

  return {
    timestamp,
    importPriceEurPerKwh,
    exportPriceEurPerKwh,
    feedInCostEurPerKwh: findHeader(FEED_IN_COST_HEADER_CANDIDATES),
    fixedEnergyTaxEurPerKwh: findHeader(FIXED_ENERGY_TAX_HEADER_CANDIDATES),
    endTimestamp: findHeader(END_TIMESTAMP_HEADER_CANDIDATES)
  };
}

export function mapPriceRows(rows: Record<string, unknown>[], mapping: PriceColumnMapping): PriceInterval[] {
  return rows
    .map<PriceInterval | null>((row) => {
      const ts = toIsoString(row[mapping.timestamp]);
      const endTs = mapping.endTimestamp ? toIsoString(row[mapping.endTimestamp]) : null;
      const importPriceEurPerKwh = parseNumericCell(row[mapping.importPriceEurPerKwh]);
      const exportPriceEurPerKwh = mapping.exportPriceEurPerKwh
        ? parseNumericCell(row[mapping.exportPriceEurPerKwh])
        : Number.NaN;
      const feedInCostEurPerKwh = mapping.feedInCostEurPerKwh
        ? parseNumericCell(row[mapping.feedInCostEurPerKwh])
        : Number.NaN;
      const fixedEnergyTaxEurPerKwh = mapping.fixedEnergyTaxEurPerKwh
        ? parseNumericCell(row[mapping.fixedEnergyTaxEurPerKwh])
        : Number.NaN;

      if (ts == null || Number.isNaN(importPriceEurPerKwh)) {
        return null;
      }

      return {
        ts,
        startTs: ts,
        endTs: endTs ?? undefined,
        importPriceEurPerKwh,
        exportPriceEurPerKwh: Number.isNaN(exportPriceEurPerKwh) ? undefined : exportPriceEurPerKwh,
        feedInCostEurPerKwh: Number.isNaN(feedInCostEurPerKwh) ? undefined : feedInCostEurPerKwh,
        fixedEnergyTaxEurPerKwh: Number.isNaN(fixedEnergyTaxEurPerKwh) ? undefined : fixedEnergyTaxEurPerKwh,
        source: endTs ? ('variable_period' as const) : ('dynamic_exact' as const)
      };
    })
    .filter((row): row is PriceInterval => row != null)
    .sort((a, b) => (a.startTs ?? a.ts ?? '').localeCompare(b.startTs ?? b.ts ?? ''));
}

export async function parsePriceFile(file: File): Promise<{ rows: PriceInterval[]; headers: string[] }> {
  if (file.name.toLowerCase().endsWith('.csv')) {
    const content = await file.text();
    const parsed = parseCsv(content);
    const mapping = autoDetectPriceColumns(parsed.headers);
    if (!mapping) throw new Error('Kon geen prijs-kolommen herkennen in het prijsbestand.');
    return { rows: mapPriceRows(parsed.rows, mapping), headers: parsed.headers };
  }

  const buffer = await file.arrayBuffer();
  const parsed = parseXlsx(buffer);
  const mapping = autoDetectPriceColumns(parsed.headers);
  if (!mapping) throw new Error('Kon geen prijs-kolommen herkennen in het prijsbestand.');
  return { rows: mapPriceRows(parsed.rows, mapping), headers: parsed.headers };
}

function buildHourlyKey(ts: string): string {
  const day = getLocalDayIso(ts, 'Europe/Amsterdam');
  const { hour } = getLocalHourMinute(ts, 'Europe/Amsterdam');
  return `${day}T${String(hour).padStart(2, '0')}`;
}

function resolveFallbackPrice(pricingConfig: PricingConfig): ResolvedIntervalPrice {
  return {
    importPriceEurPerKwh: pricingConfig.averageImportPriceEurPerKwh,
    exportPriceEurPerKwh: pricingConfig.averageExportPriceEurPerKwh,
    feedInCostEurPerKwh: pricingConfig.averageFeedInCostEurPerKwh ?? 0,
    fixedEnergyTaxEurPerKwh: pricingConfig.averageFixedEnergyTaxEurPerKwh ?? 0,
    priceSource: 'average_fallback',
    isFallbackPrice: true
  };
}

function resolveFieldWithFallback(
  value: number | undefined,
  fallback: number
): { value: number; usedFallback: boolean } {
  return Number.isFinite(value) ? { value: value as number, usedFallback: false } : { value: fallback, usedFallback: true };
}

export function getPriceForInterval(
  timestamp: string,
  priceData: PriceInterval[],
  pricingConfig: PricingConfig
): ResolvedIntervalPrice {
  const lookup = buildPriceLookup(priceData);
  return getPriceForIntervalWithLookup(timestamp, lookup, pricingConfig);
}

function buildPriceLookup(priceData: PriceInterval[]): PriceLookup {
  const exactPriceMap = new Map(
    priceData.filter((interval) => interval.ts != null).map((interval) => [interval.ts as string, interval])
  );
  const hourlyPriceMap = new Map<string, PriceInterval>();
  const variablePeriods = priceData.filter((interval) => interval.startTs && interval.endTs);

  priceData.forEach((interval) => {
    const exactTs = interval.ts ?? interval.startTs;
    if (!exactTs) return;
    const hourKey = buildHourlyKey(exactTs);
    if (!hourlyPriceMap.has(hourKey)) {
      hourlyPriceMap.set(hourKey, interval);
    }
  });

  return {
    exactPriceMap,
    hourlyPriceMap,
    variablePeriods
  };
}

function getPriceForIntervalWithLookup(
  timestamp: string,
  lookup: PriceLookup,
  pricingConfig: PricingConfig
): ResolvedIntervalPrice {
  const exact = lookup.exactPriceMap.get(timestamp);
  if (exact) {
    const exportResolved = resolveFieldWithFallback(
      exact.exportPriceEurPerKwh,
      pricingConfig.averageExportPriceEurPerKwh
    );
    const feedInResolved = resolveFieldWithFallback(
      exact.feedInCostEurPerKwh,
      pricingConfig.averageFeedInCostEurPerKwh ?? 0
    );
    const taxResolved = resolveFieldWithFallback(
      exact.fixedEnergyTaxEurPerKwh,
      pricingConfig.averageFixedEnergyTaxEurPerKwh ?? 0
    );
    return {
      importPriceEurPerKwh: exact.importPriceEurPerKwh,
      exportPriceEurPerKwh: exportResolved.value,
      feedInCostEurPerKwh: feedInResolved.value,
      fixedEnergyTaxEurPerKwh: taxResolved.value,
      priceSource: exact.source ?? 'dynamic_exact',
      isFallbackPrice: exportResolved.usedFallback || feedInResolved.usedFallback || taxResolved.usedFallback
    };
  }

  const hourly = lookup.hourlyPriceMap.get(buildHourlyKey(timestamp));
  if (hourly && pricingConfig.pricingMode === 'dynamic') {
    const exportResolved = resolveFieldWithFallback(
      hourly.exportPriceEurPerKwh,
      pricingConfig.averageExportPriceEurPerKwh
    );
    const feedInResolved = resolveFieldWithFallback(
      hourly.feedInCostEurPerKwh,
      pricingConfig.averageFeedInCostEurPerKwh ?? 0
    );
    const taxResolved = resolveFieldWithFallback(
      hourly.fixedEnergyTaxEurPerKwh,
      pricingConfig.averageFixedEnergyTaxEurPerKwh ?? 0
    );
    return {
      importPriceEurPerKwh: hourly.importPriceEurPerKwh,
      exportPriceEurPerKwh: exportResolved.value,
      feedInCostEurPerKwh: feedInResolved.value,
      fixedEnergyTaxEurPerKwh: taxResolved.value,
      priceSource: 'dynamic_hour',
      isFallbackPrice: exportResolved.usedFallback || feedInResolved.usedFallback || taxResolved.usedFallback
    };
  }

  if (pricingConfig.pricingMode === 'variable') {
    const currentMs = parseTimestamp(timestamp).getTime();
    const period = lookup.variablePeriods.find((candidate) => {
      const startMs = parseTimestamp(candidate.startTs).getTime();
      const endMs = parseTimestamp(candidate.endTs).getTime();
      return currentMs >= startMs && currentMs < endMs;
    });
    if (period) {
      const exportResolved = resolveFieldWithFallback(
        period.exportPriceEurPerKwh,
        pricingConfig.averageExportPriceEurPerKwh
      );
      const feedInResolved = resolveFieldWithFallback(
        period.feedInCostEurPerKwh,
        pricingConfig.averageFeedInCostEurPerKwh ?? 0
      );
      const taxResolved = resolveFieldWithFallback(
        period.fixedEnergyTaxEurPerKwh,
        pricingConfig.averageFixedEnergyTaxEurPerKwh ?? 0
      );
      return {
        importPriceEurPerKwh: period.importPriceEurPerKwh,
        exportPriceEurPerKwh: exportResolved.value,
        feedInCostEurPerKwh: feedInResolved.value,
        fixedEnergyTaxEurPerKwh: taxResolved.value,
        priceSource: 'variable_period',
        isFallbackPrice: exportResolved.usedFallback || feedInResolved.usedFallback || taxResolved.usedFallback
      };
    }
  }

  if (pricingConfig.fallbackToAveragePrices) {
    return resolveFallbackPrice(pricingConfig);
  }

  return {
    importPriceEurPerKwh: 0,
    exportPriceEurPerKwh: 0,
    feedInCostEurPerKwh: 0,
    fixedEnergyTaxEurPerKwh: 0,
    priceSource: 'missing',
    isFallbackPrice: false
  };
}

export function attachPricesToIntervals(
  intervals: ProcessedInterval[],
  priceIntervals: PriceInterval[],
  pricingConfig: PricingConfig
): {
  intervalsWithPrices: ProcessedInterval[];
  pricingStats: PricingStats;
  warnings: string[];
} {
  const pricingStats: PricingStats = {
    totalIntervals: intervals.length,
    exactMatches: 0,
    hourlyMatches: 0,
    variablePeriodMatches: 0,
    fallbackMatches: 0,
    missingPrices: 0,
    matchedShare: 0
  };
  const warnings: string[] = [];
  const lookup = buildPriceLookup(priceIntervals);

  const intervalsWithPrices: ProcessedInterval[] = intervals.map((interval) => {
    const resolved = getPriceForIntervalWithLookup(interval.timestamp, lookup, pricingConfig);
    if (resolved.priceSource === 'dynamic_exact') pricingStats.exactMatches += 1;
    if (resolved.priceSource === 'dynamic_hour') pricingStats.hourlyMatches += 1;
    if (resolved.priceSource === 'variable_period') pricingStats.variablePeriodMatches += 1;
    if (resolved.priceSource === 'average_fallback') pricingStats.fallbackMatches += 1;
    if (resolved.priceSource === 'missing') pricingStats.missingPrices += 1;

    return {
      ...interval,
      importPriceEurPerKwh: resolved.importPriceEurPerKwh,
      exportPriceEurPerKwh: resolved.exportPriceEurPerKwh,
      feedInCostEurPerKwh: resolved.feedInCostEurPerKwh,
      fixedEnergyTaxEurPerKwh: resolved.fixedEnergyTaxEurPerKwh,
      priceSource: resolved.priceSource,
      pricingIndicative: resolved.isFallbackPrice || resolved.priceSource === 'missing'
    };
  });

  const matchedIntervals =
    pricingStats.exactMatches +
    pricingStats.hourlyMatches +
    pricingStats.variablePeriodMatches +
    pricingStats.fallbackMatches;
  pricingStats.matchedShare =
    pricingStats.totalIntervals > 0 ? matchedIntervals / pricingStats.totalIntervals : 0;

  if (pricingStats.variablePeriodMatches > 0) {
    warnings.push('Variabele contractprijzen zijn op periodebasis gekoppeld aan de kwartierdata.');
  }
  if (pricingConfig.pricingMode === 'dynamic' && priceIntervals.length === 0 && pricingConfig.fallbackToAveragePrices) {
    warnings.push('Geen dynamische prijsdata geüpload; fallbackprijzen gebruikt. De financiële uitkomst is indicatief.');
  }
  if (pricingStats.hourlyMatches > 0) {
    warnings.push('Prijsdata is per uur gekoppeld aan kwartierdata.');
  }
  if (pricingStats.fallbackMatches > 0) {
    warnings.push(`Fallbacktarief gebruikt voor ${pricingStats.fallbackMatches} intervallen.`);
    warnings.push('Ontbrekende exportvergoeding of terugleverkosten zijn aangevuld met de handmatige fallbackvelden.');
  }
  if (pricingStats.missingPrices > 0) {
    warnings.push(`Prijsdata ontbreekt voor ${pricingStats.missingPrices} intervallen.`);
  }
  if (pricingStats.matchedShare < 0.95) {
    warnings.push('Minder dan 95% van de kwartieren heeft een direct gematchte prijs. De terugverdientijd is indicatief.');
  }
  if (priceIntervals.length > 0) {
    const sortedPriceIntervals = [...priceIntervals].sort((a, b) =>
      (a.startTs ?? a.ts ?? '').localeCompare(b.startTs ?? b.ts ?? '')
    );
    const priceStart = sortedPriceIntervals[0].startTs ?? sortedPriceIntervals[0].ts ?? '';
    const priceEnd =
      sortedPriceIntervals[sortedPriceIntervals.length - 1].endTs ??
      sortedPriceIntervals[sortedPriceIntervals.length - 1].ts ??
      '';
    if (
      intervals[0] &&
      priceStart &&
      priceEnd &&
      (intervals[0].timestamp < priceStart || intervals[intervals.length - 1].timestamp > priceEnd)
    ) {
      warnings.push('Prijsbestand heeft een andere periode dan de kwartierdata.');
    }
  }
  warnings.push('Dynamische en variabele prijzen blijven indicatief en zijn afhankelijk van contractvoorwaarden.');

  return {
    intervalsWithPrices,
    pricingStats,
    warnings
  };
}

export const attachDynamicPricesToIntervals = attachPricesToIntervals;
