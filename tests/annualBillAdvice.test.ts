import { describe, expect, it } from 'vitest';
import { defaultAnalysisSettings } from '@/lib/analysis';
import { buildAnnualBillIndicativeAnalysis } from '@/lib/annualBillAdvice';

describe('annual bill PV advice', () => {
  it('builds an indicative PV advice from annual usage and feed-in totals', () => {
    const result = buildAnnualBillIndicativeAnalysis(
      {
        totalUsageKwh: 4200,
        totalFeedInKwh: 1800,
        source: 'manual'
      },
      {
        ...defaultAnalysisSettings,
        analysisType: 'PV_SELF_CONSUMPTION',
        pvInputMode: 'manualAnnualBill'
      }
    );

    expect(result).not.toBeNull();
    expect(result?.analysisType).toBe('PV_SELF_CONSUMPTION');
    expect(result?.sizing.recommendedProduct).not.toBeNull();
    expect(result?.pvWarnings?.some((warning) => warning.includes('Indicatief advies'))).toBe(true);
  });

  it('continues with an estimated feed-in value when only usage is available', () => {
    const result = buildAnnualBillIndicativeAnalysis(
      {
        totalUsageKwh: 4200,
        source: 'manual'
      },
      {
        ...defaultAnalysisSettings,
        analysisType: 'PV_SELF_CONSUMPTION',
        pvInputMode: 'manualAnnualBill'
      }
    );

    expect(result).not.toBeNull();
    expect(result?.pvWarnings?.some((warning) => warning.includes('teruglevering geschat'))).toBe(true);
  });

  it('returns null when both annual usage and feed-in are missing', () => {
    const result = buildAnnualBillIndicativeAnalysis(
      {
        source: 'manual'
      },
      {
        ...defaultAnalysisSettings,
        analysisType: 'PV_SELF_CONSUMPTION',
        pvInputMode: 'manualAnnualBill'
      }
    );

    expect(result).toBeNull();
  });
});
