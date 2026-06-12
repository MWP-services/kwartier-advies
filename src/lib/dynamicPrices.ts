export type DynamicPriceSource = 'energyzero' | 'entsoe' | 'manual';

export type DynamicPricePoint = {
  source: DynamicPriceSource;
  zone: 'NL';
  start: string;
  end: string;
  marketPriceEurPerKwh: number;
  importPriceEurPerKwh: number;
  exportPriceEurPerKwh: number;
};

export type DynamicPriceCostConfig = {
  importMarkupEurPerKwh?: number;
  exportMarkupEurPerKwh?: number;
  fixedEnergyTaxEurPerKwh?: number;
  vatMultiplier?: number;
};

export type FetchDynamicPricesOptions = DynamicPriceCostConfig & {
  source?: DynamicPriceSource;
  zone?: 'NL';
  fetchImpl?: typeof fetch;
  energyZeroBaseUrl?: string;
};

type UnknownRecord = Record<string, unknown>;

const DEFAULT_ENERGYZERO_BASE_URL = 'https://public.api.energyzero.nl';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const PRICE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const globalPriceCache = globalThis as typeof globalThis & {
  __kwartierDynamicPriceCache?: Map<string, { createdAt: number; points: DynamicPricePoint[] }>;
};

const dynamicPriceCache = globalPriceCache.__kwartierDynamicPriceCache ?? new Map<string, { createdAt: number; points: DynamicPricePoint[] }>();
globalPriceCache.__kwartierDynamicPriceCache = dynamicPriceCache;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const parsed = Number(value.trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function toIso(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function addHoursIso(startIso: string, hours: number): string {
  return new Date(new Date(startIso).getTime() + hours * HOUR_MS).toISOString();
}

function localDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function daysBetweenInclusive(startIso: string, endIso: string): string[] {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const keys: string[] = [];
  const seen = new Set<string>();
  for (let time = start.getTime() - DAY_MS; time <= end.getTime() + DAY_MS; time += DAY_MS) {
    const key = localDateKey(new Date(time));
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

function extractPriceRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];

  const candidates = [
    payload.prices,
    payload.Prices,
    payload.result,
    payload.Result,
    payload.data,
    payload.Data,
    payload.items,
    payload.Items
  ];
  const nested = candidates.find(Array.isArray);
  return Array.isArray(nested) ? nested : [];
}

export function eurPerMwhToEurPerKwh(value: number): number {
  return value / 1000;
}

export function normalizeEurPerKwh(value: number, unit?: 'eur_per_kwh' | 'eur_per_mwh' | 'auto'): number {
  if (unit === 'eur_per_mwh') return eurPerMwhToEurPerKwh(value);
  if (unit === 'eur_per_kwh') return value;
  return Math.abs(value) > 5 ? eurPerMwhToEurPerKwh(value) : value;
}

export function calculateDynamicIntervalPrices(
  marketPriceEurPerKwh: number,
  config: DynamicPriceCostConfig = {}
): Pick<DynamicPricePoint, 'importPriceEurPerKwh' | 'exportPriceEurPerKwh'> {
  const vatMultiplier = config.vatMultiplier ?? 1;
  const fixedEnergyTaxEurPerKwh = config.fixedEnergyTaxEurPerKwh ?? 0;
  const importMarkupEurPerKwh = config.importMarkupEurPerKwh ?? 0;
  const exportMarkupEurPerKwh = config.exportMarkupEurPerKwh ?? 0;

  return {
    importPriceEurPerKwh: (marketPriceEurPerKwh + importMarkupEurPerKwh + fixedEnergyTaxEurPerKwh) * vatMultiplier,
    exportPriceEurPerKwh: Math.max(0, marketPriceEurPerKwh - exportMarkupEurPerKwh)
  };
}

export function normalizeEnergyZeroPrices(
  payload: unknown,
  config: DynamicPriceCostConfig = {}
): DynamicPricePoint[] {
  return extractPriceRows(payload)
    .map((row): DynamicPricePoint | null => {
      if (!isRecord(row)) return null;

      const start =
        toIso(row.start) ??
        toIso(row.startDate) ??
        toIso(row.fromDate) ??
        toIso(row.readingDate) ??
        toIso(row.timestamp) ??
        toIso(row.date);
      if (!start) return null;

      const end =
        toIso(row.end) ??
        toIso(row.endDate) ??
        toIso(row.tillDate) ??
        toIso(row.untilDate) ??
        addHoursIso(start, 1);

      const rawPrice =
        toFiniteNumber(row.marketPriceEurPerKwh) ??
        toFiniteNumber(row.marketPrice) ??
        toFiniteNumber(row.price) ??
        toFiniteNumber(row.value);
      if (rawPrice == null) return null;

      const marketPriceEurPerKwh = normalizeEurPerKwh(rawPrice, 'auto');
      const intervalPrices = calculateDynamicIntervalPrices(marketPriceEurPerKwh, config);

      return {
        source: 'energyzero',
        zone: 'NL',
        start,
        end,
        marketPriceEurPerKwh,
        ...intervalPrices
      };
    })
    .filter((point): point is DynamicPricePoint => point != null)
    .sort((a, b) => a.start.localeCompare(b.start));
}

export async function fetchEnergyZeroPricesForDate(
  date: string | Date,
  options: FetchDynamicPricesOptions = {}
): Promise<DynamicPricePoint[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const dateIso = date instanceof Date ? date.toISOString() : new Date(date).toISOString();
  const cacheKey = JSON.stringify({
    source: 'energyzero',
    date: dateIso.slice(0, 10),
    baseUrl: options.energyZeroBaseUrl ?? DEFAULT_ENERGYZERO_BASE_URL,
    importMarkupEurPerKwh: options.importMarkupEurPerKwh ?? 0,
    exportMarkupEurPerKwh: options.exportMarkupEurPerKwh ?? 0,
    fixedEnergyTaxEurPerKwh: options.fixedEnergyTaxEurPerKwh ?? 0,
    vatMultiplier: options.vatMultiplier ?? 1
  });
  const cached = dynamicPriceCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < PRICE_CACHE_TTL_MS) {
    return [...cached.points];
  }

  const url = new URL('/public/v1/prices', options.energyZeroBaseUrl ?? DEFAULT_ENERGYZERO_BASE_URL);
  url.searchParams.set('date', dateIso);
  url.searchParams.set('usageType', '1');
  url.searchParams.set('interval', '4');
  url.searchParams.set('inclBtw', 'true');

  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`EnergyZero prijzen ophalen mislukt (${response.status})`);
  }

  const points = normalizeEnergyZeroPrices(await response.json(), options);
  dynamicPriceCache.set(cacheKey, { createdAt: Date.now(), points });
  return [...points];
}

export async function fetchHistoricalDynamicPricesForDate(
  date: string | Date,
  options: FetchDynamicPricesOptions = {}
): Promise<DynamicPricePoint[]> {
  if ((options.source ?? 'energyzero') !== 'energyzero') {
    throw new Error(`Prijsbron ${options.source} is nog niet geimplementeerd.`);
  }
  return fetchEnergyZeroPricesForDate(date, options);
}

export async function fetchHistoricalDynamicPricesForRange(
  start: string,
  end: string,
  options: FetchDynamicPricesOptions = {}
): Promise<DynamicPricePoint[]> {
  const dates = daysBetweenInclusive(start, end);
  const points = (
    await Promise.all(dates.map((date) => fetchHistoricalDynamicPricesForDate(`${date}T12:00:00.000Z`, options)))
  ).flat();

  const byStart = new Map<string, DynamicPricePoint>();
  points.forEach((point) => {
    if (point.end <= start || point.start >= end) return;
    byStart.set(point.start, point);
  });

  return Array.from(byStart.values()).sort((a, b) => a.start.localeCompare(b.start));
}

export function matchDynamicPriceToTimestamp(
  timestamp: string,
  pricePoints: DynamicPricePoint[]
): DynamicPricePoint | null {
  const time = new Date(timestamp).getTime();
  if (Number.isNaN(time)) return null;

  return (
    pricePoints.find((point) => {
      const start = new Date(point.start).getTime();
      const end = new Date(point.end).getTime();
      return Number.isFinite(start) && Number.isFinite(end) && time >= start && time < end;
    }) ?? null
  );
}
