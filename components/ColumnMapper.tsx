'use client';

import type { ColumnMapping } from '@/lib/parsing';

interface ColumnMapperProps {
  headers: string[];
  mapping: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
}

export function ColumnMapper({ headers, mapping, onChange }: ColumnMapperProps) {
  const update = (key: keyof ColumnMapping, value: string) => {
    onChange({ ...mapping, [key]: value });
  };

  return (
    <div className="wx-card">
      <h2 className="wx-title">Kolomkoppeling</h2>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {[
          ['timestamp', 'timestamp (vul hier de datum/tijd (tot) in)'],
          ['consumptionKwh', 'consumption_kwh (vul hier het verbruik in kWh in)'],
          ['exportKwh', 'export_kwh (optioneel)'],
          ['pvKwh', 'pv_kwh (optioneel)']
        ].map(([key, label]) => (
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
    </div>
  );
}
