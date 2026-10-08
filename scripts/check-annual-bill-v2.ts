/** Reproducible model sanity checks; no expected product sizes or live prices.
 * Bundle with esbuild for node, then run the resulting file. Output is not source.
 */
import { buildAnnualBillIndicativeAnalysis } from '../lib/annualBillAdvice';
import { defaultAnalysisSettings, type AnnualBillInput } from '../lib/analysis';
import type { MarketYear } from '../src/lib/annual-bill/recentDynamicPrices';

const base: AnnualBillInput = { source: 'manual', totalUsageKwh: 4200, totalFeedInKwh: 1800,
  consumptionProfile: 'home', periodStart: '2025-01-01', periodEnd: '2026-01-01', contractType: 'fixed' };
const marketYear: MarketYear = { start: '2025-01-01T00:00:00.000Z', end: '2026-01-01T00:00:00.000Z',
  source: 'Synthetische prijsfixture voor onafhankelijkheidscontrole', fetchedAt: '2026-01-01T00:00:00.000Z',
  hours: Array.from({ length: 8760 }, (_, i) => ({ start: new Date(Date.parse('2025-01-01') + i * 3600000).toISOString(), marketPriceEurPerKwh: i % 24 < 6 ? 0.05 : 0.25 })) };
const cases: { scenario: string; patch?: Partial<AnnualBillInput>; reserve?: number }[] = [
  { scenario: 'A home 4200/1800' },
  { scenario: 'B business 4200/1800', patch: { consumptionProfile: 'business' } },
  { scenario: 'C business 35000/16000', patch: { consumptionProfile: 'business', totalUsageKwh: 35000, totalFeedInKwh: 16000 } },
  { scenario: 'D export ontbreekt', patch: { totalFeedInKwh: undefined } },
  { scenario: 'E export nul', patch: { totalFeedInKwh: 0 } },
  { scenario: 'F noodreserve 10%', reserve: 10 },
  { scenario: 'G dynamic 4200/1800', patch: { contractType: 'dynamic' } }
];
const analyses = cases.map(c => buildAnnualBillIndicativeAnalysis({ ...base, ...c.patch },
  { ...defaultAnalysisSettings, emergencyPowerEnabled: !!c.reserve, emergencyPowerReservePercent: c.reserve ?? 0 },
  c.patch?.contractType === 'dynamic' ? marketYear : undefined)!);
const results = analyses.map((analysis, i) => {
  const advice = analysis.annualBillAdvice!;
  const selected = advice.options.find(o => o.batteryKwh === advice.recommendedBatteryKwh);
  return { scenario: cases[i].scenario, status: advice.recommendationStatus, percentiles: advice.storageStatistics,
    candidates: advice.options.map(o => o.batteryKwh), capacities: [advice.conservativeBatteryKwh, advice.recommendedBatteryKwh, advice.spaciousBatteryKwh],
    importReductionKwh: selected?.annualGridImportReductionKwh ?? null,
    exportReductionKwh: selected?.annualExportReductionKwh ?? null,
    cycles: selected?.technicalSimulation?.equivalentCyclesPerYear ?? null, confidence: advice.confidence };
});
const fixed = analyses[0].annualBillAdvice!; const dynamic = analyses[6].annualBillAdvice!;
const technical = (a: typeof fixed) => ({ capacities: [a.conservativeBatteryKwh, a.recommendedBatteryKwh, a.spaciousBatteryKwh], simulations: a.options.map(o => o.technicalSimulation) });
const fixedDynamicIdentical = JSON.stringify(technical(fixed)) === JSON.stringify(technical(dynamic));
if (!fixedDynamicIdentical) throw new Error('Fixed/dynamic technical regression');
console.log(JSON.stringify({ fixedDynamicIdentical, results }, null, 2));
