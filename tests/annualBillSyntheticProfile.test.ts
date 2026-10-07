import { describe, expect, it } from 'vitest';
import { buildAnnualBillSyntheticProfile as build, dailyStorageStatistics as stats } from '../src/lib/annual-bill/buildAnnualBillSyntheticProfile';

describe('synthetic annual profile', () => {
  it.each(['home', 'business'] as const)('preserves exact annual totals and 35040 ordered quarters for %s', profile => {
    const rows = build(4200, 1800, profile);
    expect(rows).toHaveLength(35040);
    expect(rows[0].start).toBe('2025-01-01T00:00:00.000Z');
    expect(rows.at(-1)!.start).toBe('2025-12-31T23:45:00.000Z');
    expect(rows.every((r, i) => !i || Date.parse(r.start) - Date.parse(rows[i - 1].start) === 900000)).toBe(true);
    expect(rows.reduce((s, r) => s + r.importKwh, 0)).toBeCloseTo(4200, 7);
    expect(rows.reduce((s, r) => s + r.exportKwh, 0)).toBeCloseTo(1800, 7);
    expect(rows.every(r => r.importKwh >= 0 && r.exportKwh >= 0)).toBe(true);
    const solar = (month: string) => rows.filter(r => r.start.startsWith(month)).reduce((s, r) => s + r.exportKwh, 0);
    expect(solar('2025-07')).toBeGreaterThan(solar('2025-01'));
  });
  it('distinguishes household and business demand and weekday/weekend patterns', () => {
    const home = build(4200, 1800, 'home'); const business = build(4200, 1800, 'business');
    expect(home[48].importKwh).not.toBe(business[48].importKwh);
    expect(home[18 * 4].importKwh).toBeGreaterThan(home[48].importKwh);
    expect(business[48].importKwh).toBeGreaterThan(business[18 * 4].importKwh);
    expect(business[3 * 96 + 48].importKwh).toBeLessThan(business[48].importKwh);
  });
  it('supports zero export and rejects nonfinite/negative energy', () => {
    expect(stats(build(4200, 0))).toEqual({ p50: 0, p75: 0, p90: 0 });
    for (const value of [-1, NaN, Infinity]) expect(() => build(value, 0)).toThrow();
  });
});

describe('chronological daily storage demand', () => {
  const row = (hour: number, imp: number, exp: number, day = 1) => ({ start: new Date(Date.UTC(2025, 0, day, hour)).toISOString(), importKwh: imp, exportKwh: exp });
  it('cannot use afternoon export for earlier morning import', () => {
    expect(stats([row(8, 10, 0), row(12, 0, 10)])).toEqual({ p50: 0, p75: 0, p90: 0 });
    expect(stats([row(8, 10, 0), row(12, 0, 10), row(18, 4, 0)])).toEqual({ p50: 4, p75: 4, p90: 4 });
  });
  it('nets overlap and resets theoretical storage on each calendar day', () => {
    expect(stats([row(12, 10, 10), row(18, 10, 0)])).toEqual({ p50: 0, p75: 0, p90: 0 });
    expect(stats([row(12, 0, 10), row(8, 10, 0, 2)])).toEqual({ p50: 0, p75: 0, p90: 0 });
  });
  it('computes nearest-rank percentiles of chronological daily shifted energy', () => {
    const rows = Array.from({ length: 20 }, (_, i) => [row(12, 0, 50, i + 1), row(18, i + 1, 0, i + 1)]).flat();
    expect(stats(rows)).toEqual({ p50: 10, p75: 15, p90: 18 });
    expect(stats([])).toEqual({ p50: 0, p75: 0, p90: 0 });
  });
});
