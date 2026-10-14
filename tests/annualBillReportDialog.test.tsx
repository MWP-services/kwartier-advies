import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnnualBillReportDialog } from '../components/AnnualBillReportDialog';
import { calculateAnnualBillAdvice } from '../src/lib/annual-bill/calculateAnnualBillAdvice';
import { getAnnualBillReportOptions } from '../src/lib/annual-bill/reportOptions';

const advice = calculateAnnualBillAdvice({
  physicalEnergy: { gridImportKwh: 35444, gridExportKwh: 16439, periodStart: '2024-10-01', periodEnd: '2025-09-29' },
  consumptionProfile: 'office'
});
const options = getAnnualBillReportOptions(advice);

describe('annual bill report selection dialog', () => {
  it('lets the user select each of the three available capacities and a report type', () => {
    const setSelectedCapacity = vi.fn();
    const setReportType = vi.fn();
    render(<AnnualBillReportDialog advice={advice} options={options} selectedCapacity={40} setSelectedCapacity={setSelectedCapacity} reportType="customer" setReportType={setReportType} onGenerate={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /40 kWh/ })).toBeChecked();
    for (const capacity of [64, 96]) {
      fireEvent.click(screen.getByRole('radio', { name: new RegExp(`${capacity} kWh`) }));
      expect(setSelectedCapacity).toHaveBeenLastCalledWith(capacity);
    }
    fireEvent.click(screen.getByLabelText(/Technisch rapport/));
    expect(setReportType).toHaveBeenCalledWith('technical');
    expect(screen.getByRole('button', { name: 'Genereer adviesrapport' })).toBeEnabled();
  });
});
