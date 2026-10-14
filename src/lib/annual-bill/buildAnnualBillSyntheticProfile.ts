export type ConsumptionProfile = 'home' | 'business' | 'office' | 'agricultural' | 'continuous' | 'custom' | 'unknown';
export type CustomConsumption = { dayPercent: number; nightPercent: number; weekendPercent: number };
export type AnnualBillInterval = { start: string; importKwh: number; exportKwh: number };
/** Price-independent shapes shared by the technical and financial profiles. Hour is interval midpoint. */
export function annualBillShape(month: number, hour: number, weekend: boolean, profile: ConsumptionProfile) {
  const season = Math.cos((month - 1) * Math.PI / 6);
  const load = profile === 'continuous' || profile === 'unknown' || profile === 'custom' ? 1 : profile === 'agricultural' ? (hour >= 5 && hour < 23 ? 1.2 : 0.85) : profile === 'business' || profile === 'office'
    ? (hour >= 8 && hour < 18 ? 1.8 : 0.35) * (weekend ? 0.45 : 1)
    : (hour >= 17 && hour < 23 ? 1.9 : hour >= 6 && hour < 9 ? 1.3 : hour < 6 ? 0.4 : 0.8) * (weekend ? 1.08 : 1);
  const daylight = 12 - 4 * season;
  return { load: load * (1 + 0.25 * season), solar: Math.abs(hour - 13) < daylight / 2
    ? Math.max(0, Math.sin(Math.PI * (hour - (13 - daylight / 2)) / daylight)) * (1 - 0.7 * season) : 0 };
}
export function buildAnnualBillSyntheticProfile(importKwh: number, exportKwh: number, profile: ConsumptionProfile = 'home', variation = 0, custom?: CustomConsumption): AnnualBillInterval[] {
  if (![importKwh, exportKwh].every(n => Number.isFinite(n) && n >= 0)) throw new Error('Ongeldige jaarvolumes');
  // Fixed non-leap calendar: price-year changes must never alter technical sizing.
  const weights = Array.from({ length: 365 * 96 }, (_, i) => {
    const date = new Date(Date.UTC(2025, 0, 1) + i * 900000);
    return { start: date.toISOString(), ...annualBillShape(date.getUTCMonth() + 1, date.getUTCHours() + date.getUTCMinutes() / 60 + 0.125, [0, 6].includes(date.getUTCDay()), profile) };
  });
  if (profile === 'custom' && custom && (![custom.dayPercent, custom.nightPercent, custom.weekendPercent].every(n => Number.isFinite(n) && n >= 0 && n <= 100) || Math.abs(custom.dayPercent + custom.nightPercent - 100) > 0.01)) throw new Error('Maatwerk: dag en nacht moeten samen 100% zijn; weekend is aandeel van de week.');
  for (const row of weights) {
    const d = new Date(row.start); const h = d.getUTCHours();
    row.load *= h >= 18 || h < 7 ? 1 + variation : 1 - variation;
  }
  if (profile === 'custom' && custom) {
    const category = (start: string) => { const d = new Date(start); return [0, 6].includes(d.getUTCDay()) ? 2 : d.getUTCHours() >= 7 && d.getUTCHours() < 19 ? 0 : 1; };
    const sums = [0, 0, 0]; weights.forEach(r => sums[category(r.start)] += r.load);
    const shares = [(1-custom.weekendPercent/100)*custom.dayPercent/100, (1-custom.weekendPercent/100)*custom.nightPercent/100, custom.weekendPercent/100];
    weights.forEach(r => { const c = category(r.start); r.load *= shares[c]/sums[c]; });
  }
  const load = weights.reduce((sum, x) => sum + x.load, 0);
  const solar = weights.reduce((sum, x) => sum + x.solar, 0);
  return weights.map(x => ({ start: x.start, importKwh: importKwh * x.load / load, exportKwh: exportKwh * x.solar / solar }));
}
export function dailyStorageStatistics(profile: AnnualBillInterval[]) {
  const days: number[] = [];
  let date = ''; let available = 0; let shifted = 0;
  for (const row of profile) {
    const nextDate = row.start.slice(0, 10);
    if (nextDate !== date) {
      if (date) days.push(shifted);
      date = nextDate; available = 0; shifted = 0;
    }
    const net = row.importKwh - row.exportKwh;
    // Unlimited, lossless theoretical storage, reset daily: morning demand cannot
    // borrow afternoon solar. Net direction matches the technical dispatch rule.
    if (net < 0) available -= net;
    else { const used = Math.min(available, net); shifted += used; available -= used; }
  }
  if (date) days.push(shifted);
  days.sort((a, b) => a - b);
  const percentile = (p: number) => days[Math.ceil(p * days.length) - 1] ?? 0;
  return { p50: percentile(0.5), p75: percentile(0.75), p90: percentile(0.9) };
}
