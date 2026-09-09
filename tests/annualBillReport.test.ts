import { describe, expect, it } from 'vitest';
import { defaultAnalysisSettings } from '../lib/analysis';
import { buildAnnualBillIndicativeAnalysis } from '../lib/annualBillAdvice';
import { generateInteractiveReportHtml } from '../lib/reportHtml';
import type { PdfPayload } from '../lib/pdf';

function payload(capacity?: number): PdfPayload {
  const result = buildAnnualBillIndicativeAnalysis({ totalUsageKwh: 4200, totalFeedInKwh: 1800, supplierName: '<script>alert(1)</script>', source: 'manual' }, { ...defaultAnalysisSettings, analysisType: 'PV_SELF_CONSUMPTION', pvInputMode: 'manualAnnualBill' })!;
  return {
    analysisType: 'PV_SELF_CONSUMPTION', reportVariant: 'advice', contractedPowerKw: 0,
    maxObservedKw: 0, exceedanceCount: 0, compliance: 1, method: 'P95', efficiency: 0.9, safetyFactor: 1,
    sizing: result.sizing, quality: result.quality, topEvents: [], scenarios: result.scenarios,
    annualBill: { input: result.annualBillInput!, advice: { ...result.annualBillAdvice!, ...(capacity == null ? {} : { recommendedBatteryKwh: capacity }) }, warnings: result.pvWarnings }
  };
}

describe('annual bill report', () => {
  it('uses annual totals and recommendation, embeds matching brochure, escapes user text and renders offline charts', () => {
    const input = payload();
    const html = generateInteractiveReportHtml(input);
    expect(html).toContain('Batterijadvies op basis van jaarnota');
    expect(html).toContain('4.200');
    expect(html).toContain(`${input.annualBill!.advice.recommendedBatteryKwh} kWh`);
    expect(html).toContain(`WattsNext-brochure-${input.annualBill!.advice.recommendedBatteryKwh}.pdf`);
    expect(html).toContain('data:application/pdf;base64,');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('cdn.plot.ly');
    expect(html).toMatch(/0,06\/kWh/);
    expect(html.match(/<svg /g)).toHaveLength(3);
    expect(html).not.toContain('Formulebasis plus kwartiersimulatie');
    expect(input.annualBill!.input.totalUsageKwh).toBe(4200);
  });

  it('does not attach another battery brochure when the matching asset is absent', () => {
    const html = generateInteractiveReportHtml(payload(7));
    expect(html).toContain('geen bijpassende productbrochure beschikbaar');
    expect(html).not.toContain('data:application/pdf;base64,');
  });

  it('identifies estimated annual totals in the report', () => {
    const result = buildAnnualBillIndicativeAnalysis({ totalUsageKwh: 4200 }, { ...defaultAnalysisSettings, analysisType: 'PV_SELF_CONSUMPTION', pvInputMode: 'manualAnnualBill' })!;
    const input = payload();
    input.annualBill = { input: result.annualBillInput!, advice: result.annualBillAdvice! };
    const html = generateInteractiveReportHtml(input);
    expect(html).toContain('totale teruglevering geschat');
    expect(html).toContain('1.050');
  });
});
