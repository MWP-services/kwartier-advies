import type { PdfPayload } from './pdf';
import { buildDayProfile } from './calculations';
import { formatTimestamp, getLocalDayIso, getLocalHourMinute } from './datetime';
import { orderScenariosForRecommendationDisplay } from './simulation';
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
    product.unitCapacityKwh && [64, 96, 232, 261].includes(Math.round(product.unitCapacityKwh))
      ? String(Math.round(product.unitCapacityKwh))
      : [232, 2090, 5015].includes(Math.round(product.capacityKwh))
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

function generatePvInteractiveReportHtml(payload: PdfPayload): string {
  const embeddedLogoSrc = getEmbeddedLogoSrc();
  const brochure = getRecommendedBrochureInfo(payload);
  const pvSummary = payload.pvSummary ?? {
    mode: 'EXPORT_ONLY',
    strategy: payload.pvStrategy ?? 'SELF_CONSUMPTION_ONLY',
    warnings: [],
    totalPvKwh: 0,
    totalConsumptionKwh: 0,
    selfConsumptionBeforeKwh: null,
    selfConsumptionAfterKwh: null,
    importedBefore: 0,
    importedAfter: 0,
    exportBefore: 0,
    exportAfter: 0,
    immediateExportedKwh: 0,
    capturedExportEnergyKwh: 0,
    shiftedExportedLaterKwh: 0,
    storedPvUsedOnsiteKwh: 0,
    totalUsefulDischargedEnergyKwh: 0,
    batteryUtilizationAgainstExport: 0,
    selfConsumptionRatio: null,
    selfSufficiency: null,
    importReductionKwh: 0,
    exportReduction: 0,
    avoidedImportValueEur: null,
    tradingExportValueEur: null,
    totalEconomicValueEur: null
  };
  const scenarioChartData = payload.scenarios.map((scenario) => ({
    optionLabel: scenario.optionLabel,
    capacityKwh: scenario.capacityKwh,
    powerKw: scenario.maxDischargeKw ?? 0,
    exportBefore: scenario.exportedEnergyBeforeKwh ?? 0,
    exportAfter: scenario.exportedEnergyAfterKwh ?? 0,
    immediateExport: scenario.immediateExportedKwh ?? 0,
    shiftedExport: scenario.shiftedExportedLaterKwh ?? 0,
    selfConsumption: ((scenario.achievedSelfConsumption ?? 0) * 100),
    selfSufficiency: ((scenario.selfSufficiency ?? 0) * 100),
    captureUtilization: ((scenario.batteryUtilizationAgainstExport ?? 0) * 100),
    totalUsefulDischarged: scenario.totalUsefulDischargedEnergyKwh ?? 0,
    importReduction: scenario.importReductionKwhAnnualized ?? scenario.importReductionKwh ?? 0,
    exportReductionAnnualized: scenario.exportReductionKwhAnnualized ?? 0,
    cyclesPerYear: scenario.cyclesPerYear ?? 0,
    economicValue: scenario.annualValueEur ?? scenario.totalEconomicValueEur ?? null,
    paybackYears: scenario.paybackYears ?? null,
    marginalGainPerAddedKwh: scenario.marginalGainPerAddedKwh ?? 0
  }));
  const formulaAdvice = payload.sizing.pvFormulaAdvice;
  const kpiCards =
    pvSummary.strategy === 'PV_WITH_TRADING'
      ? [
          ['Opgeslagen PV', `${pvSummary.capturedExportEnergyKwh.toFixed(2)} kWh`],
          ['Later geëxporteerd', `${pvSummary.shiftedExportedLaterKwh.toFixed(2)} kWh`],
          ['Importreductie', `${pvSummary.importReductionKwh.toFixed(2)} kWh`],
          ['Nuttige ontlading', `${pvSummary.totalUsefulDischargedEnergyKwh.toFixed(2)} kWh`],
          ['Economische waarde', pvSummary.totalEconomicValueEur != null ? `EUR ${pvSummary.totalEconomicValueEur.toFixed(2)}` : 'Niet berekend']
        ]
      : pvSummary.mode === 'FULL_PV'
      ? [
          ['Totale PV-opwek', `${(pvSummary.totalPvKwh ?? 0).toFixed(2)} kWh`],
          ['Zelfconsumptie', `${(((pvSummary.selfConsumptionRatio ?? 0) * 100)).toFixed(1)}%`],
          ['Zelfvoorziening', `${(((pvSummary.selfSufficiency ?? 0) * 100)).toFixed(1)}%`],
          ['Export voor batterij', `${pvSummary.exportBefore.toFixed(2)} kWh`],
          ['Export na batterij', `${pvSummary.exportAfter.toFixed(2)} kWh`]
        ]
      : [
          ['Export voor batterij', `${pvSummary.exportBefore.toFixed(2)} kWh`],
          ['Export na batterij', `${pvSummary.exportAfter.toFixed(2)} kWh`],
          ['Opgeslagen export', `${pvSummary.capturedExportEnergyKwh.toFixed(2)} kWh`],
          ['Benutting exportoverschot', `${(pvSummary.batteryUtilizationAgainstExport * 100).toFixed(1)}%`],
          ['Import na batterij', `${pvSummary.importedAfter.toFixed(2)} kWh`]
        ];

  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>WattsNext PV Opslag Rapport</title>
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
    body {
      margin: 0;
      font-family: Inter, Arial, Calibri, sans-serif;
      color: var(--text);
      background: var(--bg);
      line-height: 1.45;
    }
    .page {
      position: relative;
      max-width: 1200px;
      margin: 0 auto;
      padding: 24px;
      background: var(--bg);
    }
    .header, .card {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 14px;
      box-shadow: 0 6px 16px rgba(0,0,0,0.05);
    }
    .header {
      padding: 14px 18px 12px;
      display: grid;
      grid-template-columns: 230px 1fr auto;
      gap: 14px;
      align-items: center;
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
      width: 220px;
      min-height: 52px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 6px 8px;
      border: 1px solid #5f8e52;
      border-radius: 10px;
      background: linear-gradient(135deg, #2f5f33 0%, #3b7a3c 58%, #5a9b4a 100%);
    }
    .logoWrap img { max-width: 204px; max-height: 52px; }
    .logoFallback { display: none; color: #fff; font-weight: 700; }
    .brand h1, .card h3 { margin: 0; }
    .brand p { margin: 6px 0 0; color: var(--muted); font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; }
    .pill {
      display: inline-block; padding: 5px 9px; border-radius: 999px;
      background: rgba(78,141,62,.16); color: var(--green-dark); font-weight: 700; font-size: 9.5px;
    }
    .grid { display: grid; gap: 16px; margin-top: 16px; }
    .grid.kpis { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
    .grid.two { grid-template-columns: 1.2fr 1fr; }
    .card { padding: 14px; }
    .kpi-label { color: var(--muted); font-size: 9.5px; }
    .kpi-value { margin-top: 4px; font-weight: 700; font-size: 12px; color: var(--text); }
    .plot { width: 100%; height: 320px; }
    .brochureFrame { width: 100%; height: 420px; border: 1px solid var(--border); border-radius: 10px; background: #fff; }
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
    th, td { border-bottom: 1px solid var(--border); padding: 9px 10px; text-align: left; }
    th { background: var(--header-row); font-weight: 600; border-bottom: 1px solid var(--green); }
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
    }
  </style>
</head>
<body>
  <div class="page">
    <section class="hero">
      <div class="logoWrap">
        ${
          embeddedLogoSrc
            ? `<img src="${embeddedLogoSrc}" alt="WattsNext logo" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
               <div class="logoFallback">WattsNext</div>`
            : `<div class="logoFallback" style="display:block;">WattsNext</div>`
        }
      </div>
      <div class="brand">
        <h1>${pvSummary.strategy === 'PV_WITH_TRADING' ? 'PV + Trading Rapport' : 'PV Self Consumption Rapport'}</h1>
        <p>Slimme opslagcapaciteit voor meer eigen verbruik, lagere netafname en toekomstbestendige energiecontrole.</p>
      </div>
      <div class="advice-card">
        <div class="pill">${pvSummary.strategy === 'PV_WITH_TRADING' ? 'PV + trading' : 'PV analyse'}</div>
        <div class="muted" style="margin-top:8px;">${pvSummary.strategy === 'PV_WITH_TRADING' ? 'Trading van opgeslagen PV toegestaan' : `Self-consumption doel: ${(payload.compliance * 100).toFixed(0)}%`}</div>
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
            ${
              formulaAdvice
                ? `<tr><th>Klanttype</th><td>${formulaAdvice.usedCustomerType}</td></tr>
                   <tr><th>P50 / P75 / P90</th><td>${formulaAdvice.percentiles.p50StorageNeedKwh.toFixed(2)} / ${formulaAdvice.percentiles.p75StorageNeedKwh.toFixed(2)} / ${formulaAdvice.percentiles.p90StorageNeedKwh.toFixed(2)} kWh</td></tr>
                   <tr><th>Conservatief / aanbevolen / ruim</th><td>${formulaAdvice.roundedAdvice.conservativeKwh} / ${formulaAdvice.roundedAdvice.recommendedKwh} / ${formulaAdvice.roundedAdvice.spaciousKwh} kWh</td></tr>`
                : ''
            }
            <tr><th>Export voor/na batterij</th><td>${pvSummary.exportBefore.toFixed(2)} / ${pvSummary.exportAfter.toFixed(2)} kWh</td></tr>
            ${
              pvSummary.strategy === 'PV_WITH_TRADING'
                ? `<tr><th>Later geëxporteerd uit batterij</th><td>${pvSummary.shiftedExportedLaterKwh.toFixed(2)} kWh</td></tr>
                   <tr><th>Importreductie</th><td>${pvSummary.importReductionKwh.toFixed(2)} kWh</td></tr>`
                : pvSummary.mode === 'FULL_PV'
                ? `<tr><th>Zelfconsumptie ratio</th><td>${(((pvSummary.selfConsumptionRatio ?? 0) * 100)).toFixed(1)}%</td></tr>
                   <tr><th>Zelfvoorziening</th><td>${(((pvSummary.selfSufficiency ?? 0) * 100)).toFixed(1)}%</td></tr>`
                : `<tr><th>Opgeslagen export</th><td>${pvSummary.capturedExportEnergyKwh.toFixed(2)} kWh</td></tr>
                   <tr><th>Benutting exportoverschot</th><td>${(pvSummary.batteryUtilizationAgainstExport * 100).toFixed(1)}%</td></tr>`
            }
          </tbody>
        </table>
        <div class="callout">
          ${
            formulaAdvice
              ? 'Het batterijadvies is berekend op basis van dagelijkse teruglevering versus avond/nacht-netafname, zodat seizoensopslag en extreme zomerdagen niet tot een onrealistisch grote thuisbatterij leiden.'
              : pvSummary.strategy === 'PV_WITH_TRADING'
                ? 'De batterij mag opgeslagen PV later terugleveren aan het net binnen dezelfde kW-, efficiency- en SOC-limieten als elders in de app.'
                : pvSummary.mode === 'FULL_PV'
                  ? 'De PV-batterij wordt gedimensioneerd op basis van PV-surplus, piekmismatch tussen opwek en load, en batterijverliezen.'
                  : 'De batterij wordt hier gedimensioneerd op basis van gemeten terugleveroverschot en batterijbeperkingen; extra PV-metrics worden getoond zodra die data beschikbaar is.'
          }
        </div>
      </div>
      <div class="card">
        <h2 class="section-title">Aanbevolen batterijconfiguratie</h2>
        <p class="section-intro">De productsheet hoort bij de aanbevolen batterij of bij de modulaire basisvariant van deze configuratie.</p>
        ${
          brochure
            ? brochure.dataUri.startsWith('data:application/pdf')
              ? `<object class="brochureFrame" data="${brochure.dataUri}#page=1&zoom=page-width" type="application/pdf"></object>`
              : `<img class="brochureFrame" src="${brochure.dataUri}" alt="Productsheet batterij ${brochure.key}" style="object-fit:contain;" />`
            : `<div class="callout">Productsheet niet gevonden in assets-map.</div>`
        }
        ${brochure ? `<div class="muted" style="margin-top:8px;">Gekoppelde brochure: ${brochure.key}</div>` : ''}
      </div>
    </section>

    <section class="grid two">
      <div class="card">
        <h3>${pvSummary.strategy === 'PV_WITH_TRADING' ? 'Directe vs verschoven PV-export' : 'PV export voor/na batterij'}</h3>
        <div id="pv-export-chart" class="plot"></div>
      </div>
      <div class="card">
        <h3>${pvSummary.strategy === 'PV_WITH_TRADING' ? 'Trading- en batterijbenutting per scenario' : pvSummary.mode === 'FULL_PV' ? 'Self-consumption per scenario' : 'Benutting exportoverschot per scenario'}</h3>
        <div id="pv-self-chart" class="plot"></div>
      </div>
    </section>

    <section class="grid two">
      <div class="card">
        <h3>PV kernmetrics</h3>
        <table>
          <tbody>
            <tr><th>Totale load</th><td>${pvSummary.totalConsumptionKwh.toFixed(2)} kWh</td></tr>
            <tr><th>Import voor/na batterij</th><td>${pvSummary.importedBefore.toFixed(2)} / ${pvSummary.importedAfter.toFixed(2)} kWh</td></tr>
            <tr><th>Export reductie</th><td>${(pvSummary.exportReduction * 100).toFixed(1)}%</td></tr>
            ${
              formulaAdvice
                ? `<tr><th>PV-actieve dagen</th><td>${formulaAdvice.totals.numberOfPvActiveDays} / ${formulaAdvice.totals.numberOfDays}</td></tr>
                   <tr><th>Max dagelijkse export</th><td>${formulaAdvice.totals.maxDailyExportKwh.toFixed(2)} kWh</td></tr>
                   <tr><th>Cap reden</th><td>${formulaAdvice.rawAdvice.capReason ?? '-'}</td></tr>`
                : ''
            }
            ${
              pvSummary.strategy === 'PV_WITH_TRADING'
                ? `<tr><th>Direct geëxporteerd</th><td>${pvSummary.immediateExportedKwh.toFixed(2)} kWh</td></tr>
                   <tr><th>Later geëxporteerd uit batterij</th><td>${pvSummary.shiftedExportedLaterKwh.toFixed(2)} kWh</td></tr>
                   <tr><th>Opgeslagen PV gebruikt op site</th><td>${pvSummary.storedPvUsedOnsiteKwh.toFixed(2)} kWh</td></tr>
                   <tr><th>Totale nuttige ontlading</th><td>${pvSummary.totalUsefulDischargedEnergyKwh.toFixed(2)} kWh</td></tr>`
                : pvSummary.mode === 'FULL_PV'
                ? `<tr><th>Totale PV-opwek</th><td>${(pvSummary.totalPvKwh ?? 0).toFixed(2)} kWh</td></tr>
                   <tr><th>Self-consumed voor batterij</th><td>${(pvSummary.selfConsumptionBeforeKwh ?? 0).toFixed(2)} kWh</td></tr>
                   <tr><th>Self-consumed na batterij</th><td>${(pvSummary.selfConsumptionAfterKwh ?? 0).toFixed(2)} kWh</td></tr>`
                : `<tr><th>Opgeslagen export</th><td>${pvSummary.capturedExportEnergyKwh.toFixed(2)} kWh</td></tr>
                   <tr><th>Benutting exportoverschot</th><td>${(pvSummary.batteryUtilizationAgainstExport * 100).toFixed(1)}%</td></tr>
                   <tr><th>Status</th><td>${pvSummary.warnings.join(' ') || 'Analyse op basis van verbruik en teruglevering'}</td></tr>`
            }
          </tbody>
        </table>
      </div>
      <div class="card">
        <h2 class="section-title">Datakwaliteit</h2>
        <p class="section-intro">De kwaliteit van de kwartierdata bepaalt hoe robuust het advies kan worden geinterpreteerd.</p>
        <table>
          <tbody>
            <tr><th>Rijen</th><td>${payload.quality.rows}</td></tr>
            <tr><th>Datumbereik</th><td>${payload.quality.startDate ?? '-'} t/m ${payload.quality.endDate ?? '-'}</td></tr>
            <tr><th>Ontbrekende intervallen</th><td>${payload.quality.missingIntervalsCount}</td></tr>
            <tr><th>Duplicaten</th><td>${payload.quality.duplicateCount}</td></tr>
            <tr><th>Niet-15-min overgangen</th><td>${payload.quality.non15MinIntervals}</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <h2 class="section-title">Vervolgstappen</h2>
      <p class="section-intro">Na akkoord op de richting van het advies volgen de technische en commerciele controles richting realisatie.</p>
      <div class="steps">
        <div class="step"><div class="step-number">1</div><div class="step-title">Controle netaansluiting</div></div>
        <div class="step"><div class="step-number">2</div><div class="step-title">Controle omvormer en EMS-integratie</div></div>
        <div class="step"><div class="step-number">3</div><div class="step-title">Bevestigen tariefstructuur en businesscase</div></div>
        <div class="step"><div class="step-number">4</div><div class="step-title">Definitieve offerte</div></div>
        <div class="step"><div class="step-number">5</div><div class="step-title">Installatieplanning</div></div>
        <div class="step"><div class="step-number">6</div><div class="step-title">Monitoring na oplevering</div></div>
      </div>
    </section>

    <footer class="footer">
      <div>WattsNext Energieoplossingen</div>
      <div>${pvSummary.strategy === 'PV_WITH_TRADING' ? 'PV + trading rapport' : 'PV self-consumption rapport'}</div>
    </footer>
  </div>

  <script>
    const scenarioData = ${safeJson(scenarioChartData)};
    const wattsTheme = {
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: '#FFFFFF',
      font: {family: 'Inter, Arial, Calibri, sans-serif', color: '#232323'},
      margin: {t: 12, r: 12, b: 70, l: 55}
    };

    Plotly.newPlot('pv-export-chart', [
      {
        type: 'bar',
        name: '${pvSummary.strategy === 'PV_WITH_TRADING' ? 'Direct export' : 'Voor'}',
        x: scenarioData.map(d => d.optionLabel),
        y: scenarioData.map(d => ${pvSummary.strategy === 'PV_WITH_TRADING' ? 'd.immediateExport' : 'd.exportBefore'}),
        marker: {color: '#F59E0B'}
      },
      {
        type: 'bar',
        name: '${pvSummary.strategy === 'PV_WITH_TRADING' ? 'Later uit batterij' : 'Na'}',
        x: scenarioData.map(d => d.optionLabel),
        y: scenarioData.map(d => ${pvSummary.strategy === 'PV_WITH_TRADING' ? 'd.shiftedExport' : 'd.exportAfter'}),
        marker: {color: '#22C55E'}
      }
    ], {
      ...wattsTheme,
      barmode: 'group',
      hovermode: 'x unified',
      xaxis: {tickangle: -20},
      yaxis: {title: 'kWh', rangemode: 'tozero'},
      margin: {t: 30, r: 12, b: 90, l: 55}
    }, {responsive: true, displaylogo: false});

    Plotly.newPlot('pv-self-chart', [
      {
        type: 'bar',
        name: '${pvSummary.strategy === 'PV_WITH_TRADING' ? 'Totale nuttige ontlading' : pvSummary.mode === 'FULL_PV' ? 'Zelfconsumptie' : 'Benutting surplus'}',
        x: scenarioData.map(d => d.optionLabel),
        y: scenarioData.map(d => ${pvSummary.strategy === 'PV_WITH_TRADING' ? 'd.totalUsefulDischarged' : pvSummary.mode === 'FULL_PV' ? 'd.selfConsumption' : 'd.captureUtilization'}),
        marker: {color: '#2563EB'}
      },
      {
        type: 'bar',
        name: '${pvSummary.strategy === 'PV_WITH_TRADING' ? 'Importreductie' : pvSummary.mode === 'FULL_PV' ? 'Zelfvoorziening' : 'Exportreductie'}',
        x: scenarioData.map(d => d.optionLabel),
        y: scenarioData.map(d => ${pvSummary.strategy === 'PV_WITH_TRADING' ? 'd.importReduction' : pvSummary.mode === 'FULL_PV' ? 'd.selfSufficiency' : '((d.exportBefore > 0 ? ((d.exportBefore - d.exportAfter) / d.exportBefore) * 100 : 0))'}),
        marker: {color: '#7C3AED'}
      }
    ], {
      ...wattsTheme,
      barmode: 'group',
      hovermode: 'x unified',
      xaxis: {tickangle: -20},
      yaxis: {title: '%', rangemode: 'tozero'},
      margin: {t: 30, r: 12, b: 90, l: 55}
    }, {responsive: true, displaylogo: false});
  </script>
</body>
</html>`;
}

function generatePvInteractiveReportHtmlV2(payload: PdfPayload): string {
  const embeddedLogoSrc = getEmbeddedLogoSrc();
  const brochure = getRecommendedBrochureInfo(payload);
  const isFinancialReport = payload.reportVariant === 'financial';
  const formulaAdvice = payload.sizing.pvFormulaAdvice;
  const hybridAdvice = payload.sizing.pvSelfConsumptionAdvice;
  const pvCharts = payload.pvAdviceCharts;
  const recommendedScenario = hybridAdvice?.simulationAdvice.recommended ?? null;
  const pricingMode = hybridAdvice?.configUsed.pricingMode ?? 'average';
  const pricingStats = hybridAdvice?.configUsed.pricingStats;
  const formatEuro = (value: number): string => `EUR ${value.toFixed(2)}`;
  const formatSignedEuro = (value: number): string =>
    `${value < 0 ? '-' : ''}EUR ${Math.abs(value).toFixed(2)}`;
  const hasFinancialValueData =
    recommendedScenario?.annualValueEur != null ||
    (pvCharts?.annualValueByCapacityChart?.length ?? 0) > 0 ||
    (pvCharts?.importExportCostChart?.length ?? 0) > 0;
  const yearlyCostsEur = recommendedScenario?.yearlyCostsEur ?? 0;
  const exportNetPriceEurPerKwh =
    (hybridAdvice?.configUsed.exportCompensationEurPerKwh ?? 0) -
    (hybridAdvice?.configUsed.feedInCostEurPerKwh ?? 0);
  const importValueEur =
    (recommendedScenario?.importReductionKwhAnnualized ?? 0) *
    (hybridAdvice?.configUsed.importPriceEurPerKwh ?? 0);
  const lostExportValueEur =
    (recommendedScenario?.exportReductionKwhAnnualized ?? 0) * exportNetPriceEurPerKwh;
  const dynamicGrossValueEur =
    recommendedScenario?.dynamicValueEur ??
    ((recommendedScenario?.baselineEnergyCostEur ?? 0) - (recommendedScenario?.batteryEnergyCostEur ?? 0));
  const tariffGrossValueEur = importValueEur - lostExportValueEur;
  const grossValueEur = pricingMode === 'dynamic' ? dynamicGrossValueEur : tariffGrossValueEur;
  const annualValueEur = recommendedScenario?.annualValueEur ?? null;
  const modelCorrectionEur =
    annualValueEur == null ? 0 : annualValueEur - (grossValueEur - yearlyCostsEur);
  const annualValueBreakdownRows = hasFinancialValueData
    ? pricingMode === 'dynamic'
      ? [
          {
            label: 'Kosten zonder batterij',
            value: recommendedScenario?.baselineEnergyCostEur ?? 0,
            explanation: 'Som van importkosten minus terugleververgoeding plus terugleverkosten in de referentiesituatie.'
          },
          {
            label: 'Kosten met batterij',
            value: -(recommendedScenario?.batteryEnergyCostEur ?? 0),
            explanation: 'Dezelfde kostenberekening nadat de aanbevolen batterij per kwartier is gesimuleerd.'
          },
          {
            label: 'Bruto waarde batterij',
            value: grossValueEur,
            explanation: 'Kosten zonder batterij minus kosten met batterij.'
          },
          {
            label: 'Jaarlijkse onderhoud/kosten',
            value: -yearlyCostsEur,
            explanation: 'Handmatig ingevoerde jaarlijkse kosten.'
          },
          {
            label: 'Jaarlijkse waarde',
            value: annualValueEur ?? 0,
            explanation: 'Bruto waarde minus jaarlijkse kosten.'
          }
        ]
      : [
          {
            label: 'Vermeden importkosten',
            value: importValueEur,
            explanation: `${Math.round(recommendedScenario?.importReductionKwhAnnualized ?? 0).toLocaleString('nl-NL')} kWh importreductie x ${formatEuro(hybridAdvice?.configUsed.importPriceEurPerKwh ?? 0)}/kWh.`
          },
          {
            label: 'Misgelopen terugleverwaarde',
            value: -lostExportValueEur,
            explanation: `${Math.round(recommendedScenario?.exportReductionKwhAnnualized ?? 0).toLocaleString('nl-NL')} kWh minder export x netto exportwaarde ${formatEuro(exportNetPriceEurPerKwh)}/kWh.`
          },
          {
            label: 'Bruto waarde batterij',
            value: grossValueEur,
            explanation: 'Vermeden importkosten minus misgelopen terugleverwaarde.'
          },
          {
            label: 'Jaarlijkse onderhoud/kosten',
            value: -yearlyCostsEur,
            explanation: 'Handmatig ingevoerde jaarlijkse kosten.'
          },
          ...(Math.abs(modelCorrectionEur) >= 0.01
            ? [
                {
                  label: 'Modelcorrectie / afronding',
                  value: modelCorrectionEur,
                  explanation: 'Verschil tussen de scenario-uitkomst en de afgeronde tariefcomponenten hierboven.'
                }
              ]
            : []),
          {
            label: 'Jaarlijkse waarde',
            value: annualValueEur ?? 0,
            explanation: 'Netto waarde die ook in de scenariovergelijking wordt gebruikt.'
          }
        ]
    : [];
  const scenarioChartData = payload.scenarios.map((scenario) => ({
    optionLabel: scenario.optionLabel,
    chartLabel: `${Math.round(scenario.capacityKwh).toLocaleString('nl-NL')} kWh`,
    capacityKwh: scenario.capacityKwh,
    powerKw: scenario.maxDischargeKw ?? 0,
    importReductionKwhAnnualized: scenario.importReductionKwhAnnualized ?? scenario.importReductionKwh ?? 0,
    exportReductionKwhAnnualized: scenario.exportReductionKwhAnnualized ?? 0,
    cyclesPerYear: scenario.cyclesPerYear ?? 0,
    economicValue: scenario.annualValueEur ?? scenario.totalEconomicValueEur ?? 0,
    marginalGainPerAddedKwh: scenario.marginalGainPerAddedKwh ?? 0,
    isRecommended:
      scenario.capacityKwh ===
      (hybridAdvice?.simulationAdvice.recommended.capacityKwh ?? payload.sizing.recommendedProduct?.capacityKwh),
    isEligible: scenario.isEligible !== false,
    status:
      scenario.isEligible === false
        ? scenario.excludedReason ?? 'Uitgesloten'
        : scenario.recommendationReason ?? 'Geschikt'
  }));
  const impactBeforeAfter = recommendedScenario
    ? [
        { label: 'Import zonder batterij', value: recommendedScenario.importBeforeKwh },
        { label: 'Import met aanbevolen batterij', value: recommendedScenario.importAfterKwh },
        { label: 'Export zonder batterij', value: recommendedScenario.exportBeforeKwh },
        { label: 'Export met aanbevolen batterij', value: recommendedScenario.exportAfterKwh }
      ]
    : [];
  const kpiCards = [
    ['Aanbevolen batterij', payload.sizing.recommendedProduct?.label ?? `${recommendedScenario?.capacityKwh ?? payload.sizing.kWhNeeded} kWh`],
    ['Importreductie per jaar', recommendedScenario ? `${Math.round(recommendedScenario.importReductionKwhAnnualized).toLocaleString('nl-NL')} kWh/jaar` : '-'],
    ['Exportreductie per jaar', recommendedScenario ? `${Math.round(recommendedScenario.exportReductionKwhAnnualized).toLocaleString('nl-NL')} kWh/jaar` : '-'],
    ['Kwartiermetingen', payload.quality.rows.toLocaleString('nl-NL')],
    ['Cycli per jaar', recommendedScenario ? recommendedScenario.cyclesPerYear.toFixed(1) : '-'],
    ['Simulatieperiode', `${payload.quality.startDate ?? '-'} t/m ${payload.quality.endDate ?? '-'}`]
  ];
  const scenarioCards = [
    { label: 'Conservatief', scenario: hybridAdvice?.simulationAdvice.conservative, tone: 'muted' },
    { label: 'Aanbevolen', scenario: hybridAdvice?.simulationAdvice.recommended, tone: 'recommended' },
    { label: 'Ruim', scenario: hybridAdvice?.simulationAdvice.spacious, tone: 'muted' }
  ].filter((item) => item.scenario != null);
  const recommendedProductLabel = payload.sizing.recommendedProduct?.label ?? 'Geen haalbare configuratie';
  const recommendedCapacityText =
    payload.sizing.recommendedProduct != null
      ? `${payload.sizing.recommendedProduct.capacityKwh} kWh`
      : `${payload.sizing.kWhNeeded.toFixed(2)} kWh`;
  const recommendedPowerText =
    payload.sizing.recommendedProduct != null
      ? `${payload.sizing.recommendedProduct.powerKw} kW`
      : `${payload.sizing.kWNeeded.toFixed(2)} kW`;

  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${isFinancialReport ? 'WattsNext Onderbouwing Terugverdientijd' : 'WattsNext PV Opslag Rapport'}</title>
  <script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
  <style>
    :root {
      --wn-green: #4E8D3E;
      --wn-green-dark: #2F5F33;
      --wn-green-soft: #EEF7EA;
      --wn-bg: #F7F9F5;
      --wn-card: #FFFFFF;
      --wn-text: #232323;
      --wn-muted: #7A7F78;
      --wn-border: #E4E9E1;
      --wn-warning: #F5B83D;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, Arial, Calibri, sans-serif;
      color: var(--wn-text);
      background: var(--wn-bg);
      line-height: 1.5;
    }
    .page { max-width: 1180px; margin: 0 auto; padding: 28px; }
    .header {
      display: grid;
      grid-template-columns: 220px minmax(0, 1fr) minmax(300px, .72fr);
      gap: 28px;
      align-items: stretch;
      overflow: hidden;
      border-radius: 28px;
      padding: 34px;
      background:
        radial-gradient(circle at 90% 10%, rgba(255,255,255,.18), transparent 28%),
        linear-gradient(135deg, var(--wn-green-dark) 0%, #3D7C37 58%, var(--wn-green) 100%);
      color: #fff;
      box-shadow: 0 24px 60px rgba(47,95,51,.22);
    }
    .brand { align-self: center; }
    .brand h1 { margin: 0; font-size: 38px; line-height: 1.08; letter-spacing: 0; }
    .brand p { max-width: 680px; margin: 14px 0 0; color: rgba(255,255,255,.86); font-size: 16px; }
    .hero {
      overflow: hidden;
      border-radius: 28px;
      background:
        radial-gradient(circle at 90% 10%, rgba(255,255,255,.18), transparent 28%),
        linear-gradient(135deg, var(--wn-green-dark) 0%, #3D7C37 58%, var(--wn-green) 100%);
      color: #fff;
      box-shadow: 0 24px 60px rgba(47,95,51,.22);
    }
    .hero-inner {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(300px, .75fr);
      gap: 28px;
      align-items: stretch;
      padding: 34px;
    }
    .logoWrap {
      width: 210px;
      min-height: 54px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 7px 10px;
      border: 1px solid rgba(255,255,255,.35);
      border-radius: 14px;
      background: rgba(255,255,255,.12);
    }
    .logoWrap img { max-width: 190px; max-height: 48px; }
    .logoFallback { display: none; color: #fff; font-weight: 700; }
    .eyebrow {
      margin-top: 28px;
      color: rgba(255,255,255,.78);
      font-size: 10px;
      letter-spacing: .18em;
      text-transform: uppercase;
      font-weight: 700;
    }
    h1 { margin: 8px 0 0; font-size: 38px; line-height: 1.08; letter-spacing: 0; }
    .hero-subtitle { max-width: 720px; margin: 14px 0 0; color: rgba(255,255,255,.86); font-size: 16px; }
    .advice-card {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 260px;
      padding: 24px;
      border: 1px solid rgba(255,255,255,.2);
      border-radius: 24px;
      background: rgba(255,255,255,.13);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.16);
      backdrop-filter: blur(6px);
    }
    .advice-label {
      width: fit-content;
      padding: 7px 11px;
      border-radius: 999px;
      background: rgba(255,255,255,.18);
      color: #fff;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .advice-title { margin-top: 18px; font-size: 24px; line-height: 1.18; font-weight: 800; }
    .advice-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 22px; }
    .advice-metric { border-top: 1px solid rgba(255,255,255,.24); padding-top: 12px; }
    .advice-metric span { display: block; color: rgba(255,255,255,.7); font-size: 10px; }
    .advice-metric strong { display: block; margin-top: 3px; font-size: 18px; }
    .grid { display: grid; gap: 18px; margin-top: 18px; }
    .grid.kpis { grid-template-columns: repeat(6, minmax(0, 1fr)); }
    .grid.two { grid-template-columns: minmax(0, 1.18fr) minmax(320px, .82fr); }
    .grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .card {
      background: var(--wn-card);
      border: 1px solid var(--wn-border);
      border-radius: 20px;
      padding: 22px;
      box-shadow: 0 14px 36px rgba(47,95,51,.08);
    }
    .section-title { margin: 0 0 6px; font-size: 20px; line-height: 1.2; color: var(--wn-text); }
    .section-intro { margin: 0 0 16px; color: var(--wn-muted); font-size: 12.5px; }
    .kpi-card { min-height: 112px; padding: 18px; }
    .kpi-label { color: var(--wn-muted); font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .kpi-value { margin-top: 10px; font-weight: 800; font-size: 16px; color: var(--wn-text); line-height: 1.25; }
    .plot { width: 100%; height: 330px; }
    .plot.tall { height: 380px; }
    .brochureFrame { width: 100%; height: 420px; border: 1px solid var(--wn-border); border-radius: 16px; background: #fff; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 11.5px; color: var(--wn-text); overflow: hidden; border-radius: 14px; border: 1px solid var(--wn-border); }
    th, td { border-bottom: 1px solid var(--wn-border); padding: 12px 14px; text-align: left; vertical-align: top; }
    th { background: var(--wn-green-soft); color: var(--wn-green-dark); font-weight: 800; }
    td strong, tbody tr td:nth-child(2) { font-weight: 700; }
    tbody tr:nth-child(even) td { background: #FBFCFA; }
    tbody tr:last-child td { border-bottom: none; }
    .muted { color: var(--wn-muted); font-size: 10.5px; line-height: 1.45; margin-top: 8px; }
    .callout {
      background: var(--wn-green-soft);
      border: 1px solid #D6E8D0;
      border-left: 5px solid var(--wn-green);
      border-radius: 16px;
      padding: 14px 16px;
      margin-top: 14px;
      font-size: 12px;
      color: #315536;
    }
    .warning {
      background: #FFF8E8;
      border-color: #F6E4B5;
      border-left-color: var(--wn-warning);
      color: #594214;
    }
    .scenario-card { position: relative; min-height: 185px; }
    .scenario-card.recommended {
      border-color: rgba(78,141,62,.45);
      box-shadow: 0 18px 44px rgba(78,141,62,.18);
      transform: translateY(-4px);
    }
    .scenario-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 999px;
      background: var(--wn-green-soft);
      color: var(--wn-green-dark);
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .08em;
    }
    .scenario-card.recommended .scenario-pill { background: var(--wn-green); color: #fff; }
    .scenario-title { margin: 14px 0 4px; font-size: 22px; font-weight: 800; color: var(--wn-green-dark); }
    .scenario-list { display: grid; gap: 8px; margin-top: 14px; color: var(--wn-muted); font-size: 11px; }
    .conclusion-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-top: 12px; }
    .conclusion-item { border-radius: 16px; background: rgba(255,255,255,.72); padding: 14px; }
    .conclusion-item strong { display: block; margin-bottom: 6px; color: var(--wn-green-dark); }
    .steps { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; }
    .step { position: relative; min-height: 118px; border: 1px solid var(--wn-border); border-radius: 16px; padding: 14px; background: #fff; }
    .step-number { width: 28px; height: 28px; border-radius: 999px; display: grid; place-items: center; background: var(--wn-green); color: #fff; font-weight: 800; font-size: 12px; }
    .step-title { margin-top: 12px; font-size: 12px; font-weight: 800; color: var(--wn-green-dark); }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid var(--wn-border); display: flex; justify-content: space-between; gap: 12px; color: var(--wn-muted); font-size: 10px; }
    @media (max-width: 980px) {
      .hero-inner, .grid.two, .grid.three { grid-template-columns: 1fr; }
      .grid.kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .steps, .conclusion-grid { grid-template-columns: 1fr 1fr; }
      h1 { font-size: 30px; }
    }
    @media print {
      body { background: #fff; }
      .page { max-width: none; padding: 14mm; }
      .hero { box-shadow: none; border-radius: 18px; }
      .hero-inner { padding: 20px; grid-template-columns: 1.1fr .9fr; }
      h1 { font-size: 26px; }
      .card, .kpi-card, .scenario-card, .step { box-shadow: none; page-break-inside: avoid; break-inside: avoid; }
      .grid { gap: 12px; margin-top: 12px; }
      .plot { height: 260px; }
      .brochureFrame { height: 320px; }
      table, .plot { page-break-inside: avoid; break-inside: avoid; }
      .footer { display: flex; }
    }
  </style>
</head>
<body>
  <div class="page">
    <section class="header">
      <div class="logoWrap">
        ${embeddedLogoSrc ? `<img src="${embeddedLogoSrc}" alt="WattsNext logo" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" /><div class="logoFallback">WattsNext</div>` : `<div class="logoFallback" style="display:block;">WattsNext</div>`}
      </div>
      <div class="brand">
        <h1>Batterijadvies op basis van kwartierdata</h1>
        <p>Slimme opslagcapaciteit voor meer eigen verbruik, lagere netafname en toekomstbestendige energiecontrole.</p>
      </div>
      <div class="advice-card">
        <div class="advice-label">${recommendedScenario ? 'Beste balans' : 'Aanbevolen configuratie'}</div>
        <div class="advice-title">${recommendedProductLabel}</div>
        <div class="advice-metrics">
          <div class="advice-metric"><span>Totale opslagcapaciteit</span><strong>${recommendedCapacityText}</strong></div>
          <div class="advice-metric"><span>Vermogen</span><strong>${recommendedPowerText}</strong></div>
        </div>
        <div class="muted" style="margin-top:8px;">${isFinancialReport ? 'Financiële doorrekening op basis van bestaand technisch advies' : 'Formulebasis plus kwartiersimulatie'}</div>
      </div>
    </section>

    <section class="grid kpis">
      ${kpiCards.map(([label, value]) => `<div class="card kpi-card"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div></div>`).join('')}
    </section>

    <section class="grid two">
      <div class="card">
        <h2 class="section-title">Managementsamenvatting</h2>
        <p class="section-intro">Het advies combineert historische kwartierdata met een simulatie van batterijgedrag. De uitkomst hieronder is bedoeld als praktisch batterijadvies voor dimensionering en vervolgbesluitvorming.</p>
        <table><tbody>
          <tr><th>Aanbevolen configuratie</th><td>${payload.sizing.recommendedProduct?.label ?? 'Geen haalbare configuratie'}</td></tr>
          <tr><th>Benodigde capaciteit</th><td>${payload.sizing.kWhNeeded.toFixed(2)} kWh</td></tr>
          <tr><th>Benodigd vermogen</th><td>${payload.sizing.kWNeeded.toFixed(2)} kW</td></tr>
          <tr><th>Importreductie per jaar</th><td>${recommendedScenario ? `${Math.round(recommendedScenario.importReductionKwhAnnualized).toLocaleString('nl-NL')} kWh/jaar` : '-'}</td></tr>
          <tr><th>Exportreductie per jaar</th><td>${recommendedScenario ? `${Math.round(recommendedScenario.exportReductionKwhAnnualized).toLocaleString('nl-NL')} kWh/jaar` : '-'}</td></tr>
          <tr><th>Cycli per jaar</th><td>${recommendedScenario ? recommendedScenario.cyclesPerYear.toFixed(1) : '-'}</td></tr>
          ${
            hasFinancialValueData
              ? `<tr><th>Jaarlijkse waarde</th><td>${annualValueEur != null ? `EUR ${annualValueEur.toFixed(2)}` : 'Niet berekend'}</td></tr>`
              : ''
          }
          ${
            isFinancialReport
              ? `<tr><th>Prijsmodus</th><td>${pricingMode === 'dynamic' ? 'Dynamische prijzen' : 'Gemiddelde tarieven'}</td></tr>
                 <tr><th>Gem. importprijs</th><td>${hybridAdvice?.configUsed.importPriceEurPerKwh != null ? `EUR ${hybridAdvice.configUsed.importPriceEurPerKwh.toFixed(3)}/kWh` : '-'}</td></tr>
                 <tr><th>Gem. exportvergoeding</th><td>${hybridAdvice?.configUsed.exportCompensationEurPerKwh != null ? `EUR ${hybridAdvice.configUsed.exportCompensationEurPerKwh.toFixed(3)}/kWh` : '-'}</td></tr>
                 ${
                   pricingMode === 'dynamic' && pricingStats
                     ? `<tr><th>Exacte prijs-matches</th><td>${pricingStats.exactMatches}</td></tr>
                        <tr><th>Uurmatches</th><td>${pricingStats.hourlyMatches}</td></tr>
                        <tr><th>Periode-matches</th><td>${pricingStats.variablePeriodMatches}</td></tr>
                        <tr><th>Fallbackmatches</th><td>${pricingStats.fallbackMatches}</td></tr>
                        <tr><th>Ontbrekende prijzen</th><td>${pricingStats.missingPrices}</td></tr>`
                     : ''
                 }
                 ${!hasFinancialValueData ? `<tr><th>Jaarlijkse waarde</th><td>Niet berekend</td></tr>` : ''}`
              : ''
          }
        </tbody></table>
        <div class="callout">
          ${recommendedScenario?.recommendationReason ?? 'Deze batterij is gekozen op basis van dagelijkse opslagbehoefte en kwartiersimulatie.'}
          ${
            isFinancialReport
              ? `<br /><br />${
                  pricingMode === 'dynamic'
                    ? 'De dynamische prijsmodule berekent per interval het verschil tussen de situatie zonder batterij en met batterij. In deze PV-zelfverbruikmodus wordt niet actief geladen vanaf het net voor energiehandel.'
                    : 'De financi??le waarde is gebaseerd op gemiddelde import- en exporttarieven en is dus een indicatieve benadering.'
                }`
              : ''
          }
        </div>
        ${!hasFinancialValueData ? `<div class="callout warning">De technische configuratie is gebaseerd op historische kwartierdata. De definitieve businesscase moet worden bevestigd met actuele tarieven, investeringskosten, terugleververgoeding, EMS-instellingen en technische aansluitvoorwaarden.</div>` : ''}
      </div>
      <div class="card">
        <h2 class="section-title">Aanbevolen batterijconfiguratie</h2>
        <p class="section-intro">De productsheet hoort bij de aanbevolen batterij of bij de modulaire basisvariant van deze configuratie.</p>
        ${brochure ? (brochure.dataUri.startsWith('data:application/pdf') ? `<object class="brochureFrame" data="${brochure.dataUri}#page=1&zoom=page-width" type="application/pdf"></object>` : `<img class="brochureFrame" src="${brochure.dataUri}" alt="Productsheet batterij ${brochure.key}" style="object-fit:contain;" />`) : `<div class="callout">Productsheet niet gevonden in assets-map.</div>`}
      </div>
    </section>

    <section class="card">
      <h2 class="section-title">Waarom dit advies?</h2>
      <p class="section-intro">De aanbevolen configuratie is gekozen omdat deze in de simulatie de beste balans geeft tussen bruikbare opslagcapaciteit, importreductie, exportreductie, cycli en praktische inzetbaarheid.</p>
      <div class="conclusion-grid">
        <div class="conclusion-item"><strong>Waarom deze batterij?</strong><span>${recommendedScenario?.recommendationReason ?? 'Deze configuratie sluit het beste aan op het gemeten kwartierprofiel en de praktische opslagbehoefte.'}</span></div>
        <div class="conclusion-item"><strong>Waarom kleiner minder geschikt is</strong><span>Een kleinere batterij kan minder zonne-overschot of verbruikspieken verschuiven en benut daardoor minder van het beschikbare profiel.</span></div>
        <div class="conclusion-item"><strong>Waarom groter niet altijd beter is</strong><span>Bij grotere batterijen vlakt de meeropbrengst per extra kWh af. Extra capaciteit levert dan relatief minder extra waarde op.</span></div>
      </div>
    </section>

    ${scenarioCards.length > 0 ? `<section class="grid three">
      ${scenarioCards
        .map(
          (item) => `
      <div class="card scenario-card ${item.tone === 'recommended' ? 'recommended' : ''}">
        <div class="scenario-pill">${item.tone === 'recommended' ? 'Aanbevolen' : item.label}</div>
        <div class="scenario-title">${item.scenario?.capacityKwh ?? '-'} kWh</div>
        <div class="muted">${item.scenario?.optionLabel ?? ''}</div>
        <div class="scenario-list">
          <div>Importreductie: <strong>${item.scenario ? Math.round(item.scenario.importReductionKwhAnnualized).toLocaleString('nl-NL') : '-'} kWh/jaar</strong></div>
          <div>Exportreductie: <strong>${item.scenario ? Math.round(item.scenario.exportReductionKwhAnnualized).toLocaleString('nl-NL') : '-'} kWh/jaar</strong></div>
          <div>Cycli: <strong>${item.scenario ? item.scenario.cyclesPerYear.toFixed(1) : '-'}</strong></div>
        </div>
      </div>`
        )
        .join('')}
    </section>` : ''}

    <section class="grid two">
      <div class="card">
        <h2 class="section-title">Analyse van kwartierdata</h2>
        <p class="section-intro">De dagelijkse opslagbehoefte laat zien hoeveel energie praktisch verschoven kan worden binnen het gemeten profiel.</p>
        <div id="pv-daily-storage-chart" class="plot"></div>
        <div class="muted">X-as: datum per dag. Y-as: nuttige opslagbehoefte in kWh per dag.</div>
        <div class="callout">Deze grafiek laat zien hoeveel zonne-overschot later op de dag of nacht nuttig gebruikt kan worden. De P50-, P75- en P90-lijnen vormen de formulematige basis van het advies.</div>
      </div>
      <div class="card">
        <h2 class="section-title">Scenariovergelijking</h2>
        <p class="section-intro">De scenario's tonen het effect van verschillende batterijgroottes op importreductie, exportreductie en eventuele jaarlijkse waarde.</p>
        <div id="pv-scenario-comparison-chart" class="plot"></div>
        <div class="muted">X-as: batterijopties. Linker Y-as: kWh per jaar. Rechter Y-as: euro per jaar.</div>
        <div class="callout">Per batterijoptie zie je capaciteit, vermogen, importreductie, exportreductie, cycli en jaarlijkse waarde. Dit onderbouwt waarom de aanbevolen batterij is gekozen.</div>
      </div>
    </section>

    ${
      hasFinancialValueData
        ? `<section class="grid two">
      <div class="card">
        <h2 class="section-title">Opbouw jaarlijkse waarde</h2>
        <table>
          <thead>
            <tr>
              <th>Component</th>
              <th>Bedrag</th>
              <th>Berekening / bron</th>
            </tr>
          </thead>
          <tbody>
            ${annualValueBreakdownRows
              .map(
                (row) => `
            <tr>
              <td>${row.label}</td>
              <td>${formatSignedEuro(row.value)}</td>
              <td>${row.explanation}</td>
            </tr>`
              )
              .join('')}
          </tbody>
        </table>
        <div class="callout">De jaarlijkse waarde is de netto economische bijdrage van de aanbevolen batterij in de gekozen prijsmodus. Positieve componenten verhogen de waarde; negatieve componenten verlagen die.</div>
      </div>
      <div class="card">
        <h2 class="section-title">Waardecomponenten aanbevolen batterij</h2>
        <div id="pv-value-breakdown-chart" class="plot"></div>
        <div class="muted">Y-as: euro. De laatste balk is de netto jaarlijkse waarde die in het advies wordt gebruikt.</div>
        <div class="callout">Deze grafiek maakt zichtbaar of de waarde vooral uit vermeden importkosten, lagere energiekosten per interval of kostenposten komt.</div>
      </div>
    </section>`
        : ''
    }

    <section class="grid two">
      <div class="card">
        <h2 class="section-title">Effect voor en na batterij</h2>
        <p class="section-intro">Deze grafiek vergelijkt teruglevering met avond- en nachtverbruik, zodat zichtbaar wordt welk deel praktisch kan worden opgeslagen.</p>
        <div id="pv-export-night-chart" class="plot"></div>
        <div class="muted">X-as: datum per dag. Y-as: energie in kWh per dag.</div>
        <div class="callout">Deze grafiek vergelijkt per dag hoeveel zonne-overschot beschikbaar is met hoeveel avond- en nachtverbruik daar praktisch tegenover staat.</div>
      </div>
      <div class="card">
        <h2 class="section-title">Datakwaliteit</h2>
        <p class="section-intro">De kwaliteit van de kwartierdata bepaalt hoe robuust het advies kan worden geinterpreteerd.</p>
        <table><tbody>
          <tr><th>Rijen</th><td>${payload.quality.rows}</td></tr>
          <tr><th>Datumbereik</th><td>${payload.quality.startDate ?? '-'} t/m ${payload.quality.endDate ?? '-'}</td></tr>
          <tr><th>Ontbrekende intervallen</th><td>${payload.quality.missingIntervalsCount}</td></tr>
          <tr><th>Duplicaten</th><td>${payload.quality.duplicateCount}</td></tr>
          <tr><th>Niet-15-min overgangen</th><td>${payload.quality.non15MinIntervals}</td></tr>
          <tr><th>PV-actieve dagen</th><td>${formulaAdvice ? `${formulaAdvice.totals.numberOfPvActiveDays} / ${formulaAdvice.totals.numberOfDays}` : '-'}</td></tr>
        </tbody></table>
      </div>
    </section>

    <section class="grid two">
      <div class="card">
        <h2 class="section-title">Impact voor en na batterij</h2>
        <p class="section-intro">Een compacte vergelijking van import en export in de situatie zonder batterij en met de aanbevolen batterij.</p>
        <div id="pv-impact-chart" class="plot"></div>
        <div class="muted">X-as: import en export vóór en na de aanbevolen batterij. Y-as: energie in kWh.</div>
        <div class="callout">Deze vergelijking laat direct zien hoeveel netafname en teruglevering de aanbevolen batterij in de simulatie verschuift.</div>
      </div>
      <div class="card">
        <h2 class="section-title">Aannames en aandachtspunten</h2>
        <p class="section-intro">Deze uitgangspunten helpen om het advies goed te plaatsen bij offerte, techniek en implementatie.</p>
        <table><tbody>
          <tr><th>Rijen</th><td>${payload.quality.rows}</td></tr>
          <tr><th>Datumbereik</th><td>${payload.quality.startDate ?? '-'} t/m ${payload.quality.endDate ?? '-'}</td></tr>
          <tr><th>Ontbrekende intervallen</th><td>${payload.quality.missingIntervalsCount}</td></tr>
          <tr><th>Duplicaten</th><td>${payload.quality.duplicateCount}</td></tr>
          <tr><th>Niet-15-min overgangen</th><td>${payload.quality.non15MinIntervals}</td></tr>
          <tr><th>PV-actieve dagen</th><td>${formulaAdvice ? `${formulaAdvice.totals.numberOfPvActiveDays} / ${formulaAdvice.totals.numberOfDays}` : '-'}</td></tr>
        </tbody></table>
      </div>
    </section>

    ${
      isFinancialReport && pricingMode === 'dynamic'
        ? `<section class="grid two">
      <div class="card">
        <h2 class="section-title">Financiele impact per batterijgrootte</h2>
        <div id="pv-annual-value-chart" class="plot"></div>
        <div class="muted">X-as: batterijgrootte in kWh. Y-as: jaarlijkse waarde in euro.</div>
        <div class="callout">Hier zie je hoe de jaarlijkse waarde verandert per batterijgrootte op basis van gekoppelde dynamische prijzen.</div>
      </div>
      <div class="card">
        <h2 class="section-title">Kosten voor en na aanbevolen batterij</h2>
        <div id="pv-cost-chart" class="plot"></div>
        <div class="muted">X-as: kosten zonder batterij, met batterij en netto waarde. Y-as: euro.</div>
        <div class="callout">Deze vergelijking laat zien wat de aanbevolen batterij financieel verandert over de geanalyseerde periode.</div>
      </div>
    </section>

    <section class="grid two">
      <div class="card">
        <h2 class="section-title">Waarde per maand</h2>
        <div id="pv-monthly-value-chart" class="plot"></div>
        <div class="muted">X-as: maand. Linker Y-as: kosten in euro. Rechter Y-as: netto waarde in euro.</div>
        <div class="callout">Zo wordt zichtbaar in welke maanden de batterij financieel de meeste waarde toevoegt.</div>
      </div>
      <div class="card">
        <h2 class="section-title">Voorbeelddag: prijs en batterij-SOC</h2>
        <div id="pv-price-soc-chart" class="plot"></div>
        <div class="muted">X-as: kwartieren binnen een representatieve dag. Linker Y-as: prijs in EUR/kWh. Rechter Y-as: batterijlading in kWh.</div>
        <div class="callout">Deze grafiek combineert prijsniveaus met batterijlading op een representatieve dag, zonder actieve netstroomhandel.</div>
      </div>
    </section>`
        : ''
    }

    <section class="grid two">
      <div class="card">
        <h2 class="section-title">Voorbeelddag met batterij-SOC</h2>
        <p class="section-intro">De voorbeelddag laat zien hoe de batterij in de simulatie laadt en ontlaadt binnen het profiel.</p>
        <div id="pv-example-day-chart" class="plot"></div>
        <div class="muted">X-as: kwartieren binnen een representatieve dag. Linker Y-as: import en export in kWh per kwartier. Rechter Y-as: batterijlading in kWh.</div>
        <div class="callout">Deze grafiek laat zien hoe de aanbevolen batterij overdag laadt op zonne-overschot en later ontlaadt om eigen verbruik te ondersteunen.</div>
      </div>
      <div class="card">
        <h2 class="section-title">Conclusie en advies</h2>
        <table><tbody>
          <tr><th>Aanbevolen batterij</th><td>${payload.sizing.recommendedProduct?.label ?? 'Geen haalbare configuratie'}</td></tr>
          <tr><th>Waarom gekozen</th><td>${recommendedScenario?.recommendationReason ?? 'Beste balans tussen praktische opslag, benutting en waarde.'}</td></tr>
          <tr><th>Waarom groter niet altijd beter is</th><td>De meeropbrengst per extra kWh batterijcapaciteit vlakt af. Daardoor leveren grotere batterijen relatief minder extra importreductie en benutting op.</td></tr>
          <tr><th>Zelfstandig te begrijpen</th><td>Dit rapport combineert de formulematige basis met kwartiersimulatie, zodat een klant zonder applicatie kan volgen waarom de aanbevolen batterij is gekozen.</td></tr>
        </tbody></table>
        ${(hybridAdvice?.warnings.length ?? 0) > 0 ? `<div class="callout">${hybridAdvice?.warnings.join('<br />')}</div>` : ''}
      </div>
    </section>

    <section class="card">
      <h2 class="section-title">Vervolgstappen</h2>
      <p class="section-intro">Na akkoord op de richting van het advies volgen de technische en commerciele controles richting realisatie.</p>
      <div class="steps">
        <div class="step"><div class="step-number">1</div><div class="step-title">Controle netaansluiting</div></div>
        <div class="step"><div class="step-number">2</div><div class="step-title">Controle omvormer en EMS-integratie</div></div>
        <div class="step"><div class="step-number">3</div><div class="step-title">Bevestigen tariefstructuur en businesscase</div></div>
        <div class="step"><div class="step-number">4</div><div class="step-title">Definitieve offerte</div></div>
        <div class="step"><div class="step-number">5</div><div class="step-title">Installatieplanning</div></div>
        <div class="step"><div class="step-number">6</div><div class="step-title">Monitoring na oplevering</div></div>
      </div>
    </section>

    <footer class="footer">
      <div>WattsNext Energieoplossingen</div>
      <div>${isFinancialReport ? 'Financieel PV self-consumption rapport' : 'PV self-consumption rapport'}</div>
    </footer>
  </div>

  <script>
    const scenarioData = ${safeJson(scenarioChartData)};
    const pvCharts = ${safeJson(pvCharts)};
    const impactBeforeAfter = ${safeJson(impactBeforeAfter)};
    const annualValueBreakdownRows = ${safeJson(annualValueBreakdownRows)};
    const wattsTheme = { paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: '#FFFFFF', font: { family: 'Inter, Arial, Calibri, sans-serif', color: '#232323' }, margin: { t: 12, r: 12, b: 70, l: 55 } };

    if (pvCharts?.dailyStorageChart?.length) {
      const dailyStorageTraces = [
        { type: 'bar', name: 'Dagelijkse opslagbehoefte', x: pvCharts.dailyStorageChart.map(d => d.date), y: pvCharts.dailyStorageChart.map(d => d.dailyStorageNeedKwh), marker: { color: '#4E8D3E' } },
        { type: 'scatter', mode: 'lines', name: 'P50', x: pvCharts.dailyStorageChart.map(d => d.date), y: pvCharts.dailyStorageChart.map(d => d.p50), line: { color: '#7A7F78', dash: 'dot' } },
        { type: 'scatter', mode: 'lines', name: 'P75', x: pvCharts.dailyStorageChart.map(d => d.date), y: pvCharts.dailyStorageChart.map(d => d.p75), line: { color: '#2F5F33', dash: 'dot' } },
        { type: 'scatter', mode: 'lines', name: 'P90', x: pvCharts.dailyStorageChart.map(d => d.date), y: pvCharts.dailyStorageChart.map(d => d.p90), line: { color: '#F5B83D', dash: 'dot' } }
      ];
      Plotly.newPlot('pv-daily-storage-chart', dailyStorageTraces, { ...wattsTheme, barmode: 'group', xaxis: { tickangle: -20 }, yaxis: { title: 'kWh per dag' } }, { responsive: true, displaylogo: false });
    }

    if (pvCharts?.exportVsNightImportChart?.length) {
      Plotly.newPlot('pv-export-night-chart', [
        { type: 'bar', name: 'Teruglevering', x: pvCharts.exportVsNightImportChart.map(d => d.date), y: pvCharts.exportVsNightImportChart.map(d => d.dailyExportKwh), marker: { color: '#F5B83D' } },
        { type: 'bar', name: 'Avond/nachtverbruik', x: pvCharts.exportVsNightImportChart.map(d => d.date), y: pvCharts.exportVsNightImportChart.map(d => d.eveningNightImportKwh), marker: { color: '#4E8D3E' } },
        { type: 'scatter', mode: 'lines', name: 'Praktische opslagbehoefte', x: pvCharts.exportVsNightImportChart.map(d => d.date), y: pvCharts.exportVsNightImportChart.map(d => d.dailyStorageNeedKwh), line: { color: '#2F5F33', width: 2 } }
      ], { ...wattsTheme, barmode: 'group', xaxis: { tickangle: -20, automargin: true }, yaxis: { title: 'kWh per dag', rangemode: 'tozero' }, legend: { orientation: 'h', x: 0, y: 1.16, xanchor: 'left', yanchor: 'bottom' }, margin: { t: 70, r: 18, b: 82, l: 58 } }, { responsive: true, displaylogo: false });
    }

    const formatKwhYear = value => Math.round(value).toLocaleString('nl-NL') + ' kWh/jaar';
    const formatEurYear = value => 'EUR ' + Math.round(value).toLocaleString('nl-NL') + '/jaar';
    const hasEconomicValue = scenarioData.some(d => Math.abs(d.economicValue ?? 0) >= 0.01);
    const scenarioX = scenarioData.map(d => d.chartLabel);
    const scenarioHover = scenarioData.map(d => [
      d.optionLabel,
      d.isRecommended ? 'Aanbevolen advies' : 'Scenario',
      Math.round(d.powerKw).toLocaleString('nl-NL') + ' kW'
    ]);
    const scenarioComparisonTraces = [
      {
        type: 'bar',
        name: 'Importreductie',
        x: scenarioX,
        y: scenarioData.map(d => d.importReductionKwhAnnualized),
        text: scenarioData.map(d => d.isRecommended ? 'Aanbevolen' : ''),
        textposition: 'inside',
        insidetextanchor: 'middle',
        textfont: { size: 10, color: '#0f172a' },
        cliponaxis: false,
        marker: {
          color: scenarioData.map(d => d.isRecommended ? '#4E8D3E' : '#CFE4C8'),
          line: { color: scenarioData.map(d => d.isRecommended ? '#2F5F33' : '#4E8D3E'), width: scenarioData.map(d => d.isRecommended ? 3 : 1) }
        },
        customdata: scenarioData.map((d, index) => [...scenarioHover[index], formatKwhYear(d.importReductionKwhAnnualized)]),
        hovertemplate: '<b>%{customdata[0]}</b><br>%{customdata[1]}<br>Vermogen: %{customdata[2]}<br>Importreductie: %{customdata[3]}<extra></extra>'
      },
      {
        type: 'bar',
        name: 'Exportreductie',
        x: scenarioX,
        y: scenarioData.map(d => d.exportReductionKwhAnnualized),
        text: scenarioData.map(d => d.isRecommended ? 'Aanbevolen' : ''),
        textposition: 'inside',
        insidetextanchor: 'middle',
        textfont: { size: 10, color: '#0f172a' },
        cliponaxis: false,
        marker: {
          color: scenarioData.map(d => d.isRecommended ? '#F5B83D' : '#F8E7B8'),
          line: { color: scenarioData.map(d => d.isRecommended ? '#8A641C' : '#F5B83D'), width: scenarioData.map(d => d.isRecommended ? 3 : 1) }
        },
        customdata: scenarioData.map((d, index) => [...scenarioHover[index], formatKwhYear(d.exportReductionKwhAnnualized)]),
        hovertemplate: '<b>%{customdata[0]}</b><br>%{customdata[1]}<br>Vermogen: %{customdata[2]}<br>Exportreductie: %{customdata[3]}<extra></extra>'
      }
    ];
    if (hasEconomicValue) {
      scenarioComparisonTraces.push({
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Jaarlijkse waarde',
        x: scenarioX,
        y: scenarioData.map(d => d.economicValue),
        yaxis: 'y2',
        text: scenarioData.map(d => formatEurYear(d.economicValue)),
        customdata: scenarioHover,
        marker: { color: scenarioData.map(d => d.isRecommended ? '#2F5F33' : '#A7C9A0'), size: scenarioData.map(d => d.isRecommended ? 11 : 7) },
        line: { color: '#2F5F33', width: 2 },
        hovertemplate: '<b>%{customdata[0]}</b><br>%{customdata[1]}<br>Jaarlijkse waarde: %{text}<extra></extra>'
      });
    }
    Plotly.newPlot(
      'pv-scenario-comparison-chart',
      scenarioComparisonTraces,
      {
        ...wattsTheme,
        barmode: 'group',
        xaxis: { tickangle: -45, title: 'Batterijopties', automargin: true, tickfont: { size: 9 } },
        yaxis: { title: 'Reductie (kWh/jaar)', tickformat: ',.0f', rangemode: 'tozero' },
        ...(hasEconomicValue ? { yaxis2: { title: 'EUR/jaar', overlaying: 'y', side: 'right', tickformat: ',.0f' } } : {}),
        margin: { t: 30, r: hasEconomicValue ? 58 : 18, b: 115, l: 70 },
        hoverlabel: { align: 'left' }
      },
      { responsive: true, displaylogo: false }
    );

    if (document.getElementById('pv-value-breakdown-chart') && annualValueBreakdownRows.length) {
      Plotly.newPlot('pv-value-breakdown-chart', [{
        type: 'bar',
        x: annualValueBreakdownRows.map(d => d.label),
        y: annualValueBreakdownRows.map(d => d.value),
        marker: {
          color: annualValueBreakdownRows.map((d, index) =>
            index === annualValueBreakdownRows.length - 1 ? '#2F5F33' : d.value >= 0 ? '#4E8D3E' : '#F5B83D'
          )
        },
        text: annualValueBreakdownRows.map(d => (d.value < 0 ? '-' : '') + 'EUR ' + Math.abs(d.value).toFixed(0)),
        textposition: 'outside',
        cliponaxis: false,
        customdata: annualValueBreakdownRows.map(d => d.explanation),
        hovertemplate: '<b>%{x}</b><br>%{text}<br>%{customdata}<extra></extra>'
      }], {
        ...wattsTheme,
        xaxis: { tickangle: -25, automargin: true },
        yaxis: { title: 'EUR', zeroline: true, zerolinecolor: '#64748b' },
        margin: { t: 30, r: 18, b: 105, l: 58 }
      }, { responsive: true, displaylogo: false });
    }

    if (document.getElementById('pv-marginal-gain-chart') && pvCharts?.marginalGainChart?.length) {
      Plotly.newPlot('pv-marginal-gain-chart', [
        { type: 'bar', name: 'Gedekte opslag / extra effect', x: pvCharts.marginalGainChart.map(d => d.capacityKwh), y: pvCharts.marginalGainChart.map(d => d.coveredStorageKwhPerYear), marker: { color: '#0ea5e9' } },
        { type: 'scatter', mode: 'lines+markers', name: 'Marginal gain per extra kWh', x: pvCharts.marginalGainChart.map(d => d.capacityKwh), y: pvCharts.marginalGainChart.map(d => d.marginalGainPerAddedKwh), yaxis: 'y2', line: { color: '#f97316' } }
      ], { ...wattsTheme, xaxis: { title: 'Batterijcapaciteit (kWh)' }, yaxis: { title: 'kWh per jaar' }, yaxis2: { title: 'Marginale gain', overlaying: 'y', side: 'right' }, margin: { t: 30, r: 50, b: 70, l: 55 } }, { responsive: true, displaylogo: false });
    }

    if (document.getElementById('pv-coverage-chart') && pvCharts?.coverageByCapacityChart?.length) {
      const recommendedCapacityKwh = ${safeJson(recommendedScenario?.capacityKwh ?? payload.sizing.recommendedProduct?.capacityKwh ?? null)};
      const coverageData = pvCharts.coverageByCapacityChart.map(d => ({
        ...d,
        chartLabel: Math.round(d.capacityKwh).toLocaleString('nl-NL') + ' kWh',
        isRecommended: recommendedCapacityKwh != null && d.capacityKwh === recommendedCapacityKwh
      }));
      const coverageX = coverageData.map(d => d.chartLabel);
      const coverageHover = coverageData.map(d => [
        d.chartLabel,
        d.isRecommended ? 'Aanbevolen advies' : 'Scenario',
        d.fullyCoveredDaysPercentage.toFixed(1) + '%',
        d.averageCoveragePercentage.toFixed(1) + '%'
      ]);
      Plotly.newPlot('pv-coverage-chart', [
        {
          type: 'bar',
          name: 'Volledig gedekte dagen',
          x: coverageX,
          y: coverageData.map(d => d.fullyCoveredDaysPercentage),
          text: coverageData.map(d => d.isRecommended ? 'Aanbevolen' : ''),
          textposition: 'inside',
          insidetextanchor: 'middle',
          textfont: { size: 10, color: '#0f172a' },
          marker: {
            color: coverageData.map(d => d.isRecommended ? '#16a34a' : '#86efac'),
            line: { color: coverageData.map(d => d.isRecommended ? '#14532d' : '#22c55e'), width: coverageData.map(d => d.isRecommended ? 3 : 1) }
          },
          customdata: coverageHover,
          hovertemplate: '<b>%{customdata[0]}</b><br>%{customdata[1]}<br>Volledig gedekte dagen: %{customdata[2]}<br>Gemiddelde dekking: %{customdata[3]}<extra></extra>'
        },
        {
          type: 'scatter',
          mode: 'lines+markers',
          name: 'Gemiddelde dekking',
          x: coverageX,
          y: coverageData.map(d => d.averageCoveragePercentage),
          marker: { color: coverageData.map(d => d.isRecommended ? '#1d4ed8' : '#93c5fd'), size: coverageData.map(d => d.isRecommended ? 11 : 7) },
          line: { color: '#2563eb', width: 2 },
          customdata: coverageHover,
          hovertemplate: '<b>%{customdata[0]}</b><br>%{customdata[1]}<br>Gemiddelde dekking: %{customdata[3]}<br>Volledig gedekte dagen: %{customdata[2]}<extra></extra>'
        }
      ], {
        ...wattsTheme,
        xaxis: { title: 'Batterijcapaciteit (kWh)', tickangle: -45, automargin: true, tickfont: { size: 9 } },
        yaxis: { title: 'Dekking (%)', range: [0, 105], ticksuffix: '%' },
        legend: { orientation: 'h', x: 0, y: 1.18, xanchor: 'left', yanchor: 'bottom', bgcolor: 'rgba(255,255,255,0.85)' },
        margin: { t: 72, r: 20, b: 112, l: 58 },
        hoverlabel: { align: 'left' }
      }, { responsive: true, displaylogo: false });
    }

    if (document.getElementById('pv-impact-chart') && impactBeforeAfter.length) {
      Plotly.newPlot('pv-impact-chart', [{ type: 'bar', x: impactBeforeAfter.map(d => d.label), y: impactBeforeAfter.map(d => d.value), marker: { color: ['#7A7F78', '#4E8D3E', '#F5B83D', '#2F5F33'] } }], { ...wattsTheme, xaxis: { tickangle: -10 }, yaxis: { title: 'kWh' } }, { responsive: true, displaylogo: false });
    }

    if (pvCharts?.annualValueByCapacityChart?.length) {
      Plotly.newPlot('pv-annual-value-chart', [
        { type: 'bar', x: pvCharts.annualValueByCapacityChart.map(d => d.capacityKwh), y: pvCharts.annualValueByCapacityChart.map(d => d.annualValueEur), marker: { color: '#2563eb' }, name: 'Jaarlijkse waarde' }
      ], { ...wattsTheme, xaxis: { title: 'Batterijcapaciteit (kWh)' }, yaxis: { title: 'EUR per jaar' } }, { responsive: true, displaylogo: false });
    }

    if (pvCharts?.importExportCostChart?.length) {
      Plotly.newPlot('pv-cost-chart', [
        { type: 'bar', x: pvCharts.importExportCostChart.map(d => d.label), y: pvCharts.importExportCostChart.map(d => d.costEur), marker: { color: ['#94a3b8', '#16a34a', '#2563eb'] } }
      ], { ...wattsTheme, xaxis: { tickangle: -10 }, yaxis: { title: 'EUR' } }, { responsive: true, displaylogo: false });
    }

    if (pvCharts?.monthlyValueChart?.length) {
      Plotly.newPlot('pv-monthly-value-chart', [
        { type: 'bar', name: 'Kosten zonder batterij', x: pvCharts.monthlyValueChart.map(d => d.month), y: pvCharts.monthlyValueChart.map(d => d.baselineCostEur), marker: { color: '#94a3b8' } },
        { type: 'bar', name: 'Kosten met batterij', x: pvCharts.monthlyValueChart.map(d => d.month), y: pvCharts.monthlyValueChart.map(d => d.batteryCostEur), marker: { color: '#16a34a' } },
        { type: 'scatter', mode: 'lines+markers', name: 'Netto waarde', x: pvCharts.monthlyValueChart.map(d => d.month), y: pvCharts.monthlyValueChart.map(d => d.valueEur), yaxis: 'y2', line: { color: '#2563eb' } }
      ], { ...wattsTheme, barmode: 'group', xaxis: { title: 'Maand' }, yaxis: { title: 'Kosten (EUR)' }, yaxis2: { title: 'Waarde (EUR)', overlaying: 'y', side: 'right' }, margin: { t: 30, r: 50, b: 70, l: 55 } }, { responsive: true, displaylogo: false });
    }

    if (pvCharts?.exampleDayChart?.length) {
      Plotly.newPlot('pv-example-day-chart', [
        { type: 'bar', name: 'Export', x: pvCharts.exampleDayChart.map(d => d.timestamp), y: pvCharts.exampleDayChart.map(d => d.exportKwh), marker: { color: '#f59e0b' } },
        { type: 'bar', name: 'Import', x: pvCharts.exampleDayChart.map(d => d.timestamp), y: pvCharts.exampleDayChart.map(d => d.importKwh), marker: { color: '#22c55e' } },
        { type: 'scatter', mode: 'lines', name: 'Batterij-SOC', x: pvCharts.exampleDayChart.map(d => d.timestamp), y: pvCharts.exampleDayChart.map(d => d.batterySocKwh), yaxis: 'y2', line: { color: '#2563eb' } }
      ], { ...wattsTheme, barmode: 'group', xaxis: { tickangle: -20, title: 'Kwartieren binnen de dag' }, yaxis: { title: 'Import/export (kWh per kwartier)' }, yaxis2: { title: 'Batterij-SOC (kWh)', overlaying: 'y', side: 'right' }, margin: { t: 30, r: 50, b: 90, l: 55 } }, { responsive: true, displaylogo: false });
    }

    if (pvCharts?.exampleDayChart?.some(d => d.importPriceEurPerKwh != null || d.exportPriceEurPerKwh != null)) {
      Plotly.newPlot('pv-price-soc-chart', [
        { type: 'scatter', mode: 'lines', name: 'Importprijs', x: pvCharts.exampleDayChart.map(d => d.timestamp), y: pvCharts.exampleDayChart.map(d => d.importPriceEurPerKwh ?? null), line: { color: '#dc2626' } },
        { type: 'scatter', mode: 'lines', name: 'Exportprijs', x: pvCharts.exampleDayChart.map(d => d.timestamp), y: pvCharts.exampleDayChart.map(d => d.exportPriceEurPerKwh ?? null), line: { color: '#f59e0b' } },
        { type: 'scatter', mode: 'lines', name: 'Batterij-SOC', x: pvCharts.exampleDayChart.map(d => d.timestamp), y: pvCharts.exampleDayChart.map(d => d.batterySocKwh), yaxis: 'y2', line: { color: '#2563eb' } }
      ], { ...wattsTheme, xaxis: { tickangle: -20, title: 'Kwartieren binnen de dag' }, yaxis: { title: 'EUR/kWh' }, yaxis2: { title: 'Batterij-SOC (kWh)', overlaying: 'y', side: 'right' }, margin: { t: 30, r: 50, b: 90, l: 55 } }, { responsive: true, displaylogo: false });
    }
  </script>
</body>
</html>`;
}

void generatePvInteractiveReportHtml;

export function generateInteractiveReportHtml(payload: PdfPayload): string {
  if (payload.analysisType === 'PV_SELF_CONSUMPTION') {
    return generatePvInteractiveReportHtmlV2(payload);
  }

  const embeddedLogoSrc = getEmbeddedLogoSrc();
  const brochure = getRecommendedBrochureInfo(payload);
  const gridAfterComplianceKwh = payload.sizing.kWhNeededRaw;
  const gridBeforeComplianceKwh =
    payload.compliance > 0 ? gridAfterComplianceKwh / payload.compliance : gridAfterComplianceKwh;
  const batteryBeforeSafetyKwh =
    payload.efficiency > 0 ? gridAfterComplianceKwh / payload.efficiency : payload.sizing.kWhNeeded;
  const sizingBreakdown = [
    { step: 'Netbasis', value: Math.max(0, gridBeforeComplianceKwh) },
    { step: 'Na compliance', value: Math.max(0, gridAfterComplianceKwh) },
    { step: 'Na efficiëntie', value: Math.max(0, batteryBeforeSafetyKwh) },
    { step: 'Eindwaarde (buffer)', value: Math.max(0, payload.sizing.kWhNeeded) }
  ];

  const displayScenarios = orderScenariosForRecommendationDisplay(
    payload.scenarios,
    payload.sizing.recommendedProduct?.capacityKwh,
    5
  );
  const recommendedScenarioIndex = displayScenarios.findIndex(
    (scenario) => scenario.capacityKwh === payload.sizing.recommendedProduct?.capacityKwh
  );
  const scenarioChartData = displayScenarios.map((scenario, index) => {
    const isRecommended = index === recommendedScenarioIndex;
    const comparisonLabel =
      recommendedScenarioIndex >= 0
        ? index < recommendedScenarioIndex
          ? `Te klein ${recommendedScenarioIndex - index}`
          : index > recommendedScenarioIndex
            ? `Groter ${index - recommendedScenarioIndex}`
            : 'Aanbevolen'
        : `Optie ${index + 1}`;

    return {
      optionLabel: scenario.optionLabel,
      chartLabel: `${comparisonLabel}<br>${scenario.optionLabel}`,
      comparisonLabel,
      isRecommended,
      before: scenario.exceedanceEnergyKwhBefore,
      after: scenario.exceedanceEnergyKwhAfter,
      reductionKwh: Math.max(0, scenario.exceedanceEnergyKwhBefore - scenario.exceedanceEnergyKwhAfter),
      reductionPct:
        scenario.exceedanceEnergyKwhBefore > 0
          ? (1 - scenario.exceedanceEnergyKwhAfter / scenario.exceedanceEnergyKwhBefore) * 100
          : 0,
      remainingPct:
        scenario.exceedanceEnergyKwhBefore > 0
          ? (scenario.exceedanceEnergyKwhAfter / scenario.exceedanceEnergyKwhBefore) * 100
          : 0,
      compliance: scenario.achievedComplianceDataset * 100,
      remainingKw: scenario.maxRemainingExcessKw
    };
  });

  const peakEventsTable = payload.topEvents.map((event) => ({
    peakTimestamp: formatTimestamp(event.peakTimestamp),
    durationIntervals: event.durationIntervals,
    maxExcessKw: event.maxExcessKw.toFixed(2),
    totalExcessKwh: event.totalExcessKwh.toFixed(2)
  }));

  const kpiCards = [
    ['Gecontracteerd vermogen', `${payload.contractedPowerKw.toFixed(2)} kW`],
    ['Maximaal gemeten', `${payload.maxObservedKw.toFixed(2)} kW`],
    ['Overschrijdingsintervallen', String(payload.exceedanceCount)],
    ['Benodigde sizing', `${payload.sizing.kWhNeeded.toFixed(2)} kWh / ${payload.sizing.kWNeeded.toFixed(2)} kW`],
    ['Aanbevolen', payload.sizing.recommendedProduct?.label ?? 'Geen haalbare batterij op basis van kW + kWh']
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

  const bins = 12;
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
  const moments250Plus = intervals.filter((item) => (item.consumptionKw ?? 0) >= 250).length;
  const momentsAboveContract = intervals.filter((item) => (item.consumptionKw ?? 0) > payload.contractedPowerKw).length;

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
  <title>WattsNext Peak Shaving Rapport</title>
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
      right: 20px;
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
      grid-template-columns: 230px 1fr auto;
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
      width: 220px;
      min-height: 52px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 6px 8px;
      margin-left: -6px;
      border: 1px solid #5f8e52;
      border-radius: 10px;
      background:
        linear-gradient(135deg, #2f5f33 0%, #3b7a3c 58%, #5a9b4a 100%);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
    }
    .logoWrap img {
      max-width: 204px;
      max-height: 52px;
      width: auto;
      height: auto;
      object-fit: contain;
      display: block;
      filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.35));
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
      .logoWrap { width: 170px; }
      .logoWrap img { max-width: 154px; }
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
        <h1>Peak Shaving Rapport</h1>
        <p>ENERGIEOPLOSSINGEN</p>
      </div>
      <div class="stamp">
        <div class="pill">Peak Shaving Rapport</div>
        <div style="margin-top:8px;">Methode: ${payload.method}</div>
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
            : `<div class="callout"><p class="callout-title">Productsheet niet gevonden</p><p class="callout-body">Verwacht in assets: 64.pdf / 96.pdf / 232.pdf / 261.pdf / 2090.pdf / 5015.pdf (of .jpg) op basis van de aanbevolen batterij.</p></div>`
        }
        ${brochure ? `<div class="muted" style="margin-top:8px;">Gekoppelde brochure: ${brochure.key}</div>` : ''}
      </div>
    </section>

    <section class="grid two">
      <div class="card">
        <h3>Overschrijdingsenergie voor/na per batterijoptie</h3>
        <div id="exceedance-chart" class="plot"></div>
        <div id="exceedance-baseline-note" class="muted" style="margin-top:6px;"></div>
        <table style="margin-top:12px;">
          <thead>
            <tr>
              <th>Optie</th>
              <th>Rol</th>
              <th>Voor kWh</th>
              <th>Na kWh</th>
              <th>Reductie kWh</th>
              <th>Reductie</th>
              <th>Rest</th>
              <th>Rest max kW</th>
            </tr>
          </thead>
          <tbody id="exceedance-simulation-body"></tbody>
        </table>
        <div class="callout">
          <p class="callout-title">Uitleg</p>
          <p class="callout-body">De grafiek vergelijkt vijf simulaties: twee te kleine opties, het aanbevolen advies in het midden en twee grotere opties. Oranje is de overschrijdingsenergie voor implementatie; blauw/groen is de resterende overschrijding na implementatie.</p>
        </div>
      </div>
      <div class="card">
        <h3>Dimensioneringsopbouw (kWh)</h3>
        <div id="sizing-chart" class="plot short"></div>
        <div class="callout">
          <p class="callout-title">Uitleg</p>
          <p class="callout-body">Hier ziet u hoe de benodigde batterijcapaciteit wordt opgebouwd uit netzijde-energie, efficiencyverlies en veiligheidsbuffer.</p>
        </div>
      </div>
    </section>

    <section class="grid two">
      <div class="card">
        <h3>Profiel hoogste piekdag</h3>
        <div id="highest-peak-chart" class="plot"></div>
        <div class="muted">Blauw = gemeten verbruik, groen = contractlijn, rood = overschrijding boven contract (kW), oranje markers = piekmomenten.</div>
      </div>
      <div class="card">
        <h3>Verbruikshistogram</h3>
        <div id="histogram-chart" class="plot"></div>
        <div class="muted" style="margin-top:6px;">
          Kwartieren ≥ 250 kW: <strong>${moments250Plus}</strong> | Kwartieren boven contract: <strong>${momentsAboveContract}</strong>
        </div>
        <div class="muted">Verdeling van kwartierverbruik. Groen = ruim onder contract, oranje = dichtbij contract, rood = boven contract.</div>
      </div>
    </section>

    <section class="grid two">
      <div class="card">
        <h3>Alle piekmomenten</h3>
        <table>
          <thead>
            <tr>
              <th>Piektijdstip</th>
              <th>Verbruik kW</th>
              <th>Overschrijding kW</th>
              <th>Overschrijding kWh</th>
            </tr>
          </thead>
          <tbody id="peak-moments-body"></tbody>
        </table>
      </div>
      <div class="card">
        <h3>Datakwaliteit & aannames</h3>
        <table>
          <tbody>
            <tr><th>Rijen</th><td>${payload.quality.rows}</td></tr>
            <tr><th>Datumbereik</th><td>${payload.quality.startDate ?? '-'} t/m ${payload.quality.endDate ?? '-'}</td></tr>
            <tr><th>Ontbrekende intervallen</th><td>${payload.quality.missingIntervalsCount}</td></tr>
            <tr><th>Duplicaten</th><td>${payload.quality.duplicateCount}</td></tr>
            <tr><th>Niet-15-min overgangen</th><td>${payload.quality.non15MinIntervals}</td></tr>
            <tr><th>Tijdstip maximaal gemeten</th><td>${payload.maxObservedTimestamp ? formatTimestamp(payload.maxObservedTimestamp) : '-'}</td></tr>
            <tr><th>Efficiëntie</th><td>${(payload.efficiency * 100).toFixed(0)}%</td></tr>
            <tr><th>Veiligheidsfactor</th><td>${payload.safetyFactor.toFixed(2)}x</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card" style="margin-top:16px;">
      <h3>Piekgebeurtenissen (geclusterd)</h3>
      <table>
        <thead>
          <tr>
            <th>Piektijdstip</th>
            <th>Duur (x15m)</th>
            <th>Max overschrijding kW</th>
            <th>Totale overschrijding kWh</th>
          </tr>
        </thead>
        <tbody id="peak-events-body"></tbody>
      </table>
    </section>

    <footer class="footer">
      <div>WattsNext Energieoplossingen</div>
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

    const recommendedScenario = scenarioData.find(d => d.isRecommended) ?? scenarioData[0] ?? {
      optionLabel: 'Aanbevolen oplossing',
      chartLabel: 'Aanbevolen oplossing',
      comparisonLabel: 'Aanbevolen',
      before: 0,
      after: 0,
      reductionKwh: 0,
      reductionPct: 0,
      remainingPct: 0,
      remainingKw: 0
    };
    Plotly.newPlot('exceedance-chart', [
    {
      type: 'bar',
      name: 'Voor implementatie',
      x: scenarioData.map(d => d.chartLabel),
      y: scenarioData.map(d => d.before),
      marker: {color: '#F59E0B'},
      text: scenarioData.map(d => d.before.toFixed(2) + ' kWh'),
      textposition: 'outside',
      cliponaxis: false,
      customdata: scenarioData.map(d => [d.optionLabel, d.comparisonLabel]),
      hovertemplate: '%{customdata[1]}<br>%{customdata[0]}<br>Voor: %{y:.2f} kWh<extra></extra>'
    },
    {
      type: 'bar',
      name: 'Na implementatie',
      x: scenarioData.map(d => d.chartLabel),
      y: scenarioData.map(d => d.after),
      marker: {color: scenarioData.map(d => d.isRecommended ? '#22C55E' : '#2563EB')},
      text: scenarioData.map(d => d.after.toFixed(2) + ' kWh'),
      textposition: 'outside',
      cliponaxis: false,
      customdata: scenarioData.map(d => [d.optionLabel, d.comparisonLabel, d.reductionKwh, d.reductionPct, d.remainingPct]),
      hovertemplate:
        '%{customdata[1]}<br>%{customdata[0]}<br>Na: %{y:.2f} kWh<br>Reductie: %{customdata[2]:.2f} kWh (%{customdata[3]:.1f}%)<br>Rest: %{customdata[4]:.2f}%<extra></extra>'
    }], {
      ...wattsTheme,
      barmode: 'group',
      hovermode: 'x unified',
      annotations: [{
        xref: 'paper',
        x: 1,
        y: recommendedScenario.before,
        xanchor: 'right',
        yanchor: 'bottom',
        text: 'Voor implementatie: ' + recommendedScenario.before.toFixed(2) + ' kWh',
        showarrow: false,
        font: {size: 11, color: '#92400E'}
      }],
      xaxis: {tickangle: 0, automargin: true},
      yaxis: {title: 'Overschrijdingsenergie kWh', rangemode: 'tozero'},
      legend: {orientation: 'h', y: 1.12, x: 0},
      margin: {t: 58, r: 24, b: 95, l: 70}
    }, {responsive: true, displaylogo: false});

    const exceedanceSimulationBody = document.getElementById('exceedance-simulation-body');
    if (exceedanceSimulationBody) {
      exceedanceSimulationBody.innerHTML = scenarioData.map(d => (
        '<tr' + (d.isRecommended ? ' style="background:#ECFDF5;font-weight:600;"' : '') + '>' +
        '<td>' + d.optionLabel + '</td>' +
        '<td>' + d.comparisonLabel + '</td>' +
        '<td>' + d.before.toFixed(2) + '</td>' +
        '<td>' + d.after.toFixed(2) + '</td>' +
        '<td>' + d.reductionKwh.toFixed(2) + '</td>' +
        '<td>' + d.reductionPct.toFixed(1) + '%</td>' +
        '<td>' + d.remainingPct.toFixed(2) + '%</td>' +
        '<td>' + d.remainingKw.toFixed(2) + '</td>' +
        '</tr>'
      )).join('');
    }

    const beforeBaseline = recommendedScenario.before;
    const exceedanceIntervalsCount = peakMoments.length;
    const baselineNote = document.getElementById('exceedance-baseline-note');
    if (baselineNote) {
      baselineNote.textContent =
        'Voor is opgebouwd uit ' +
        exceedanceIntervalsCount +
        ' overschrijdingsintervallen: totaal ' +
        beforeBaseline.toFixed(2) +
        ' kWh.';
    }

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

    const profileTimes = dayProfile.map(d => d.timeLabel);
    const profileIndex = dayProfile.map((_, index) => index);
    const profileConsumption = dayProfile.map(d => d.consumptionKw);
    const profileContract = dayProfile.map(d => d.contractKw);
    const profileExcess = dayProfile.map(d => Math.max(0, d.consumptionKw - d.contractKw));
    const tickStep = 8; // 8 x 15 min = elke 2 uur label
    const xTickVals = profileIndex.filter((index) => index % tickStep === 0);
    const xTickText = xTickVals.map((index) => profileTimes[index]);
    const peakIndices = dayProfile
      .map((d, index) => ({ ...d, index }))
      .filter((d) => d.isPeakMoment)
      .map((d) => d.index);
    const peakTimes = peakIndices.map((index) => profileTimes[index]);
    const peakValues = peakIndices.map((index) => profileConsumption[index]);

    Plotly.newPlot('highest-peak-chart', [
      {
        type: 'bar',
        name: 'Overschrijding boven contract (kW)',
        x: profileIndex,
        y: profileExcess,
        customdata: profileTimes,
        marker: {color: '#EF4444', opacity: 0.5},
        hovertemplate: '%{customdata}<br>Overschrijding: %{y:.2f} kW<extra></extra>'
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: 'Verbruik kW',
        x: profileIndex,
        y: profileConsumption,
        customdata: profileContract.map((contract, i) => [profileTimes[i], contract, profileExcess[i]]),
        line: {color: '#2563EB', width: 2.5},
        hovertemplate:
          '%{customdata[0]}<br>Verbruik: %{y:.2f} kW<br>Contract: %{customdata[1]:.2f} kW<br>Overschrijding: %{customdata[2]:.2f} kW<extra></extra>'
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: 'Contract kW',
        x: profileIndex,
        y: profileContract,
        customdata: profileTimes,
        line: {color: '#22C55E', width: 2.5, dash: 'dash'},
        hovertemplate: '%{customdata}<br>Contract: %{y:.2f} kW<extra></extra>'
      },
      {
        type: 'scatter',
        mode: 'markers',
        name: 'Piektijdstippen',
        x: peakIndices,
        y: peakValues,
        customdata: peakTimes,
        marker: {color: '#F97316', size: 6, symbol: 'diamond'},
        hovertemplate: '%{customdata}<br>Piekmoment: %{y:.2f} kW<extra></extra>'
      }
    ], {
      ...wattsTheme,
      barmode: 'overlay',
      hovermode: 'x unified',
      xaxis: {
        type: 'linear',
        tickmode: 'array',
        tickvals: xTickVals,
        ticktext: xTickText,
        tickangle: -20,
        showgrid: true,
        gridcolor: '#F1F5F9',
        showspikes: true,
        spikemode: 'across',
        spikesnap: 'cursor'
      },
      yaxis: {
        title: 'kW',
        showgrid: true,
        gridcolor: '#E5E7EB',
        rangemode: 'tozero'
      },
      legend: {orientation: 'h', y: 1.18},
      margin: {t: 22, r: 12, b: 92, l: 55}
    }, {responsive: true, displaylogo: false});

    Plotly.newPlot('histogram-chart', [{
      type: 'bar',
      x: histogram.map(d => d.label),
      y: histogram.map(d => d.count),
      marker: {color: histogram.map(d => d.color)},
      text: histogram.map(d => d.count),
      textposition: 'outside',
      cliponaxis: false,
      hovertemplate: 'Bereik: %{x}<br>Aantal kwartieren: %{y}<extra></extra>'
    }], {
      ...wattsTheme,
      bargap: 0.08,
      xaxis: {tickangle: -25, automargin: true},
      yaxis: {title: 'Aantal kwartieren', rangemode: 'tozero'},
      margin: {t: 18, r: 12, b: 82, l: 55}
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
