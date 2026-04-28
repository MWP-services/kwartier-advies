import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { AnalysisType } from './analysis';
import type {
  DataQualityReport,
  PeakEvent,
  PeakMoment,
  ProcessedInterval,
  PvAdviceChartsData,
  SizingResult
} from './calculations';
import { formatTimestamp } from './datetime';
import type { PvSummary, ScenarioResult } from './simulation';
import type { PvStrategy } from './pvSimulation';

export interface PdfPayload {
  reportVariant?: 'advice' | 'financial';
  analysisType?: AnalysisType;
  contractedPowerKw: number;
  maxObservedKw: number;
  maxObservedTimestamp?: string | null;
  exceedanceCount: number;
  compliance: number;
  method: string;
  efficiency: number;
  safetyFactor: number;
  pvStrategy?: PvStrategy;
  sizing: SizingResult;
  quality: DataQualityReport;
  topEvents: PeakEvent[];
  peakMoments?: PeakMoment[];
  intervals?: ProcessedInterval[];
  highestPeakDay?: string | null;
  pvSummary?: PvSummary | null;
  pvAdviceCharts?: PvAdviceChartsData | null;
  scenarios: ScenarioResult[];
}

export async function generateReportPdf(payload: PdfPayload): Promise<Uint8Array> {
  if (payload.analysisType === 'PV_SELF_CONSUMPTION' && payload.reportVariant === 'financial') {
    return generatePvFinancialReportPdf(payload);
  }

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const page1 = pdfDoc.addPage([595, 842]);
  const { height } = page1.getSize();

  const gridAfterComplianceKwh = payload.sizing.kWhNeededRaw;
  const gridBeforeComplianceKwh =
    payload.compliance > 0 ? gridAfterComplianceKwh / payload.compliance : gridAfterComplianceKwh;
  const batteryBeforeSafetyKwh =
    payload.efficiency > 0 ? gridAfterComplianceKwh / payload.efficiency : payload.sizing.kWhNeeded;
  const efficiencyUpliftKwh = Math.max(0, batteryBeforeSafetyKwh - gridAfterComplianceKwh);
  const safetyBufferKwh = Math.max(0, payload.sizing.kWhNeeded - batteryBeforeSafetyKwh);

  const lines: string[] = [
    'Peak Shaving Report (MVP)',
    '',
    `Contracted power: ${payload.contractedPowerKw.toFixed(2)} kW`,
    `Max observed power: ${payload.maxObservedKw.toFixed(2)} kW`,
    `Max observed timestamp: ${
      payload.maxObservedTimestamp ? formatTimestamp(payload.maxObservedTimestamp) : '-'
    }`,
    `Exceedance intervals: ${payload.exceedanceCount}`,
    `Compliance target: ${(payload.compliance * 100).toFixed(0)}%`,
    `Recommended product: ${payload.sizing.recommendedProduct?.label ?? 'No feasible battery by kW + kWh'}`,
    `Sizing requirement: ${payload.sizing.kWhNeeded.toFixed(2)} kWh / ${payload.sizing.kWNeeded.toFixed(2)} kW`,
    '',
    'Sizing breakdown (kWh)',
    `Grid basis before compliance: ${gridBeforeComplianceKwh.toFixed(2)}`,
    `After compliance target: ${gridAfterComplianceKwh.toFixed(2)}`,
    `Efficiency uplift to battery-side: +${efficiencyUpliftKwh.toFixed(2)}`,
    `Safety buffer uplift: +${safetyBufferKwh.toFixed(2)}`,
    `Final battery-side kWh needed: ${payload.sizing.kWhNeeded.toFixed(2)}`,
    '',
    'Data quality',
    `Rows: ${payload.quality.rows}`,
    `Date range: ${payload.quality.startDate ?? '-'} to ${payload.quality.endDate ?? '-'}`,
    `Missing intervals: ${payload.quality.missingIntervalsCount}`,
    `Duplicates: ${payload.quality.duplicateCount}`,
    `Non-15-min transitions: ${payload.quality.non15MinIntervals}`,
    '',
    'Top 10 events (peak timestamp / duration / max excess / total excess)',
    ...payload.topEvents.slice(0, 10).map(
      (event) =>
        `${formatTimestamp(event.peakTimestamp)}, ${event.durationIntervals}x15m, ${event.maxExcessKw.toFixed(
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
      )} | ${scenario.exceedanceEnergyKwhAfter.toFixed(2)} | ${(
        scenario.achievedComplianceDataset * 100
      ).toFixed(1)}%`,
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

async function generatePvFinancialReportPdf(payload: PdfPayload): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const recommendedScenario = payload.scenarios.find(
    (scenario) => scenario.capacityKwh === payload.sizing.recommendedProduct?.capacityKwh
  ) ?? payload.scenarios[0];

  const page1 = pdfDoc.addPage([595, 842]);
  const { height } = page1.getSize();
  let y = height - 48;

  const drawLine = (text: string, size = 10, isBold = false, gap = 14) => {
    page1.drawText(text, {
      x: 40,
      y,
      font: isBold ? bold : font,
      size,
      color: rgb(0, 0, 0)
    });
    y -= gap;
  };

  drawLine('Onderbouwing terugverdientijd thuisbatterij', 18, true, 24);
  drawLine(`Aanbevolen batterij: ${payload.sizing.recommendedProduct?.label ?? 'Geen haalbare configuratie'}`, 12, true, 18);
  drawLine(`Capaciteit / vermogen: ${payload.sizing.kWhNeeded.toFixed(1)} kWh / ${payload.sizing.kWNeeded.toFixed(1)} kW`);
  drawLine(`Jaarlijkse netto besparing: ${recommendedScenario?.netAnnualSavingsEur != null ? `EUR ${recommendedScenario.netAnnualSavingsEur.toFixed(2)}` : 'Niet berekend'}`);
  drawLine(`Jaarlijkse bruto waarde: ${recommendedScenario?.annualValueEur != null ? `EUR ${recommendedScenario.annualValueEur.toFixed(2)}` : 'Niet berekend'}`);
  drawLine(`Terugverdientijd: ${recommendedScenario?.paybackYears != null ? `${recommendedScenario.paybackYears.toFixed(1)} jaar` : 'Niet positief / niet binnen levensduur'}`);
  drawLine('', 10, false, 8);
  drawLine('Onderbouwing', 13, true, 18);
  drawLine(
    'De terugverdientijd is berekend door de energiekosten zonder batterij te vergelijken met de energiekosten met batterij.',
    10,
    false,
    14
  );
  drawLine(
    'Per kwartier is gekeken naar verbruik, teruglevering, batterijcapaciteit, laad- en ontlaadvermogen en de geldende prijzen.',
    10,
    false,
    14
  );
  drawLine(
    'In deze PV-zelfverbruikmodus laadt de batterij alleen met overtollige zonnestroom en niet actief vanaf het net.',
    10,
    false,
    14
  );
  drawLine('', 10, false, 8);
  drawLine('Belangrijkste resultaten aanbevolen batterij', 13, true, 18);
  drawLine(`Import zonder batterij: ${recommendedScenario?.importedEnergyBeforeKwh?.toFixed(1) ?? '-'} kWh`);
  drawLine(`Import met batterij: ${recommendedScenario?.importedEnergyAfterKwh?.toFixed(1) ?? '-'} kWh`);
  drawLine(`Teruglevering zonder batterij: ${recommendedScenario?.exportedEnergyBeforeKwh?.toFixed(1) ?? '-'} kWh`);
  drawLine(`Teruglevering met batterij: ${recommendedScenario?.exportedEnergyAfterKwh?.toFixed(1) ?? '-'} kWh`);
  drawLine(`Opgeslagen PV-stroom: ${recommendedScenario?.capturedExportEnergyKwh?.toFixed(1) ?? '-'} kWh`);
  drawLine(`Benutte batterij-energie: ${recommendedScenario?.totalUsefulDischargedEnergyKwh?.toFixed(1) ?? '-'} kWh`);
  drawLine(`Cycli per jaar: ${recommendedScenario?.cyclesPerYear?.toFixed(1) ?? '-'}`);
  drawLine(`Marginale meeropbrengst: ${recommendedScenario?.marginalGainPerAddedKwh?.toFixed(1) ?? '-'} kWh per extra kWh`);
  if (recommendedScenario?.paybackIndicative) {
    drawLine('', 10, false, 8);
    drawLine('Let op: een deel van de prijsdata is met fallbacktarieven berekend. De terugverdientijd is indicatief.', 10, false, 14);
  }

  const page2 = pdfDoc.addPage([595, 842]);
  let y2 = 800;
  page2.drawText('Scenariovergelijking', {
    x: 40,
    y: y2,
    font: bold,
    size: 16,
    color: rgb(0, 0, 0)
  });
  y2 -= 24;
  page2.drawText('Batterij | kW | Netto besparing/jaar | TVT | Importreductie | Cycli/jaar', {
    x: 40,
    y: y2,
    font: bold,
    size: 9
  });
  y2 -= 16;

  payload.scenarios.slice(0, 12).forEach((scenario) => {
    const row = [
      `${scenario.capacityKwh} kWh`,
      `${(scenario.maxDischargeKw ?? 0).toFixed(1)}`,
      scenario.netAnnualSavingsEur != null ? `EUR ${scenario.netAnnualSavingsEur.toFixed(0)}` : '-',
      scenario.paybackYears != null ? `${scenario.paybackYears.toFixed(1)} j` : '-',
      `${(scenario.importReductionKwhAnnualized ?? scenario.importReductionKwh ?? 0).toFixed(0)} kWh`,
      `${(scenario.cyclesPerYear ?? 0).toFixed(0)}`
    ].join(' | ');

    page2.drawText(row, {
      x: 40,
      y: y2,
      font,
      size: 9,
      color: rgb(0, 0, 0)
    });
    y2 -= 14;
  });

  y2 -= 12;
  page2.drawText('Uitleg', {
    x: 40,
    y: y2,
    font: bold,
    size: 13
  });
  y2 -= 18;
  page2.drawText(
    'Grotere batterijen zijn niet automatisch beter. De aanbevolen optie is gekozen op basis van balans tussen extra zelfverbruik, netto besparing, cycli en afvlakking van de meeropbrengst.',
    {
      x: 40,
      y: y2,
      font,
      size: 10,
      maxWidth: 515,
      lineHeight: 13
    }
  );

  return pdfDoc.save();
}
