import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AnnualBillSavings } from '../components/AnnualBillSavings';
import { calculateAnnualBillAdvice } from '../src/lib/annual-bill/calculateAnnualBillAdvice';
import { generateAnnualBillReportHtml } from '../lib/annualBillReportHtml';
import { annualBillStatusLabel } from '../src/lib/annual-bill/annualBillPresentation';

afterEach(cleanup);
describe('calculated versus unavailable savings', () => {
  it('renders not calculated without a numerical range for insufficient energy on screen and in PDF', () => {
    const input = { source: 'manual' as const, totalUsageKwh: 4200 };
    const advice = calculateAnnualBillAdvice(input);
    expect(advice.savingsCalculationStatus).toBe('not_calculated');
    expect(advice.storageStatistics).toBeUndefined();
    render(<AnnualBillSavings advice={advice} />);
    expect(screen.getByText('Besparing niet berekend')).toBeInTheDocument();
    expect(screen.queryByText(/bandbreedte/)).not.toBeInTheDocument();
    expect(screen.queryByText(/€\s*0/)).not.toBeInTheDocument();
    const html = generateAnnualBillReportHtml({ input, advice }, null, null);
    expect(html).toContain('Besparing niet berekend');
    expect(html).toContain('Onvoldoende betrouwbare energiegegevens');
    expect(html).not.toContain('als middenwaarde');
    expect(html).not.toContain('Met batterij (schatting)');
    expect(html).not.toContain('0 / 0 / 0 kWh');
  });
  it('preserves genuine zero savings for usable zero export', () => {
    const input = { source: 'manual' as const, totalUsageKwh: 4200, totalFeedInKwh: 0 };
    const advice = calculateAnnualBillAdvice(input);
    expect(advice.recommendationStatus).toBe('no_solar_shift');
    expect(advice.savingsCalculationStatus).toBe('calculated');
    expect(annualBillStatusLabel(advice)).toContain('Bruikbare gegevens');
    render(<AnnualBillSavings advice={advice} />);
    expect(screen.queryByText('Besparing niet berekend')).not.toBeInTheDocument();
    expect(screen.getByText('€ 0')).toBeInTheDocument();
    const html = generateAnnualBillReportHtml({ input, advice }, null, null);
    expect(html).not.toContain('Besparing niet berekend');
    expect(html).toContain('als middenwaarde');
  });
  it('protects legacy insufficient payloads without the new calculation status', () => {
    const advice = calculateAnnualBillAdvice({ totalUsageKwh: 4200 });
    delete advice.savingsCalculationStatus;
    render(<AnnualBillSavings advice={advice} />);
    expect(screen.getByText('Besparing niet berekend')).toBeInTheDocument();
  });
});
