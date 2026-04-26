'use client';

import type { AnalysisType } from '@/lib/analysis';
import { hasLikelyPvHeader, type ColumnMapping } from '@/lib/parsing';

interface ColumnMapperProps {
  headers: string[];
  mapping: ColumnMapping;
  analysisType?: AnalysisType;
  onChange: (mapping: ColumnMapping) => void;
}

export function ColumnMapper({ headers, mapping, analysisType, onChange }: ColumnMapperProps) {
  const update = (key: keyof ColumnMapping, value: string) => {
    onChange({ ...mapping, [key]: value });
  };
  const hasDetectedPvColumn = hasLikelyPvHeader(headers);
  const fields: Array<[keyof ColumnMapping, string]> = [
    ['timestamp', 'timestamp (vul hier de datum/tijd (tot) in)'],
    ['consumptionKwh', 'consumption_kwh (vul hier het verbruik in kWh in)'],
    ['exportKwh', 'export_kwh (optioneel)']
  ];

  if (analysisType === 'PV_SELF_CONSUMPTION') {
    fields.push(['pvKwh', 'pv_kwh (optioneel)']);
  }

  return (
    <div className="wx-card">
      <h2 className="wx-title">Kolomkoppeling</h2>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {fields.map(([key, label]) => (
          <label key={key} className="text-sm">
            {label}
            <select
              className="wx-input"
              value={mapping[key as keyof ColumnMapping] ?? ''}
              onChange={(event) => update(key as keyof ColumnMapping, event.target.value)}
            >
              <option value="">Selecteer kolom</option>
              {headers.map((header) => (
                <option key={header} value={header}>
                  {header}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {analysisType === 'PV_SELF_CONSUMPTION' && (
        <p className="mt-3 text-xs text-slate-500">
          {hasDetectedPvColumn
            ? 'Je kunt ook een `pv_kwh`-kolom koppelen om extra PV-metrics zoals totale opwek en zelfconsumptie te tonen.'
            : 'Je kunt optioneel een `pv_kwh`-kolom koppelen voor extra PV-metrics; de analyse werkt ook met alleen verbruik en teruglevering.'}
        </p>
      )}
    </div>
  );
}
