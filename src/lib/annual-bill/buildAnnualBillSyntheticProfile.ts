export type AnnualBillInterval = { start: string; importKwh: number; exportKwh: number };
/** Price-independent shapes shared by the technical and financial profiles. Hour is interval midpoint. */
export function annualBillShape(month: number, hour: number, weekend: boolean, profile: 'home' | 'business') {
  const season = Math.cos((month - 1) * Math.PI / 6);
  const load = profile === 'business'
    ? (hour >= 8 && hour < 18 ? 1.8 : 0.35) * (weekend ? 0.45 : 1)
    : (hour >= 17 && hour < 23 ? 1.9 : hour >= 6 && hour < 9 ? 1.3 : hour < 6 ? 0.4 : 0.8) * (weekend ? 1.08 : 1);
  const daylight = 12 - 4 * season;
  return { load: load * (1 + 0.25 * season), solar: Math.abs(hour - 13) < daylight / 2
    ? Math.max(0, Math.sin(Math.PI * (hour - (13 - daylight / 2)) / daylight)) * (1 - 0.7 * season) : 0 };
}
export function buildAnnualBillSyntheticProfile(importKwh: number, exportKwh: number, profile: 'home' | 'business' = 'home'): AnnualBillInterval[] {
  if (![importKwh, exportKwh].every(n => Number.isFinite(n) && n >= 0)) throw new Error('Ongeldige jaarvolumes');
  // Fixed non-leap calendar: price-year changes must never alter technical sizing.
  const weights = Array.from({ length: 365 * 96 }, (_, i) => {
    const date = new Date(Date.UTC(2025, 0, 1) + i * 900000);
    return { start: date.toISOString(), ...annualBillShape(date.getUTCMonth() + 1, date.getUTCHours() + date.getUTCMinutes() / 60 + 0.125, [0, 6].includes(date.getUTCDay()), profile) };
  });
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
