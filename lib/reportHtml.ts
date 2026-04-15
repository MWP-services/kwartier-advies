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

function generatePvInteractiveReportHtml(payload: PdfPayload): string {
  const embeddedLogoSrc = getEmbeddedLogoSrc();
  const brochure = getRecommendedBrochureInfo(payload);
  const pvSummary = payload.pvSummary ?? {
    mode: 'EXPORT_ONLY',
    strategy: payload.pvStrategy ?? 'SELF_CONSUMPTION_ONLY',
    warnings: ['PV total and self-consumption ratio cannot be calculated without pv_kwh input.'],
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
    exportBefore: scenario.exportedEnergyBeforeKwh ?? 0,
    exportAfter: scenario.exportedEnergyAfterKwh ?? 0,
    immediateExport: scenario.immediateExportedKwh ?? 0,
    shiftedExport: scenario.shiftedExportedLaterKwh ?? 0,
    selfConsumption: ((scenario.achievedSelfConsumption ?? 0) * 100),
    selfSufficiency: ((scenario.selfSufficiency ?? 0) * 100),
    captureUtilization: ((scenario.batteryUtilizationAgainstExport ?? 0) * 100),
    totalUsefulDischarged: scenario.totalUsefulDischargedEnergyKwh ?? 0,
    importReduction: scenario.importReductionKwh ?? 0,
    economicValue: scenario.totalEconomicValueEur ?? null
  }));
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
    <section class="header">
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
        <p>ENERGIEOPLOSSINGEN</p>
      </div>
      <div>
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
            pvSummary.strategy === 'PV_WITH_TRADING'
              ? 'De batterij mag opgeslagen PV later terugleveren aan het net binnen dezelfde kW-, efficiency- en SOC-limieten als elders in de app.'
              : pvSummary.mode === 'FULL_PV'
              ? 'De PV-batterij wordt gedimensioneerd op basis van PV-surplus, piekmismatch tussen opwek en load, en batterijverliezen.'
              : 'De batterij wordt hier gedimensioneerd op basis van gemeten terugleveroverschot en batterijbeperkingen; totale PV-opwek blijft onbekend zonder pv_kwh.'
          }
        </div>
      </div>
      <div class="card">
        <h3>Productsheet aanbevolen batterij</h3>
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
                   <tr><th>Beperking</th><td>${pvSummary.warnings.join(' ')}</td></tr>`
            }
          </tbody>
        </table>
      </div>
      <div class="card">
        <h3>Datakwaliteit</h3>
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

export function generateInteractiveReportHtml(payload: PdfPayload): string {
  if (payload.analysisType === 'PV_SELF_CONSUMPTION') {
    return generatePvInteractiveReportHtml(payload);
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
            : `<div class="callout"><p class="callout-title">Productsheet niet gevonden</p><p class="callout-body">Verwacht in assets: 64.pdf / 96.pdf / 261.pdf / 2090.pdf / 5015.pdf (of .jpg) op basis van de aanbevolen batterij.</p></div>`
        }
        ${brochure ? `<div class="muted" style="margin-top:8px;">Gekoppelde brochure: ${brochure.key}</div>` : ''}
      </div>
    </section>

    <section class="grid two">
      <div class="card">
        <h3>Overschrijdingsenergie Voor/Na (Datasetsimulatie)</h3>
        <div id="exceedance-chart" class="plot"></div>
        <div id="exceedance-baseline-note" class="muted" style="margin-top:6px;"></div>
        <div class="callout">
          <p class="callout-title">Uitleg</p>
          <p class="callout-body">Per batterijoptie zie je overschrijdingsenergie vóór en na inzet, inclusief reductie in kWh en procenten.</p>
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

    const reductionKwh = scenarioData.map(d => Math.max(0, d.before - d.after));
    const reductionPct = scenarioData.map(d => (d.before > 0 ? ((d.before - d.after) / d.before) * 100 : 0));
    Plotly.newPlot('exceedance-chart', [
      {
        type: 'bar',
        name: 'Voor',
        x: scenarioData.map(d => d.optionLabel),
        y: scenarioData.map(d => d.before),
        marker: {color: '#F59E0B'},
        hovertemplate: '%{x}<br>Voor: %{y:.2f} kWh<extra></extra>'
      },
      {
        type: 'bar',
        name: 'Na',
        x: scenarioData.map(d => d.optionLabel),
        y: scenarioData.map(d => d.after),
        marker: {color: '#22C55E'},
        customdata: reductionPct.map((pct, i) => [reductionKwh[i], pct]),
        hovertemplate:
          '%{x}<br>Na: %{y:.2f} kWh<br>Reductie: %{customdata[0]:.2f} kWh (%{customdata[1]:.1f}%)<extra></extra>'
      }
    ], {
      ...wattsTheme,
      barmode: 'group',
      hovermode: 'x unified',
      xaxis: {tickangle: -20},
      yaxis: {title: 'kWh', rangemode: 'tozero'},
      margin: {t: 30, r: 12, b: 90, l: 55}
    }, {responsive: true, displaylogo: false});

    const beforeBaseline = scenarioData.length > 0 ? scenarioData[0].before : 0;
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
