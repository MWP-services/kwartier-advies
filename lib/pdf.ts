import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { DataQualityReport, PeakEvent, SizingResult } from './calculations';
import type { ScenarioResult } from './simulation';

export interface PdfPayload {
  contractedPowerKw: number;
  maxObservedKw: number;
  exceedanceCount: number;
  compliance: number;
  method: string;
  efficiency: number;
  safetyFactor: number;
  sizing: SizingResult;
  quality: DataQualityReport;
  topEvents: PeakEvent[];
  scenarios: ScenarioResult[];
}

export async function generateReportPdf(payload: PdfPayload): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const page1 = pdfDoc.addPage([595, 842]);
  const { height } = page1.getSize();

  const lines: string[] = [
    'Peak Shaving Report (MVP)',
    '',
    `Contracted power: ${payload.contractedPowerKw.toFixed(2)} kW`,
    `Max observed power: ${payload.maxObservedKw.toFixed(2)} kW`,
    `Exceedance intervals: ${payload.exceedanceCount}`,
    `Compliance target: ${(payload.compliance * 100).toFixed(0)}%`,
    `Recommended product: ${payload.sizing.recommendedProduct.label}`,
    `Sizing requirement: ${payload.sizing.kWhNeeded.toFixed(2)} kWh / ${payload.sizing.kWNeeded.toFixed(2)} kW`,
    '',
    'Data quality',
    `Rows: ${payload.quality.rows}`,
    `Date range: ${payload.quality.startDate ?? '-'} to ${payload.quality.endDate ?? '-'}`,
    `Missing intervals: ${payload.quality.missingIntervalsCount}`,
    `Duplicates: ${payload.quality.duplicateCount}`,
    `Non-15-min transitions: ${payload.quality.non15MinIntervals}`,
    '',
    'Top 10 events (start / end / duration / max excess / total excess)',
    ...payload.topEvents.slice(0, 10).map(
      (event) =>
        `${event.start} -> ${event.end}, ${event.durationIntervals}x15m, ${event.maxExcessKw.toFixed(
          2
        )} kW, ${event.totalExcessKwh.toFixed(2)} kWh`
    )
  ];

  let y = height - 50;
  for (const line of lines) {
    page1.drawText(line, {
      x: 40,
      y,
      font,
      size: line === 'Peak Shaving Report (MVP)' ? 18 : 10,
      color: line === 'Peak Shaving Report (MVP)' ? rgb(0, 0.2, 0.5) : rgb(0, 0, 0)
    });
    y -= line === '' ? 8 : 14;
    if (y < 60) break;
  }

  const page2 = pdfDoc.addPage([595, 842]);
  page2.drawText('Simulation comparison', {
    x: 40,
    y: 800,
    font,
    size: 16,
    color: rgb(0, 0.2, 0.5)
  });

  let y2 = 770;
  page2.drawText('Option | Before kWh | After kWh | Achieved compliance', {
    x: 40,
    y: y2,
    font,
    size: 10
  });
  y2 -= 20;

  payload.scenarios.forEach((scenario) => {
    page2.drawText(
      `${scenario.capacityKwh} kWh | ${scenario.exceedanceEnergyKwhBefore.toFixed(
        2
      )} | ${scenario.exceedanceEnergyKwhAfter.toFixed(2)} | ${(scenario.achievedCompliance * 100).toFixed(1)}%`,
      { x: 40, y: y2, font, size: 10 }
    );
    y2 -= 14;
  });

  page2.drawText('Assumptions & recommendation', {
    x: 40,
    y: y2 - 20,
    font,
    size: 14,
    color: rgb(0, 0.2, 0.5)
  });
  page2.drawText(
    `Method: ${payload.method}, efficiency: ${payload.efficiency}, safety factor: ${payload.safetyFactor}.`,
    { x: 40, y: y2 - 42, font, size: 10 }
  );
  page2.drawText(
    'Sizing for peak shaving; final engineering validation required.',
    { x: 40, y: y2 - 58, font, size: 10 }
  );

  return pdfDoc.save();
}
