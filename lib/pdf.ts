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
  const hybridAdvice = payload.sizing.pvSelfConsumptionAdvice;
  const pricingStats = hybridAdvice?.configUsed.pricingStats;
  const pricingMode = hybridAdvice?.configUsed.pricingMode ?? 'average';
  const green = rgb(0.19, 0.37, 0.2);
  const lime = rgb(0.31, 0.55, 0.24);
  const softGreen = rgb(0.93, 0.97, 0.91);
  const pale = rgb(0.97, 0.98, 0.95);
  const border = rgb(0.87, 0.9, 0.85);
  const muted = rgb(0.45, 0.48, 0.45);
  const warning = rgb(0.95, 0.72, 0.24);
  const text = rgb(0.12, 0.12, 0.12);
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  const productLabel = payload.sizing.recommendedProduct?.label ?? 'Geen haalbare configuratie';
  const investmentEur =
    recommendedScenario?.paybackYears != null && recommendedScenario.netAnnualSavingsEur != null
      ? recommendedScenario.paybackYears * recommendedScenario.netAnnualSavingsEur
      : 0;
  const annualSavingsEur = recommendedScenario?.netAnnualSavingsEur ?? recommendedScenario?.annualValueEur ?? 0;
  const grossValueEur = recommendedScenario?.dynamicValueEur ?? recommendedScenario?.annualValueEur ?? 0;
  const yearlyCostsEur = recommendedScenario?.yearlyCostsEur ?? 0;

  const formatEuro = (value?: number | null, digits = 0) =>
    value == null || !Number.isFinite(value)
      ? '-'
      : `EUR ${value.toLocaleString('nl-NL', { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;
  const formatKwh = (value?: number | null) =>
    value == null || !Number.isFinite(value) ? '-' : `${Math.round(value).toLocaleString('nl-NL')} kWh`;
  const formatNumber = (value?: number | null, digits = 1) =>
    value == null || !Number.isFinite(value) ? '-' : value.toFixed(digits);

  function wrapText(value: string, maxChars: number): string[] {
    const words = value.split(/\s+/);
    const lines: string[] = [];
    let current = '';
    words.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > maxChars && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    });
    if (current) lines.push(current);
    return lines;
  }

  function drawWrappedText(
    page: ReturnType<typeof pdfDoc.addPage>,
    value: string,
    x: number,
    y: number,
    options: { size?: number; maxChars?: number; color?: ReturnType<typeof rgb>; lineHeight?: number; isBold?: boolean } = {}
  ): number {
    const size = options.size ?? 10;
    const lineHeight = options.lineHeight ?? size + 4;
    const lines = wrapText(value, options.maxChars ?? 85);
    lines.forEach((line, index) => {
      page.drawText(line, {
        x,
        y: y - index * lineHeight,
        font: options.isBold ? bold : font,
        size,
        color: options.color ?? text
      });
    });
    return y - lines.length * lineHeight;
  }

  function drawHeader(page: ReturnType<typeof pdfDoc.addPage>, title: string, subtitle: string): number {
    page.drawRectangle({ x: 0, y: pageHeight - 132, width: pageWidth, height: 132, color: green });
    page.drawText('WattsNext', { x: margin, y: pageHeight - 48, font: bold, size: 18, color: rgb(1, 1, 1) });
    page.drawText(title, { x: margin, y: pageHeight - 82, font: bold, size: 24, color: rgb(1, 1, 1) });
    drawWrappedText(page, subtitle, margin, pageHeight - 105, {
      size: 10,
      maxChars: 92,
      color: rgb(0.9, 0.96, 0.89),
      lineHeight: 13
    });
    return pageHeight - 160;
  }

  function drawSectionTitle(page: ReturnType<typeof pdfDoc.addPage>, title: string, y: number): number {
    page.drawText(title, { x: margin, y, font: bold, size: 15, color: green });
    page.drawLine({ start: { x: margin, y: y - 7 }, end: { x: pageWidth - margin, y: y - 7 }, thickness: 1, color: border });
    return y - 24;
  }

  function drawCard(
    page: ReturnType<typeof pdfDoc.addPage>,
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    value: string,
    note?: string,
    highlight = false
  ): void {
    page.drawRectangle({
      x,
      y: y - height,
      width,
      height,
      color: highlight ? softGreen : rgb(1, 1, 1),
      borderColor: highlight ? lime : border,
      borderWidth: 1
    });
    page.drawText(label.toUpperCase(), { x: x + 12, y: y - 22, font: bold, size: 7.5, color: muted });
    drawWrappedText(page, value, x + 12, y - 43, {
      size: value.length > 18 ? 13 : 16,
      maxChars: Math.max(14, Math.floor(width / 8)),
      isBold: true,
      color: highlight ? green : text,
      lineHeight: 16
    });
    if (note) {
      drawWrappedText(page, note, x + 12, y - height + 22, {
        size: 7.5,
        maxChars: Math.floor(width / 5.5),
        color: muted,
        lineHeight: 9
      });
    }
  }

  function drawTable(
    page: ReturnType<typeof pdfDoc.addPage>,
    x: number,
    y: number,
    widths: number[],
    headers: string[],
    rows: string[][],
    options: { rowHeight?: number; headerHeight?: number; size?: number } = {}
  ): number {
    const rowHeight = options.rowHeight ?? 22;
    const headerHeight = options.headerHeight ?? 24;
    const size = options.size ?? 8.5;
    const totalWidth = widths.reduce((sum, width) => sum + width, 0);
    page.drawRectangle({ x, y: y - headerHeight, width: totalWidth, height: headerHeight, color: softGreen, borderColor: border, borderWidth: 1 });
    let cursorX = x;
    headers.forEach((header, index) => {
      page.drawText(header, { x: cursorX + 6, y: y - 16, font: bold, size, color: green });
      cursorX += widths[index];
    });
    let cursorY = y - headerHeight;
    rows.forEach((row, rowIndex) => {
      page.drawRectangle({
        x,
        y: cursorY - rowHeight,
        width: totalWidth,
        height: rowHeight,
        color: rowIndex % 2 === 0 ? rgb(1, 1, 1) : pale,
        borderColor: border,
        borderWidth: 0.5
      });
      cursorX = x;
      row.forEach((cell, index) => {
        drawWrappedText(page, cell, cursorX + 6, cursorY - 14, {
          size,
          maxChars: Math.max(8, Math.floor(widths[index] / 5.2)),
          lineHeight: size + 2
        });
        cursorX += widths[index];
      });
      cursorY -= rowHeight;
    });
    return cursorY;
  }

  const page1 = pdfDoc.addPage([595, 842]);
  let y = drawHeader(
    page1,
    'Financieel batterijrapport',
    'Heldere onderbouwing van investering, jaarlijkse opbrengst, terugverdientijd en de aannames achter de berekening.'
  );

  page1.drawText('Aanbevolen configuratie', { x: margin, y, font: bold, size: 11, color: muted });
  y = drawWrappedText(page1, productLabel, margin, y - 18, { size: 17, isBold: true, maxChars: 58, color: green, lineHeight: 18 }) - 10;

  const cardGap = 12;
  const cardWidth = (contentWidth - cardGap * 2) / 3;
  drawCard(
    page1,
    margin,
    y,
    cardWidth,
    92,
    'Investering',
    investmentEur > 0 ? formatEuro(investmentEur, 0) : 'Niet ingevuld',
    'Gebaseerd op ingevoerde investering en eventuele batterijprijs.',
    true
  );
  drawCard(
    page1,
    margin + cardWidth + cardGap,
    y,
    cardWidth,
    92,
    'Jaarlijkse opbrengst',
    annualSavingsEur > 0 ? formatEuro(annualSavingsEur, 0) : 'Geen positieve waarde',
    'Netto waarde na jaarlijkse kosten.',
    true
  );
  drawCard(
    page1,
    margin + (cardWidth + cardGap) * 2,
    y,
    cardWidth,
    92,
    'Terugverdientijd',
    recommendedScenario?.paybackYears != null ? `${recommendedScenario.paybackYears.toFixed(1)} jaar` : 'Niet positief',
    'Investering gedeeld door jaarlijkse opbrengst.',
    true
  );
  y -= 118;

  y = drawSectionTitle(page1, 'Wat betekent dit voor de klant?', y);
  y = drawWrappedText(
    page1,
    `De batterij verlaagt de energiekosten door zonne-overschot op te slaan en later te gebruiken. De berekening vergelijkt per kwartier de kosten zonder batterij met de kosten met de aanbevolen batterij. Zo ontstaat een jaarlijkse netto opbrengst en daaruit volgt de terugverdientijd.`,
    margin,
    y,
    { size: 10.5, maxChars: 96, lineHeight: 14 }
  ) - 10;
  page1.drawRectangle({ x: margin, y: y - 62, width: contentWidth, height: 62, color: softGreen, borderColor: border, borderWidth: 1 });
  drawWrappedText(
    page1,
    recommendedScenario?.recommendationReason ??
      'Deze configuratie is gekozen omdat deze de beste balans geeft tussen extra eigen verbruik, benutting en afvlakking van meeropbrengst.',
    margin + 14,
    y - 18,
    { size: 10, maxChars: 92, lineHeight: 13, color: green, isBold: true }
  );
  y -= 86;

  y = drawSectionTitle(page1, 'Financiele opbouw', y);
  const financialRows = [
    ['Kosten zonder batterij', formatEuro(recommendedScenario?.baselineEnergyCostEur, 0), 'Kosten van import en teruglevering in de referentiesituatie.'],
    ['Kosten met batterij', formatEuro(recommendedScenario?.batteryEnergyCostEur, 0), 'Kosten nadat de batterij per kwartier is doorgerekend.'],
    ['Bruto jaarwaarde batterij', formatEuro(grossValueEur, 0), 'Verschil tussen zonder en met batterij, op jaarbasis.'],
    ['Jaarlijkse onderhoud/kosten', formatEuro(yearlyCostsEur, 0), 'Handmatig ingevoerde jaarlijkse kosten.'],
    ['Netto jaarlijkse opbrengst', formatEuro(annualSavingsEur, 0), 'Waarde die gebruikt is voor de terugverdientijd.']
  ];
  y = drawTable(page1, margin, y, [155, 105, 255], ['Onderdeel', 'Bedrag', 'Uitleg'], financialRows, { rowHeight: 34, size: 8.5 }) - 8;

  if (recommendedScenario?.paybackIndicative) {
    page1.drawRectangle({ x: margin, y: y - 48, width: contentWidth, height: 48, color: rgb(1, 0.97, 0.88), borderColor: warning, borderWidth: 1 });
    drawWrappedText(
      page1,
      'Let op: de terugverdientijd is indicatief omdat de dataset korter dan een jaar is, omdat prijsdata ontbreekt of omdat fallbacktarieven zijn gebruikt.',
      margin + 12,
      y - 17,
      { size: 9.5, maxChars: 94, color: rgb(0.38, 0.27, 0.08), lineHeight: 12, isBold: true }
    );
  }

  const page2 = pdfDoc.addPage([595, 842]);
  let y2 = drawHeader(
    page2,
    'Onderbouwing en scenariovergelijking',
    'Deze pagina laat zien welk energie-effect de batterij heeft, hoe betrouwbaar de prijsdata is en hoe alternatieve batterijgroottes scoren.'
  );

  y2 = drawSectionTitle(page2, 'Energie-impact aanbevolen batterij', y2);
  const energyRows = [
    ['Import zonder batterij', formatKwh(recommendedScenario?.importedEnergyBeforeKwh), 'Gemeten/veronderstelde netafname in de dataset.'],
    ['Import met batterij', formatKwh(recommendedScenario?.importedEnergyAfterKwh), 'Resterende netafname na simulatie.'],
    ['Importreductie per jaar', formatKwh(recommendedScenario?.importReductionKwhAnnualized), 'Minder netafname door batterijgebruik.'],
    ['Export zonder batterij', formatKwh(recommendedScenario?.exportedEnergyBeforeKwh), 'Zonne-overschot dat anders wordt teruggeleverd.'],
    ['Export met batterij', formatKwh(recommendedScenario?.exportedEnergyAfterKwh), 'Resterende teruglevering na batterij.'],
    ['Cycli per jaar', formatNumber(recommendedScenario?.cyclesPerYear), 'Hoe vaak de batterij ongeveer volledig wordt gebruikt.']
  ];
  y2 = drawTable(page2, margin, y2, [165, 115, 235], ['Metric', 'Waarde', 'Betekenis'], energyRows, { rowHeight: 31, size: 8.5 }) - 16;

  y2 = drawSectionTitle(page2, 'Prijsdata en betrouwbaarheid', y2);
  const priceRows = [
    ['Contracttype', pricingMode === 'dynamic' ? 'Dynamisch contract' : pricingMode === 'variable' ? 'Variabel contract' : 'Vast/gemiddeld tarief'],
    ['Importprijs fallback', hybridAdvice?.configUsed.importPriceEurPerKwh != null ? `EUR ${hybridAdvice.configUsed.importPriceEurPerKwh.toFixed(3)}/kWh` : '-'],
    ['Exportvergoeding fallback', hybridAdvice?.configUsed.exportCompensationEurPerKwh != null ? `EUR ${hybridAdvice.configUsed.exportCompensationEurPerKwh.toFixed(3)}/kWh` : '-'],
    ['Exacte prijsmatches', pricingStats ? String(pricingStats.exactMatches) : '-'],
    ['Uur-/periode-matches', pricingStats ? String(pricingStats.hourlyMatches + pricingStats.variablePeriodMatches) : '-'],
    ['Fallback/ontbrekend', pricingStats ? `${pricingStats.fallbackMatches} fallback, ${pricingStats.missingPrices} ontbrekend` : '-'],
    ['Prijsdekking', pricingStats ? `${(pricingStats.matchedShare * 100).toFixed(1)}%` : '-']
  ];
  y2 = drawTable(page2, margin, y2, [190, 325], ['Onderdeel', 'Waarde'], priceRows, { rowHeight: 23, size: 8.8 }) - 16;

  y2 = drawSectionTitle(page2, 'Scenariovergelijking', y2);
  const scenarioRows = payload.scenarios.slice(0, 10).map((scenario) => [
    scenario.capacityKwh === payload.sizing.recommendedProduct?.capacityKwh
      ? `${scenario.capacityKwh} kWh aanbevolen`
      : `${scenario.capacityKwh} kWh`,
    `${(scenario.maxDischargeKw ?? 0).toFixed(0)} kW`,
    scenario.netAnnualSavingsEur != null ? formatEuro(scenario.netAnnualSavingsEur, 0) : '-',
    scenario.paybackYears != null ? `${scenario.paybackYears.toFixed(1)} jaar` : '-',
    formatKwh(scenario.importReductionKwhAnnualized ?? scenario.importReductionKwh),
    `${(scenario.cyclesPerYear ?? 0).toFixed(0)}`
  ]);
  y2 = drawTable(
    page2,
    margin,
    y2,
    [92, 55, 96, 76, 110, 60],
    ['Batterij', 'kW', 'Netto/jaar', 'TVT', 'Importreductie', 'Cycli'],
    scenarioRows,
    { rowHeight: 25, size: 7.8 }
  ) - 14;

  page2.drawRectangle({ x: margin, y: y2 - 62, width: contentWidth, height: 62, color: softGreen, borderColor: border, borderWidth: 1 });
  drawWrappedText(
    page2,
    'Grotere batterijen zijn niet automatisch beter. De aanbevolen optie is gekozen op basis van balans tussen extra eigen verbruik, netto opbrengst, cycli en afvlakking van de meeropbrengst per extra kWh capaciteit.',
    margin + 12,
    y2 - 18,
    { size: 9.5, maxChars: 94, lineHeight: 12, color: green, isBold: true }
  );

  [page1, page2].forEach((page, index) => {
    page.drawText(`WattsNext financieel batterijrapport | pagina ${index + 1}/2`, {
      x: margin,
      y: 24,
      font,
      size: 8,
      color: muted
    });
    page.drawText('Indicatief advies; definitieve businesscase afhankelijk van contract, installatie en technische validatie.', {
      x: 252,
      y: 24,
      font,
      size: 7.5,
      color: muted
    });
  });

  return pdfDoc.save();
}
