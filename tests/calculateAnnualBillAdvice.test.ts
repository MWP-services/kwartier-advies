import { describe, expect, it } from 'vitest';
import { calculateAnnualBillAdvice } from '@/src/lib/annual-bill/calculateAnnualBillAdvice';

describe('calculate annual bill battery advice', () => {
  it('calculates recommendation, savings range and payback from annual bill totals', () => {
    const result = calculateAnnualBillAdvice({
      totalUsageKwh: 4200,
      totalFeedInKwh: 1800,
      annualPvProductionKwh: 5200,
      averageImportPriceEurPerKwh: 0.32,
      averageFeedInPriceEurPerKwh: 0.08,
      batteryInvestmentEur: 7000,
      batteryOptionsKwh: [5, 10, 15],
      periodStart: '2025-01-01',
      periodEnd: '2025-12-31'
    });

    expect(result.recommendedBatteryKwh).not.toBeNull();
    expect(result.totalUsageKwh).toBe(4200);
    expect(result.totalFeedInKwh).toBe(1800);
    expect(result.annualSavingsRangeEur.expected).toBeGreaterThan(0);
    expect(result.paybackRangeYears.expected).toBeGreaterThan(0);
    expect(result.confidence).toBe('medium');
    expect(result.minimumSocPercent).toBe(10);
    expect(result.efficiencyPercent).toBe(95);
  });

  it('uses fallback prices and lowers confidence when tariffs are missing', () => {
    const result = calculateAnnualBillAdvice({
      totalUsageKwh: 4200,
      totalFeedInKwh: 1800
    });

    expect(result.confidence).toBe('low');
    expect(result.warnings.some((warning) => warning.includes('Importprijs ontbreekt'))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('Terugleververgoeding ontbreekt'))).toBe(true);
  });

  it('keeps 10 percent minimum SOC and applies an extra emergency reserve', () => {
    const normal = calculateAnnualBillAdvice({
      totalUsageKwh: 4200,
      totalFeedInKwh: 1800,
      batteryOptionsKwh: [64]
    });
    const emergency = calculateAnnualBillAdvice({
      totalUsageKwh: 4200,
      totalFeedInKwh: 1800,
      batteryOptionsKwh: [64],
      emergencyPowerEnabled: true,
      emergencyPowerReservePercent: 10
    });

    expect(normal.options[0].usableCapacityKwh).toBe(57.6);
    expect(emergency.options[0].usableCapacityKwh).toBe(51.2);
    expect(emergency.options[0].estimatedAnnualStoredSolarKwh).toBeLessThan(normal.options[0].estimatedAnnualStoredSolarKwh);
  });
});
