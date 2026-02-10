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
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <h2 className="mb-2 font-semibold">Column Mapping</h2>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {[
          ['timestamp', 'timestamp'],
          ['consumptionKwh', 'consumption_kwh'],
          ['exportKwh', 'export_kwh (optional)'],
          ['pvKwh', 'pv_kwh (optional)']
        ].map(([key, label]) => (
          <label key={key} className="text-sm">
            {label}
            <select
              className="mt-1 w-full rounded border p-2"
              value={mapping[key as keyof ColumnMapping] ?? ''}
              onChange={(event) => update(key as keyof ColumnMapping, event.target.value)}
            >
              <option value="">Select column</option>
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
