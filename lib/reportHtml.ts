import type { PdfPayload } from './pdf';
import { buildDayProfile } from './calculations';
import { formatTimestamp, getLocalDayIso, getLocalHourMinute } from './datetime';
import fs from 'node:fs';
import path from 'node:path';

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function mimeForExt(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'application/octet-stream';
}

function getEmbeddedAsset(candidates: string[]): { dataUri: string; filePath: string } | null {
  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const bytes = fs.readFileSync(filePath);
      return {
        dataUri: `data:${mimeForExt(filePath)};base64,${bytes.toString('base64')}`,
        filePath
      };
    } catch {
      continue;
    }
  }
  return null;
}

function getEmbeddedLogoSrc(): string | null {
  const asset = getEmbeddedAsset([
    path.join(process.cwd(), '.next', 'assets', 'wattsnext-logo.png'),
    path.join(process.cwd(), '.next', 'assets', 'wattsnext-logo.jpg'),
    path.join(process.cwd(), '.next', 'assets', 'logo.png'),
    path.join(process.cwd(), '.next', 'assets', 'logo.jpg'),
    path.join(process.cwd(), 'assets', 'wattsnext-logo.png'),
    path.join(process.cwd(), 'assets', 'wattsnext-logo.jpg'),
    path.join(process.cwd(), 'assets', 'logo.png'),
    path.join(process.cwd(), 'assets', 'logo.jpg'),
    path.join(process.cwd(), 'public', 'assets', 'wattsnext-logo.png'),
    path.join(process.cwd(), 'public', 'assets', 'wattsnext-logo.jpg'),
    path.join(process.cwd(), 'public', 'assets', 'logo.png'),
    path.join(process.cwd(), 'public', 'assets', 'logo.jpg')
  ]);
  return asset?.dataUri ?? null;
}

function getRecommendedBrochureInfo(payload: PdfPayload): { key: string; dataUri: string } | null {
  const product = payload.sizing.recommendedProduct;
  if (!product) return null;

  const baseKey =
    product.unitCapacityKwh && [64, 96, 261].includes(Math.round(product.unitCapacityKwh))
      ? String(Math.round(product.unitCapacityKwh))
      : [2090, 5015].includes(Math.round(product.capacityKwh))
        ? String(Math.round(product.capacityKwh))
        : null;

  if (!baseKey) return null;
  const asset = getEmbeddedAsset([
    path.join(process.cwd(), '.next', 'assets', `${baseKey}.pdf`),
    path.join(process.cwd(), '.next', 'assets', `${baseKey}.jpg`),
    path.join(process.cwd(), '.next', 'assets', `${baseKey}.png`),
    path.join(process.cwd(), 'assets', `${baseKey}.pdf`),
    path.join(process.cwd(), 'assets', `${baseKey}.jpg`),
    path.join(process.cwd(), 'assets', `${baseKey}.png`),
    path.join(process.cwd(), 'public', 'assets', `${baseKey}.pdf`),
    path.join(process.cwd(), 'public', 'assets', `${baseKey}.jpg`),
    path.join(process.cwd(), 'public', 'assets', `${baseKey}.png`)
  ]);
  return asset ? { key: baseKey, dataUri: asset.dataUri } : null;
}

export function generateInteractiveReportHtml(payload: PdfPayload): string {
  const embeddedLogoSrc = getEmbeddedLogoSrc();
  const brochure = getRecommendedBrochureInfo(payload);
  const gridAfterComplianceKwh = payload.sizing.kWhNeededRaw;
  const gridBeforeComplianceKwh =
    payload.compliance > 0 ? gridAfterComplianceKwh / payload.compliance : gridAfterComplianceKwh;
  const batteryBeforeSafetyKwh =
    payload.efficiency > 0 ? gridAfterComplianceKwh / payload.efficiency : payload.sizing.kWhNeeded;
  const sizingBreakdown = [
    { step: 'Grid basis', value: Math.max(0, gridBeforeComplianceKwh) },
    { step: 'After compliance', value: Math.max(0, gridAfterComplianceKwh) },
    { step: 'After efficiency', value: Math.max(0, batteryBeforeSafetyKwh) },
    { step: 'Final (buffer)', value: Math.max(0, payload.sizing.kWhNeeded) }
  ];

  const scenarioChartData = payload.scenarios.map((scenario) => ({
    optionLabel: scenario.optionLabel,
    before: scenario.exceedanceEnergyKwhBefore,
    after: scenario.exceedanceEnergyKwhAfter,
    compliance: scenario.achievedComplianceDataset * 100,
    remainingKw: scenario.maxRemainingExcessKw
  }));

  const peakEventsTable = payload.topEvents.map((event) => ({
    peakTimestamp: formatTimestamp(event.peakTimestamp),
    durationIntervals: event.durationIntervals,
    maxExcessKw: event.maxExcessKw.toFixed(2),
    totalExcessKwh: event.totalExcessKwh.toFixed(2)
  }));

  const kpiCards = [
    ['Contracted power', `${payload.contractedPowerKw.toFixed(2)} kW`],
    ['Max observed', `${payload.maxObservedKw.toFixed(2)} kW`],
    ['Exceedance intervals', String(payload.exceedanceCount)],
    ['Sizing requirement', `${payload.sizing.kWhNeeded.toFixed(2)} kWh / ${payload.sizing.kWNeeded.toFixed(2)} kW`],
    ['Recommended', payload.sizing.recommendedProduct?.label ?? 'No feasible battery by kW + kWh']
  ];

  const intervals = payload.intervals ?? [];
  const peakMoments = payload.peakMoments ?? [];
  const selectedDay =
    payload.highestPeakDay ?? (intervals.length > 0 ? getLocalDayIso(intervals[0].timestamp, 'Europe/Amsterdam') : null);

  const markerSet = new Set(
    peakMoments
      .filter((moment) => selectedDay && getLocalDayIso(moment.timestamp, 'Europe/Amsterdam') === selectedDay)
      .map((moment) => {
        const { hour, minute } = getLocalHourMinute(moment.timestamp, 'Europe/Amsterdam');
        return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      })
  );

  const dayProfile = selectedDay
    ? buildDayProfile(intervals, selectedDay, 15, 'Europe/Amsterdam').map((point) => ({
        timeLabel: point.timestampLabel,
        consumptionKw: point.observedKw,
        contractKw: payload.contractedPowerKw,
        isPeakMoment: markerSet.has(point.timestampLabel)
      }))
    : [];

  const bins = 20;
  const maxKw = Math.max(1, ...intervals.map((item) => item.consumptionKw ?? 0));
  const binSize = maxKw / bins;
  const histogram = Array.from({ length: bins }, (_, i) => {
    const min = i * binSize;
    const max = min + binSize;
    const count = intervals.filter(
      (item) =>
        item.consumptionKw >= min &&
        (i === bins - 1 ? item.consumptionKw <= max : item.consumptionKw < max)
    ).length;
    const ratio = max / Math.max(1, payload.contractedPowerKw);
    return {
      label: `${min.toFixed(0)}-${max.toFixed(0)}`,
      count,
      color: ratio > 1 ? '#dc2626' : ratio > 0.9 ? '#d28a00' : '#43a047'
    };
  });

  const peakMomentsTable = peakMoments.map((moment) => ({
    timestamp: formatTimestamp(moment.timestamp),
    consumptionKw: moment.consumptionKw.toFixed(2),
    excessKw: moment.excessKw.toFixed(2),
    excessKwh: moment.excessKwh.toFixed(2)
  }));

  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>WattsNext Peak Shaving Report</title>
  <script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
  <style>
    :root {
      --bg: #FFFFFF;
      --text: #232323;
      --muted: #8D8D8D;
      --green: #4E8D3E;
      --green-dark: #3B812B;
      --green-lime: #9AB826;
      --dot-warm: #E28E11;
      --dot-yellow: #F1D23A;
      --border: #E6E6E6;
      --header-row: #EEF7EA;
      --callout: #F7F9F7;
      --zebra: #FAFAFA;
    }
    * { box-sizing: border-box; }
    html, body { background: var(--bg); }
    body {
      margin: 0;
      font-family: Inter, Arial, Calibri, sans-serif;
      color: var(--text);
      background: var(--bg);
      line-height: 1.45;
    }
    @page {
      size: A4;
      margin: 2.0cm 2.0cm 2.0cm 2.5cm;
    }
    .page {
      position: relative;
      max-width: 1200px;
      margin: 0 auto;
      padding: 24px;
      background: var(--bg);
    }
    .page::before {
      content: "";
      position: absolute;
      top: 16px;
      right: 24px;
      width: 190px;
      height: 120px;
      pointer-events: none;
      opacity: 0.23;
      background:
        radial-gradient(circle at 20px 35px, var(--dot-warm) 0 2px, transparent 3px),
        radial-gradient(circle at 32px 28px, var(--dot-yellow) 0 2px, transparent 3px),
        radial-gradient(circle at 45px 21px, var(--dot-yellow) 0 2px, transparent 3px),
        radial-gradient(circle at 59px 18px, var(--green-lime) 0 2px, transparent 3px),
        radial-gradient(circle at 74px 20px, var(--green) 0 2px, transparent 3px),
        radial-gradient(circle at 86px 28px, var(--green) 0 2px, transparent 3px),
        radial-gradient(circle at 98px 38px, var(--green-dark) 0 2px, transparent 3px),
        radial-gradient(circle at 26px 52px, var(--dot-warm) 0 2px, transparent 3px),
        radial-gradient(circle at 39px 59px, var(--dot-yellow) 0 2px, transparent 3px),
        radial-gradient(circle at 54px 63px, var(--green-lime) 0 2px, transparent 3px),
        radial-gradient(circle at 70px 63px, var(--green) 0 2px, transparent 3px),
        radial-gradient(circle at 84px 59px, var(--green-dark) 0 2px, transparent 3px);
      filter: blur(0.1px);
    }
    .header {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px 18px 12px;
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 14px;
      align-items: center;
      box-shadow: 0 6px 18px rgba(0,0,0,0.05);
      position: relative;
    }
    .header::after {
      content: "";
      position: absolute;
      left: 0; right: 0; bottom: 0;
      height: 2px;
      background: var(--green);
      border-bottom-left-radius: 14px;
      border-bottom-right-radius: 14px;
    }
    .logoWrap {
      width: 150px;
      min-height: 52px;
      display: flex;
      align-items: center;
      justify-content: flex-start;
    }
    .logoWrap img {
      max-width: 150px;
      max-height: 52px;
      width: auto;
      height: auto;
      object-fit: contain;
      display: block;
    }
    .logoFallback {
      display: none;
      align-items: baseline;
      gap: 2px;
      font-weight: 700;
      font-size: 20px;
      color: var(--text);
    }
    .logoFallback .plus { color: var(--green); }
    .brand h1 {
      margin: 0;
      font-size: 28px;
      line-height: 1.05;
      letter-spacing: -0.02em;
      color: var(--text);
      position: relative;
      padding-left: 18px;
    }
    .brand h1::before {
      content: "";
      position: absolute;
      left: 0;
      top: 2px;
      width: 8px;
      height: 26px;
      border-radius: 999px;
      background: var(--green);
    }
    .brand p {
      margin: 6px 0 0 18px;
      color: var(--muted);
      font-size: 10px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }
    .stamp {
      color: var(--muted);
      font-size: 9.5px;
      text-align: right;
      line-height: 1.35;
    }
    .grid { display: grid; gap: 16px; margin-top: 16px; }
    .grid.kpis { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
    .grid.two { grid-template-columns: 1.2fr 1fr; }
    .card {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px 14px 12px;
      box-shadow: 0 6px 16px rgba(0,0,0,0.05);
    }
    .card h3, .card h2 {
      margin: 0 0 10px;
      font-size: 15px;
      line-height: 1.2;
      font-weight: 600;
      color: var(--text);
      position: relative;
      padding-left: 14px;
    }
    .card h3::before, .card h2::before {
      content: "";
      position: absolute;
      left: 0;
      top: 1px;
      width: 6px;
      height: 16px;
      border-radius: 999px;
      background: var(--green);
    }
    .kpi-label { color: var(--muted); font-size: 9.5px; }
    .kpi-value { margin-top: 4px; font-weight: 700; font-size: 12px; color: var(--text); }
    .plot { width: 100%; height: 320px; }
    .plot.short { height: 260px; }
    .brochureFrame {
      width: 100%;
      height: 420px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: #fff;
    }
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 11px;
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
    }
    th, td {
      border-bottom: 1px solid var(--border);
      padding: 9px 10px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: var(--header-row);
      color: var(--text);
      font-weight: 600;
      border-bottom: 1px solid var(--green);
    }
    tbody tr:nth-child(even) td { background: var(--zebra); }
    tbody tr:last-child td { border-bottom: none; }
    .muted { color: var(--muted); font-size: 9.5px; line-height: 1.35; }
    .callout {
      background: var(--callout);
      border-left: 5px solid var(--green);
      border-radius: 8px;
      padding: 10px 12px;
      margin-top: 10px;
    }
    .callout-title {
      margin: 0 0 4px;
      font-weight: 600;
      font-size: 11px;
      color: var(--text);
    }
    .callout-body {
      margin: 0;
      color: var(--text);
      font-size: 10.5px;
      line-height: 1.4;
    }
    .pill {
      display: inline-block; padding: 5px 9px; border-radius: 999px;
      background: rgba(78,141,62,.16); color: var(--green-dark); font-weight: 700; font-size: 9.5px;
    }
    .meta-tagline { text-transform: uppercase; letter-spacing: .14em; color: var(--muted); font-size: 9px; }
    .footer {
      margin-top: 18px;
      padding-top: 8px;
      border-top: 1px solid #EDEDED;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      color: var(--muted);
      font-size: 9px;
    }
    @media (max-width: 900px) {
      .grid.two { grid-template-columns: 1fr; }
      .header { grid-template-columns: auto 1fr; }
      .stamp { grid-column: 1 / -1; text-align: left; }
      .logoWrap { width: 120px; }
    }
    @media print {
      body { background: #fff; }
      .page { max-width: none; }
      .card, .header { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- Logo wordt automatisch ingeladen uit .next/assets/wattsnext-logo.png of public/assets/wattsnext-logo.png -->
    <section class="header">
      <div class="logoWrap">
        ${
          embeddedLogoSrc
            ? `<img src="${embeddedLogoSrc}" alt="WattsNext logo" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
               <div class="logoFallback" aria-hidden="true"><span>WattsNext</span><span class="plus">+</span></div>`
            : `<div class="logoFallback" style="display:flex;" aria-hidden="true"><span>WattsNext</span><span class="plus">+</span></div>`
        }
      </div>
      <div class="brand">
        <h1>Peak Shaving Report</h1>
        <p>ENERGY SOLUTIONS</p>
      </div>
      <div class="stamp">
        <div class="pill">Peak Shaving Report</div>
        <div style="margin-top:8px;">Method: ${payload.method}</div>
        <div>Compliance: ${(payload.compliance * 100).toFixed(0)}%</div>
      </div>
    </section>

    <section class="grid kpis">
      ${kpiCards
        .map(
          ([label, value]) => `
        <div class="card">
          <div class="kpi-label">${label}</div>
          <div class="kpi-value">${value}</div>
        </div>`
        )
        .join('')}
    </section>

    <section class="grid two">
      <div class="card">
        <h3>Aanbevolen batterijadvies</h3>
        <table>
          <tbody>
            <tr><th>Aanbevolen configuratie</th><td>${payload.sizing.recommendedProduct?.label ?? 'Geen haalbare configuratie'}</td></tr>
            <tr><th>Benodigde capaciteit</th><td>${payload.sizing.kWhNeeded.toFixed(2)} kWh</td></tr>
            <tr><th>Benodigd vermogen</th><td>${payload.sizing.kWNeeded.toFixed(2)} kW</td></tr>
            <tr><th>Geadviseerde productcapaciteit</th><td>${payload.sizing.recommendedProduct ? `${payload.sizing.recommendedProduct.capacityKwh} kWh` : '-'}</td></tr>
            <tr><th>Geadviseerd productvermogen</th><td>${payload.sizing.recommendedProduct ? `${payload.sizing.recommendedProduct.powerKw} kW` : '-'}</td></tr>
          </tbody>
        </table>
        <div class="callout">
          <p class="callout-title">Productsheet toegevoegd</p>
          <p class="callout-body">Voor de aanbevolen batterij (of modulaire basisvariant) is de productsheet uit de assets-map opgenomen in dit rapport.</p>
        </div>
      </div>
      <div class="card">
        <h3>Productsheet aanbevolen batterij</h3>
        ${
          brochure
            ? brochure.dataUri.startsWith('data:application/pdf')
              ? `<object class="brochureFrame" data="${brochure.dataUri}#page=1&zoom=page-width" type="application/pdf">
                   <p class="muted">Uw browser ondersteunt geen inline PDF-weergave. Open het HTML-rapport in een moderne browser.</p>
                 </object>`
              : `<img class="brochureFrame" src="${brochure.dataUri}" alt="Productsheet batterij ${brochure.key}" style="object-fit:contain;" />`
            : `<div class="callout"><p class="callout-title">Productsheet niet gevonden</p><p class="callout-body">Verwacht in assets: 64.pdf / 96.pdf / 261.pdf / 2090.pdf / 5015.pdf (of .jpg) op basis van de aanbevolen batterij.</p></div>`
        }
        ${brochure ? `<div class="muted" style="margin-top:8px;">Gekoppelde brochure: ${brochure.key}</div>` : ''}
      </div>
    </section>

    <section class="grid two">
      <div class="card">
        <h3>Exceedance Energy Before/After (Dataset Simulation)</h3>
        <div id="exceedance-chart" class="plot"></div>
        <div class="callout">
          <p class="callout-title">Uitleg</p>
          <p class="callout-body">Deze grafiek toont het effect per batterijoptie op de gemeten overschrijdingsenergie in de dataset (voor en na simulatie).</p>
        </div>
      </div>
      <div class="card">
        <h3>Sizing Breakdown (kWh)</h3>
        <div id="sizing-chart" class="plot short"></div>
        <div class="callout">
          <p class="callout-title">Uitleg</p>
          <p class="callout-body">Hier ziet u hoe de benodigde batterijcapaciteit wordt opgebouwd uit netzijde-energie, efficiencyverlies en veiligheidsbuffer.</p>
        </div>
      </div>
    </section>

    <section class="grid two">
      <div class="card">
        <h3>Highest Peak Day Profile</h3>
        <div id="highest-peak-chart" class="plot"></div>
        <div class="muted">Blauw = gemeten verbruik, groen = gecontracteerd vermogen, markers = overschrijdende kwartieren.</div>
      </div>
      <div class="card">
        <h3>Consumption Histogram</h3>
        <div id="histogram-chart" class="plot"></div>
        <div class="muted">Verdeling van kwartierverbruik. Groen = ruim onder contract, oranje = dichtbij contract, rood = boven contract.</div>
      </div>
    </section>

    <section class="grid two">
      <div class="card">
        <h3>All Peak Moments</h3>
        <table>
          <thead>
            <tr>
              <th>Peak timestamp</th>
              <th>Consumption kW</th>
              <th>Excess kW</th>
              <th>Excess kWh</th>
            </tr>
          </thead>
          <tbody id="peak-moments-body"></tbody>
        </table>
      </div>
      <div class="card">
        <h3>Data Quality & Assumptions</h3>
        <table>
          <tbody>
            <tr><th>Rows</th><td>${payload.quality.rows}</td></tr>
            <tr><th>Date range</th><td>${payload.quality.startDate ?? '-'} to ${payload.quality.endDate ?? '-'}</td></tr>
            <tr><th>Missing intervals</th><td>${payload.quality.missingIntervalsCount}</td></tr>
            <tr><th>Duplicates</th><td>${payload.quality.duplicateCount}</td></tr>
            <tr><th>Non-15-min transitions</th><td>${payload.quality.non15MinIntervals}</td></tr>
            <tr><th>Max observed timestamp</th><td>${payload.maxObservedTimestamp ? formatTimestamp(payload.maxObservedTimestamp) : '-'}</td></tr>
            <tr><th>Efficiency</th><td>${(payload.efficiency * 100).toFixed(0)}%</td></tr>
            <tr><th>Safety factor</th><td>${payload.safetyFactor.toFixed(2)}x</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card" style="margin-top:16px;">
      <h3>Peak Events (clustered)</h3>
      <table>
        <thead>
          <tr>
            <th>Peak timestamp</th>
            <th>Duration (x15m)</th>
            <th>Max excess kW</th>
            <th>Total excess kWh</th>
          </tr>
        </thead>
        <tbody id="peak-events-body"></tbody>
      </table>
    </section>

    <footer class="footer">
      <div>WattsNext Energy Solutions</div>
      <div>Pagina 1</div>
    </footer>
  </div>

  <script>
    const scenarioData = ${safeJson(scenarioChartData)};
    const sizingData = ${safeJson(sizingBreakdown)};
    const peakEvents = ${safeJson(peakEventsTable)};
    const peakMoments = ${safeJson(peakMomentsTable)};
    const dayProfile = ${safeJson(dayProfile)};
    const histogram = ${safeJson(histogram)};

    const wattsTheme = {
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: '#FFFFFF',
      font: {family: 'Inter, Arial, Calibri, sans-serif', color: '#232323'},
      margin: {t: 12, r: 12, b: 70, l: 55}
    };

    Plotly.newPlot('exceedance-chart', [
      {
        type: 'bar',
        name: 'Before',
        x: scenarioData.map(d => d.optionLabel),
        y: scenarioData.map(d => d.before),
        marker: {color: '#F59E0B'}
      },
      {
        type: 'bar',
        name: 'After',
        x: scenarioData.map(d => d.optionLabel),
        y: scenarioData.map(d => d.after),
        marker: {color: '#22C55E'}
      }
    ], {
      ...wattsTheme,
      barmode: 'group',
      xaxis: {tickangle: -25},
      yaxis: {title: 'kWh'}
    }, {responsive: true, displaylogo: false});

    Plotly.newPlot('sizing-chart', [{
      type: 'bar',
      x: sizingData.map(d => d.step),
      y: sizingData.map(d => d.value),
      marker: {color: ['#94A3B8', '#A3E635', '#FBBF24', '#22C55E']},
      text: sizingData.map(d => d.value.toFixed(2) + ' kWh'),
      textposition: 'outside',
      cliponaxis: false
    }], {
      ...wattsTheme,
      margin: {t: 12, r: 12, b: 50, l: 55},
      yaxis: {title: 'kWh'}
    }, {responsive: true, displaylogo: false});

    Plotly.newPlot('highest-peak-chart', [
      {
        type: 'bar',
        name: 'Consumption kW',
        x: dayProfile.map(d => d.timeLabel),
        y: dayProfile.map(d => d.consumptionKw),
        marker: {color: '#60A5FA'}
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: 'Contract kW',
        x: dayProfile.map(d => d.timeLabel),
        y: dayProfile.map(d => d.contractKw),
        line: {color: '#22C55E', width: 3}
      },
      {
        type: 'scatter',
        mode: 'markers',
        name: 'Peak moments',
        x: dayProfile.filter(d => d.isPeakMoment).map(d => d.timeLabel),
        y: dayProfile.filter(d => d.isPeakMoment).map(d => d.consumptionKw),
        marker: {color: '#F97316', size: 8}
      }
    ], {
      ...wattsTheme,
      xaxis: {tickangle: -25},
      yaxis: {title: 'kW'}
    }, {responsive: true, displaylogo: false});

    Plotly.newPlot('histogram-chart', [{
      type: 'bar',
      x: histogram.map(d => d.label),
      y: histogram.map(d => d.count),
      marker: {color: histogram.map(d => d.color)}
    }], {
      ...wattsTheme,
      xaxis: {tickangle: -35},
      yaxis: {title: 'Aantal kwartieren'}
    }, {responsive: true, displaylogo: false});

    const tbody = document.getElementById('peak-moments-body');
    peakMoments.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + row.timestamp + '</td>' +
        '<td>' + row.consumptionKw + '</td>' +
        '<td>' + row.excessKw + '</td>' +
        '<td>' + row.excessKwh + '</td>';
      tbody.appendChild(tr);
    });

    const peakEventsBody = document.getElementById('peak-events-body');
    peakEvents.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + row.peakTimestamp + '</td>' +
        '<td>' + row.durationIntervals + '</td>' +
        '<td>' + row.maxExcessKw + '</td>' +
        '<td>' + row.totalExcessKwh + '</td>';
      peakEventsBody.appendChild(tr);
    });
  </script>
</body>
</html>`;
}
