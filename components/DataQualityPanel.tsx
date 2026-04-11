'use client';

import type { DataQualityReport } from '@/lib/calculations';
import type { NormalizationDiagnostics } from '@/lib/normalization';
import { formatTimestamp } from '@/lib/datetime';

interface DataQualityPanelProps {
  diagnostics: NormalizationDiagnostics;
  quality: DataQualityReport;
}

export function DataQualityPanel({ diagnostics, quality }: DataQualityPanelProps) {
  const interpretationLabel =
    diagnostics.interpretationRequested === 'AUTO'
      ? `AUTO -> ${diagnostics.interpretationUsed}`
      : diagnostics.interpretationUsed;

  return (
    <div className="wx-card">
      <h3 className="wx-title">Datakwaliteit</h3>
      <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
        <p>Interpretatie: {interpretationLabel}</p>
        <p>
          Rijen totaal/gebruikt: {diagnostics.rowsTotal} / {diagnostics.rowsUsed}
        </p>
        <p>Ontbrekende intervallen: {quality.missingIntervalsCount}</p>
        <p>
          Outliers uitgesloten: {diagnostics.countOutliers}
          {diagnostics.firstOutlierTimestamp
            ? ` (eerste: ${formatTimestamp(diagnostics.firstOutlierTimestamp)})`
            : ''}
        </p>
        <p>Negatieve deltas: {diagnostics.negativeDeltaCount}</p>
      </div>
    </div>
  );
}
