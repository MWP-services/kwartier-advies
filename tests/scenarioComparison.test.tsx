import React, { useState, type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScenarioTable } from '@/components/ScenarioTable';
import { ScenarioCharts } from '@/components/ScenarioCharts';
import type { ScenarioResult } from '@/lib/simulation';
import type { SizingResult } from '@/lib/calculations';

vi.stubGlobal('React', React);
// Test the data sent to charts; jsdom does not implement chart layout measurements.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ComposedChart: ({ data }: { data: unknown }) => <div data-testid="chart-data">{JSON.stringify(data)}</div>,
  Bar: () => null, CartesianGrid: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null
}));
afterEach(cleanup);

function scenario(capacityKwh: number): ScenarioResult {
  return {
    capacityKwh, optionLabel: `${capacityKwh} kWh`,
    maxChargeKw: capacityKwh / 2, maxDischargeKw: capacityKwh / 2,
    exceedanceIntervalsBefore: 0, exceedanceIntervalsAfter: 0,
    exceedanceEnergyKwhBefore: 0, exceedanceEnergyKwhAfter: 0,
    achievedComplianceDataset: 1, achievedComplianceDailyAverage: 1, achievedCompliance: 1,
    maxRemainingExcessKw: 0, endingSocKwh: 0, shavedSeries: [],
    importReductionKwhAnnualized: capacityKwh * 10,
    exportReductionKwhAnnualized: capacityKwh * 12,
    cyclesPerYear: 300 - capacityKwh, annualValueEur: capacityKwh * 3, paybackYears: capacityKwh / 8
  };
}
const scenarios = [10.24, 20.48, 30, 40, 64, 96, 128, 232].map(scenario);
const sizing: SizingResult = {
  kWhNeededRaw: 50, kWhNeeded: 64, kWNeededRaw: 32, kWNeeded: 32,
  recommendedProduct: { capacityKwh: 64, powerKw: 32, label: '64 kWh' },
  alternativeProduct: null, noFeasibleBatteryByPower: false
};

function Comparison({ initial = 64, options = scenarios }: { initial?: number; options?: ScenarioResult[] }) {
  const [selected, setSelected] = useState(initial);
  return <>
    <ScenarioTable analysisType="PV_SELF_CONSUMPTION" scenarios={options} recommendedCapacityKwh={64}
      selectedScenarioCapacity={selected} onSelectScenario={setSelected} />
    <ScenarioCharts analysisType="PV_SELF_CONSUMPTION" scenarios={options} sizing={sizing}
      selectedScenarioCapacity={selected} onSelectScenario={setSelected} efficiency={0.95} safetyFactor={1.1} compliance={0.9} />
  </>;
}

describe('PV scenario comparison', () => {
  it('shows nearby smaller and larger options immediately and marks the recommendation', () => {
    render(<Comparison />);
    const comparison = screen.getByRole('region', { name: 'Vergelijking batterijopties' });
    expect(comparison.closest('details')).toBeNull();
    expect(within(comparison).getAllByRole('article').map(card => card.getAttribute('aria-label')))
      .toEqual(['30 kWh batterij', '40 kWh batterij', '64 kWh batterij', '96 kWh batterij', '128 kWh batterij']);
    const recommended = within(comparison).getByRole('article', { name: '64 kWh batterij' });
    expect(within(recommended).getByText('Aanbevolen')).toBeVisible();
    for (const value of ['640.0 kWh/jaar', '768.0 kWh/jaar', '236.0', '192.00 EUR/jaar', '8.0 jaar']) {
      expect(within(recommended).getByText(value)).toBeVisible();
    }
  });

  it('updates impact through dropdown and card selection while keeping general sizing unchanged', () => {
    render(<Comparison />);
    const chartsBefore = screen.getAllByTestId('chart-data').map(chart => chart.textContent);
    const impact = screen.getByRole('region', { name: 'Impact geselecteerde batterij' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Batterijcapaciteit' }), { target: { value: '40' } });
    expect(within(impact).getByText('400.0 kWh/jaar')).toBeVisible();
    expect(within(impact).getByText('480.0 kWh/jaar')).toBeVisible();
    expect(within(impact).getByText('260.0')).toBeVisible();
    expect(within(impact).getByText('120.00 EUR/jaar')).toBeVisible();
    expect(within(impact).getByText('5.0 jaar')).toBeVisible();
    expect(within(impact).queryByText('640.0 kWh/jaar')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Selecteer 96 kWh' }));
    expect(screen.getByRole('combobox')).toHaveValue('96');
    expect(within(impact).getByText('960.0 kWh/jaar')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Selecteer 96 kWh' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByTestId('chart-data').map(chart => chart.textContent)).toEqual(chartsBefore);
    expect(screen.getByRole('heading', { name: 'Dimensioneringsopbouw algemeen advies (kWh)' })).toBeVisible();
  });

  it('keeps all scenarios available and preserves fractional capacities', () => {
    render(<Comparison />);
    fireEvent.click(screen.getByRole('button', { name: 'Toon alle 8 batterijopties' }));
    expect(screen.getAllByRole('article')).toHaveLength(8);
    expect(within(screen.getByRole('article', { name: '10.24 kWh batterij' })).getByText('10.24 kWh')).toBeVisible();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '10.24' } });
    expect(within(screen.getByRole('region', { name: 'Impact geselecteerde batterij' })).getByText('102.4 kWh/jaar')).toBeVisible();
  });

  it('labels missing values and dataset totals without inventing annual results', () => {
    const option = { ...scenario(64), annualValueEur: undefined, paybackYears: undefined,
      importReductionKwhAnnualized: undefined, importReductionKwh: 42, exportReductionKwhAnnualized: undefined };
    render(<Comparison options={[option]} />);
    const impact = screen.getByRole('region', { name: 'Impact geselecteerde batterij' });
    expect(within(impact).getByText('42.0 kWh in dataset')).toBeVisible();
    expect(within(impact).getAllByText('Niet beschikbaar')).toHaveLength(3);
  });

  it('uses the same fallback scenario for the selector and impact after data changes', () => {
    const { rerender } = render(<Comparison initial={96} />);
    rerender(<Comparison options={scenarios.filter(option => option.capacityKwh !== 96)} />);
    expect(screen.getByRole('combobox')).toHaveValue('64');
    expect(screen.getByRole('button', { name: 'Selecteer 64 kWh' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('region', { name: 'Impact geselecteerde batterij' })).getByText('640.0 kWh/jaar')).toBeVisible();
  });

  it('updates existing financial results in both the comparison and selected impact', () => {
    const { rerender } = render(<Comparison options={[{ ...scenario(64), annualValueEur: undefined, paybackYears: undefined }]} />);
    rerender(<Comparison options={[{ ...scenario(64), annualValueEur: 1234, paybackYears: 4.2 }]} />);
    for (const region of ['Vergelijking batterijopties', 'Impact geselecteerde batterij']) {
      const view = within(screen.getByRole('region', { name: region }));
      expect(view.getByText('1234.00 EUR/jaar')).toBeVisible();
      expect(view.getByText('4.2 jaar')).toBeVisible();
    }
  });

  it('handles empty scenarios', () => {
    render(<Comparison options={[]} />);
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });

  it('keeps valid zero impact and zero financial values visible', () => {
    render(<Comparison options={[{ ...scenario(64), importReductionKwhAnnualized: 0, annualValueEur: 0 }]} />);
    const impact = within(screen.getByRole('region', { name: 'Impact geselecteerde batterij' }));
    expect(impact.getByText('0.0 kWh/jaar')).toBeVisible();
    expect(impact.getByText('0.00 EUR/jaar')).toBeVisible();
  });

  it('preserves the peak-shaving table metrics', () => {
    render(<ScenarioTable analysisType="PEAK_SHAVING" recommendedCapacityKwh={64}
      scenarios={[{ ...scenario(64), exceedanceEnergyKwhBefore: 100, exceedanceEnergyKwhAfter: 25 }]} />);
    const table = within(screen.getByRole('table'));
    expect(table.getByText('100.00')).toBeVisible();
    expect(table.getByText('25.00')).toBeVisible();
    expect(table.getByText('75.00')).toBeVisible();
    expect(table.getByText('25.00%')).toBeVisible();
  });
});
