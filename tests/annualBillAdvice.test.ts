import { describe, expect, it } from 'vitest';
import { defaultAnalysisSettings } from '@/lib/analysis';
import { buildAnnualBillIndicativeAnalysis } from '@/lib/annualBillAdvice';

describe('single annual-bill technical source', () => {
  it('uses identical selected capacity and physical results in analysis, scenarios and advice', () => {
    const result = buildAnnualBillIndicativeAnalysis({ totalUsageKwh: 4200, totalFeedInKwh: 1800, source: 'manual' }, defaultAnalysisSettings)!;
    const advice = result.annualBillAdvice!;
    expect(advice.recommendationStatus).toBe('recommended');
    expect(result.sizing.recommendedProduct?.capacityKwh).toBe(advice.recommendedBatteryKwh);
    expect(result.sizing.alternativeProduct?.capacityKwh).toBe(advice.spaciousBatteryKwh);
    expect(result.scenarios.map(s => s.importReductionKwh)).toEqual(advice.options.map(o => o.annualGridImportReductionKwh));
    expect(result.intervals).toEqual([]);
    expect(result.pvWarnings).toEqual(advice.warnings);
  });
  it.each([{ totalUsageKwh: 4200 }, { totalFeedInKwh: 1800 }, {}])('returns insufficient status without estimating energy: %j', input => {
    const result = buildAnnualBillIndicativeAnalysis({ ...input, source: 'manual' }, defaultAnalysisSettings)!;
    expect(result.annualBillAdvice?.recommendationStatus).toBe('insufficient_data');
    expect(result.sizing.recommendedProduct).toBeNull();
    expect(result.scenarios).toEqual([]);
    expect(result.pvWarnings?.join(' ')).not.toContain('teruglevering geschat');
  });
  it('returns no-solar status for explicit zero export', () => {
    const result = buildAnnualBillIndicativeAnalysis({ totalUsageKwh: 4200, totalFeedInKwh: 0, source: 'manual' }, defaultAnalysisSettings)!;
    expect(result.annualBillAdvice?.recommendationStatus).toBe('no_solar_shift');
    expect(result.sizing.recommendedProduct).toBeNull();
  });
});
