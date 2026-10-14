import { describe, expect, it } from 'vitest';
import { calculateAnnualBillAdvice } from '../src/lib/annual-bill/calculateAnnualBillAdvice';
import { getAnnualBillReportOptions, getSelectedAnnualBillReportOption } from '../src/lib/annual-bill/reportOptions';
import { generateAnnualBillCustomerReportHtml } from '../lib/annualBillCustomerReportHtml';
import { generateInteractiveReportHtml } from '../lib/reportHtml';
import type { PdfPayload } from '../lib/pdf';

const advice = calculateAnnualBillAdvice({
  physicalEnergy: { gridImportKwh: 35444, gridExportKwh: 16439, periodStart: '2024-10-01', periodEnd: '2025-09-29' },
  totalUsageKwh: 19005,
  consumptionProfile: 'office'
});
const input = { source: 'pdf' as const };
const options = getAnnualBillReportOptions(advice);

describe('V3.1 customer report capacity selection', () => {
  it('uses the Eneco office case options around the automatic recommendation', () => {
    expect(advice.recommendedBatteryKwh).toBe(40);
    expect(options.map((option) => option.batteryKwh)).toEqual([40, 64, 96]);
    expect(advice.energyBasis?.originalImportKwh).toBe(35444);
    expect(advice.energyBasis?.originalExportKwh).toBe(16439);
    expect(advice.totalUsageKwh).toBeCloseTo(35444 * 365 / 363);
  });

  it.each([40, 64, 96])('renders the selected %i kWh simulation without changing the V3 recommendation', (capacity) => {
    const recommendationBefore = advice.recommendedBatteryKwh;
    const option = getSelectedAnnualBillReportOption(advice, capacity);
    const html = generateAnnualBillCustomerReportHtml({ input, advice, selectedReportBatteryKwh: capacity, reportType: 'customer' }, null, null);
    expect(html).toContain(`${capacity.toLocaleString('nl-NL')} kWh`);
    expect(html).toContain(`${option.annualGridImportReductionKwh!.toLocaleString('nl-NL', { maximumFractionDigits: 0 })} kWh`);
    expect(html).toContain('Importreductie per jaar');
    expect(html).toContain('Opslaan als PDF');
    expect(html).toContain('@page{size:A4');
    expect(html).not.toContain('P50');
    expect(html).not.toContain('annual-table');
    expect(advice.recommendedBatteryKwh).toBe(recommendationBefore);
  });

  it('gives a distinct rationale per selected capacity and correctly shows marginal gain', () => {
    const reports = [40, 64, 96].map((capacity) => generateAnnualBillCustomerReportHtml({ input, advice, selectedReportBatteryKwh: capacity, reportType: 'customer' }, null, null));
    const rationales = reports.map((report) => report.match(/<div class="why"><p>(.*?)<\/p>/)?.[1]);
    expect(new Set(rationales).size).toBe(3);
    const delta = options[1].annualGridImportReductionKwh! - options[0].annualGridImportReductionKwh!;
    expect(reports[1]).toContain(`${Math.round(delta).toLocaleString('nl-NL')} kWh meer`);
    expect(reports[1]).toContain('Geselecteerd alternatief');
    expect(reports[1]).not.toContain('Automatisch V3-advies</span></div></div>');
  });

  it('rejects unlisted capacities and blocks unreliable input', () => {
    expect(() => getSelectedAnnualBillReportOption(advice, 50)).toThrow(/geen geldige V3-simulatie/);
    expect(getAnnualBillReportOptions(calculateAnnualBillAdvice({ totalUsageKwh: 4200 }))).toEqual([]);
  });

  it('does not require a matching brochure to render the report', () => {
    const html = generateAnnualBillCustomerReportHtml({ input, advice, selectedReportBatteryKwh: 64, reportType: 'customer' }, null, null);
    expect(html).not.toContain('data:application/pdf');
    expect(html).not.toContain('WattsNext-brochure-40.pdf');
  });

  it('resolves the brochure from the selected capacity for both report types', () => {
    const payload = { analysisType: 'PV_SELF_CONSUMPTION', annualBill: { input, advice, selectedReportBatteryKwh: 64, reportType: 'customer' }, sizing: {} } as PdfPayload;
    const customer = generateInteractiveReportHtml(payload);
    expect(customer).toContain('WattsNext-brochure-64.pdf');
    expect(customer).not.toContain('WattsNext-brochure-40.pdf');
    payload.annualBill!.reportType = 'technical';
    const technical = generateInteractiveReportHtml(payload);
    expect(technical).toContain('Capaciteit gekozen voor dit rapport: 64 kWh');
    expect(technical).toContain('Automatische V3-aanbeveling: 40 kWh');
    expect(technical).toContain('WattsNext-brochure-64.pdf');
  });
});
