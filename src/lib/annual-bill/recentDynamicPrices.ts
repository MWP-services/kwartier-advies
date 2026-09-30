export type MarketHour = { start: string; marketPriceEurPerKwh: number };
export type MarketYear = { start: string; end: string; fetchedAt: string; source: string; hours: MarketHour[] };
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const cache = new Map<string, Promise<MarketYear>>();

export function validateMarketYear(hours: MarketHour[], start: string, end: string): MarketHour[] {
  const first = Date.parse(start);
  const last = Date.parse(end);
  const sorted = [...hours].sort((a, b) => a.start.localeCompare(b.start));
  if (!Number.isFinite(first) || !Number.isFinite(last) || sorted.length !== (last - first) / HOUR) {
    throw new Error('Dynamische prijsreeks is onvolledig; een volledig jaar uurprijzen is vereist.');
  }
  sorted.forEach((point, index) => {
    if (Date.parse(point.start) !== first + index * HOUR || !Number.isFinite(point.marketPriceEurPerKwh)) {
      throw new Error('Dynamische prijsreeks bevat ontbrekende, dubbele of ongeldige uurprijzen.');
    }
  });
  return sorted;
}

// Official API: https://docs.api.energyzero.nl/docs/api/swagger/public/energy-market-service-get-prices/
// `base[].price.value` is the electricity market price in EUR/kWh, excluding supplier costs and VAT.
export async function fetchRecentMarketYear(now = new Date(), fetchImpl: typeof fetch = fetch): Promise<MarketYear> {
  const endMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const startMs = endMs - 365 * DAY;
  const key = new Date(endMs).toISOString();
  if (fetchImpl === fetch && cache.has(key)) return cache.get(key)!;
  const load = async (): Promise<MarketYear> => {
    const byStart = new Map<string, MarketHour>();
    // Each request covers the preceding, requested and following local day.
    const dates: number[] = [];
    for (let time = startMs; time <= endMs; time += 2 * DAY) dates.push(time);
    dates.push(endMs);
    let cursor = 0;
    let failed = false;
    await Promise.all(Array.from({ length: 4 }, async () => {
      try {
        while (!failed && cursor < dates.length) {
          const date = new Date(dates[cursor++]);
          const dateKey = `${String(date.getUTCDate()).padStart(2, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${date.getUTCFullYear()}`;
          const url = new URL('https://public.api.energyzero.nl/public/v1/prices');
          url.searchParams.set('date', dateKey);
          url.searchParams.set('energyType', 'ENERGY_TYPE_ELECTRICITY');
          url.searchParams.set('interval', 'INTERVAL_HOUR');
          let payload: { base?: Array<{ start: string; end: string; price?: { value?: string } }> } | undefined;
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const response = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
              if (!response.ok) throw new Error(`Prijsbron niet beschikbaar (HTTP ${response.status}).`);
              payload = await response.json();
              break;
            } catch (error) {
              if (attempt === 1) throw error;
              await new Promise((resolve) => setTimeout(resolve, 500));
            }
          }
          if (!Array.isArray(payload?.base) || !payload.base.length) throw new Error('Prijsbron bevat geen uurprijzen.');
          for (const row of payload.base) {
            const time = Date.parse(row.start);
            if (time < startMs || time >= endMs) continue;
            const price = row.price?.value == null || row.price.value === '' ? NaN : Number(row.price.value);
            if (!Number.isFinite(time) || !Number.isFinite(price) || Date.parse(row.end) - time !== HOUR) {
              throw new Error('Prijsbron bevat een ongeldig uurinterval.');
            }
            const start = new Date(time).toISOString();
            const previous = byStart.get(start);
            if (previous && previous.marketPriceEurPerKwh !== price) throw new Error('Prijsbron bevat tegenstrijdige uurprijzen.');
            byStart.set(start, { start, marketPriceEurPerKwh: price });
          }
        }
      } catch (error) { failed = true; throw error; }
    }));
    const start = new Date(startMs).toISOString();
    return { start, end: key, fetchedAt: now.toISOString(), source: 'EnergyZero, Nederlandse elektriciteitsmarkt (uurprijzen, excl. btw)', hours: validateMarketYear([...byStart.values()], start, key) };
  };
  const pending = load();
  if (fetchImpl === fetch) {
    cache.clear();
    cache.set(key, pending);
  }
  try { return await pending; } catch (error) {
    if (cache.get(key) === pending) cache.delete(key);
    throw new Error(`Dynamische jaarprijzen konden niet volledig worden opgehaald. ${error instanceof Error ? error.message : ''} Probeer later opnieuw; er is geen gemiddelde prijs als vervanging gebruikt.`);
  }
}
