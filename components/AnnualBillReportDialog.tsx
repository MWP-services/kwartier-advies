'use client';

import type { AnnualBillAdviceResult, AnnualBillBatteryOptionResult } from '@/src/lib/annual-bill/calculateAnnualBillAdvice';
import React from 'react';

type Props = {
  advice: AnnualBillAdviceResult;
  options: AnnualBillBatteryOptionResult[];
  selectedCapacity: number | null;
  setSelectedCapacity: (capacity: number) => void;
  reportType: 'customer' | 'technical';
  setReportType: (type: 'customer' | 'technical') => void;
  onGenerate: () => void;
  onCancel: () => void;
};

export function AnnualBillReportDialog({ advice, options, selectedCapacity, setSelectedCapacity, reportType, setReportType, onGenerate, onCancel }: Props) {
  const format = (value: number) => value.toLocaleString('nl-NL', { maximumFractionDigits: 0 });
  const role = (option: AnnualBillBatteryOptionResult, index: number) => option.batteryKwh === advice.recommendedBatteryKwh
    ? 'Automatische V3-aanbeveling'
    : option.batteryKwh > (advice.recommendedBatteryKwh ?? Infinity)
      ? index === options.length - 1 ? 'Grootste van deze opties' : 'Meer opslagreserve'
      : 'Compact alternatief';
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="annual-report-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl sm:p-7">
      <h2 id="annual-report-title" className="text-xl font-semibold text-slate-900">Kies een batterijcapaciteit voor het adviesrapport</h2>
      <p className="mt-2 text-sm text-slate-600">De berekende V3-aanbeveling blijft ongewijzigd. Kies welke doorgerekende capaciteit in het rapport centraal staat.</p>
      <fieldset className="mt-4 space-y-2"><legend className="sr-only">Batterijcapaciteit</legend>
        {options.map((option, index) => <label key={option.batteryKwh} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${selectedCapacity === option.batteryKwh ? 'border-lime-600 bg-lime-50' : 'border-slate-200'}`}>
          <input type="radio" name="annual-report-capacity" value={option.batteryKwh} checked={selectedCapacity === option.batteryKwh} onChange={() => setSelectedCapacity(option.batteryKwh)} className="mt-1 accent-lime-700" />
          <span className="flex-1"><strong className="text-slate-900">{format(option.batteryKwh)} kWh</strong><span className="ml-2 text-sm text-slate-600">{role(option, index)}</span><span className="mt-1 block text-sm text-slate-700">Verwachte jaarlijkse vermindering netafname: {format(option.annualGridImportReductionKwh!)} kWh</span></span>
          {option.batteryKwh === advice.recommendedBatteryKwh && <span className="rounded-full bg-lime-700 px-2 py-1 text-xs font-semibold text-white">V3-advies</span>}
        </label>)}
      </fieldset>
      <fieldset className="mt-5"><legend className="mb-2 text-sm font-semibold text-slate-800">Rapporttype</legend><div className="grid gap-2 sm:grid-cols-2">
        <label className={`cursor-pointer rounded-lg border p-3 ${reportType === 'customer' ? 'border-lime-600 bg-lime-50' : 'border-slate-200'}`}><input type="radio" name="annual-report-type" checked={reportType === 'customer'} onChange={() => setReportType('customer')} className="mr-2 accent-lime-700" />Klantadvies <span className="block pl-6 text-xs text-slate-600">Beknopt, standaard gekozen</span></label>
        <label className={`cursor-pointer rounded-lg border p-3 ${reportType === 'technical' ? 'border-lime-600 bg-lime-50' : 'border-slate-200'}`}><input type="radio" name="annual-report-type" checked={reportType === 'technical'} onChange={() => setReportType('technical')} className="mr-2 accent-lime-700" />Technisch rapport <span className="block pl-6 text-xs text-slate-600">Uitgebreide bestaande V3-rapportage</span></label>
      </div></fieldset>
      <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row"><button type="button" className="wx-btn-secondary" onClick={onCancel}>Annuleren</button><button type="button" className="wx-btn-primary" disabled={selectedCapacity == null || options.length === 0} onClick={onGenerate}>Genereer adviesrapport</button></div>
    </section>
  </div>;
}
