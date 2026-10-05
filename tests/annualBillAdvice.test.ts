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
    const advice = result!.annualBillAdvice!;
    expect(advice.recommendedBatteryKwh).toBe(20.48);
    const selected = advice.options.find(option => option.batteryKwh === advice.recommendedBatteryKwh)!;
    expect(selected.percentOfMaximumSavings).toBeGreaterThanOrEqual(0.9);
    expect(advice.options.filter(option => option.batteryKwh < selected.batteryKwh).every(option => option.percentOfMaximumSavings < 0.9)).toBe(true);
    expect(result?.sizing.recommendedProduct).not.toBeNull();
    expect(result?.annualBillAdvice?.explanation).toContain('indicatief batterijadvies');
    expect(result?.annualBillAdvice?.explanation).toContain('minimaal 90%');
    expect(result?.annualBillAdvice?.explanation).not.toContain('kortste eenvoudige terugverdientijd');
    expect(result?.pvWarnings?.join(' ')).toContain('geen uitspraak over rendabiliteit');
    expect(result?.pvWarnings?.join(' ')).toContain('geen geverifieerde offertes');
    expect(result?.quality.warnings).toEqual([]);
  });

  it('passes capacity-specific investments to annual advice without treating a total quote as a price for every option', () => {
    const result = buildAnnualBillIndicativeAnalysis({ totalUsageKwh: 4200, totalFeedInKwh: 1800,
      batteryInvestmentEur: 7000, batteryInvestmentCapacityKwh: 10.24, batteryInvestmentsEurByKwh: { '15.36': 8000 } }, defaultAnalysisSettings)!;
    expect(result.annualBillAdvice!.options.find(option => option.batteryKwh === 10.24)?.estimatedInvestmentEur).toBe(7000);
    expect(result.annualBillAdvice!.options.find(option => option.batteryKwh === 15.36)?.estimatedInvestmentEur).toBe(8000);
    expect(result.annualBillAdvice!.options.find(option => option.batteryKwh === 7.68)?.investmentSource).toBe('estimated');
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
