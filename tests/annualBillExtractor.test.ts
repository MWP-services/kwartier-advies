import { describe, expect, it } from 'vitest';
import { extractAnnualBillData } from '@/src/lib/annual-bill/extractAnnualBillData';
import { normalizeAnnualBillData } from '@/src/lib/annual-bill/normalizeAnnualBillData';
import { validateAnnualBillExtract } from '@/src/lib/annual-bill/validateAnnualBillExtract';

describe('annual bill extractor', () => {
  it('extracts common annual bill fields using semantic labels', () => {
    const text = `
      Energie leverancier
      Factuurdatum 12-02-2025
      EAN 871234567890123456
      Totaal verbruik elektriciteit 4.250 kWh
      Totale teruglevering 1.800 kWh
      Normaaltarief 0,31 per kWh
      Terugleververgoeding 0,08 per kWh
    `;

    const input = normalizeAnnualBillData(extractAnnualBillData(text));

    expect(input.invoiceDate).toBe('2025-02-12');
    expect(input.eanElectricity).toBe('871234567890123456');
    expect(input.totalUsageKwh).toBe(4250);
    expect(input.totalFeedInKwh).toBe(1800);
    expect(input.normalTariffEurPerKwh).toBeCloseTo(0.31, 5);
    expect(input.feedInTariffEurPerKwh).toBeCloseTo(0.08, 5);
  });

  it('derives totals from normal and off-peak values when totals are not found', () => {
    const text = `
      Verbruik normaal 2.000 kWh
      Verbruik dal 1.500 kWh
      Teruglevering normaal 900 kWh
      Teruglevering dal 300 kWh
    `;

    const input = normalizeAnnualBillData(extractAnnualBillData(text));

    expect(input.totalUsageKwh).toBe(3500);
    expect(input.totalFeedInKwh).toBe(1200);
  });

  it('only blocks when usage and feed-in are both missing', () => {
    const issues = validateAnnualBillExtract({ source: 'pdf', extractionConfidence: 0.2 });

    expect(issues.some((issue) => issue.field === 'totalUsageKwh' && issue.severity === 'missing')).toBe(true);
    expect(issues.some((issue) => issue.field === 'extractionConfidence' && issue.severity === 'warning')).toBe(true);

    const partialIssues = validateAnnualBillExtract({ totalFeedInKwh: 1200, source: 'pdf', extractionConfidence: 0.6 });
    expect(partialIssues.some((issue) => issue.severity === 'missing')).toBe(false);
  });
});
