"use strict";(()=>{var e={};e.id=941,e.ids=[941],e.modules={399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},1096:(e,t,a)=>{a.r(t),a.d(t,{originalPathname:()=>y,patchFetch:()=>k,requestAsyncStorage:()=>b,routeModule:()=>w,serverHooks:()=>v,staticGenerationAsyncStorage:()=>f});var r={};a.r(r),a.d(r,{POST:()=>x});var i=a(9303),o=a(8716),n=a(670),s=a(7070),d=a(7880),l=a(103);let p=require("node:fs");var c=a.n(p);let m=require("node:path");var u=a.n(m);function h(e){return JSON.stringify(e).replace(/</g,"\\u003c")}function g(e){for(let t of e)try{if(!c().existsSync(t))continue;let e=c().readFileSync(t);return{dataUri:`data:${function(e){let t=e.toLowerCase();return t.endsWith(".png")?"image/png":t.endsWith(".jpg")||t.endsWith(".jpeg")?"image/jpeg":t.endsWith(".pdf")?"application/pdf":"application/octet-stream"}(t)};base64,${e.toString("base64")}`,filePath:t}}catch{continue}return null}async function x(e){let t=function(e){let t=function(){let e=g([u().join(process.cwd(),".next","assets","wattsnext-logo.png"),u().join(process.cwd(),".next","assets","wattsnext-logo.jpg"),u().join(process.cwd(),".next","assets","logo.png"),u().join(process.cwd(),".next","assets","logo.jpg"),u().join(process.cwd(),"assets","wattsnext-logo.png"),u().join(process.cwd(),"assets","wattsnext-logo.jpg"),u().join(process.cwd(),"assets","logo.png"),u().join(process.cwd(),"assets","logo.jpg"),u().join(process.cwd(),"public","assets","wattsnext-logo.png"),u().join(process.cwd(),"public","assets","wattsnext-logo.jpg"),u().join(process.cwd(),"public","assets","logo.png"),u().join(process.cwd(),"public","assets","logo.jpg")]);return e?.dataUri??null}(),a=function(e){let t=e.sizing.recommendedProduct;if(!t)return null;let a=t.unitCapacityKwh&&[64,96,261].includes(Math.round(t.unitCapacityKwh))?String(Math.round(t.unitCapacityKwh)):[2090,5015].includes(Math.round(t.capacityKwh))?String(Math.round(t.capacityKwh)):null;if(!a)return null;let r=g([u().join(process.cwd(),".next","assets",`${a}.pdf`),u().join(process.cwd(),".next","assets",`${a}.jpg`),u().join(process.cwd(),".next","assets",`${a}.png`),u().join(process.cwd(),"assets",`${a}.pdf`),u().join(process.cwd(),"assets",`${a}.jpg`),u().join(process.cwd(),"assets",`${a}.png`),u().join(process.cwd(),"public","assets",`${a}.pdf`),u().join(process.cwd(),"public","assets",`${a}.jpg`),u().join(process.cwd(),"public","assets",`${a}.png`)]);return r?{key:a,dataUri:r.dataUri}:null}(e),r=e.sizing.kWhNeededRaw,i=e.compliance>0?r/e.compliance:r,o=e.efficiency>0?r/e.efficiency:e.sizing.kWhNeeded,n=[{step:"Grid basis",value:Math.max(0,i)},{step:"After compliance",value:Math.max(0,r)},{step:"After efficiency",value:Math.max(0,o)},{step:"Final (buffer)",value:Math.max(0,e.sizing.kWhNeeded)}],s=e.scenarios.map(e=>({optionLabel:e.optionLabel,before:e.exceedanceEnergyKwhBefore,after:e.exceedanceEnergyKwhAfter,compliance:100*e.achievedComplianceDataset,remainingKw:e.maxRemainingExcessKw})),p=e.topEvents.map(e=>({peakTimestamp:(0,l.i$)(e.peakTimestamp),durationIntervals:e.durationIntervals,maxExcessKw:e.maxExcessKw.toFixed(2),totalExcessKwh:e.totalExcessKwh.toFixed(2)})),c=[["Contracted power",`${e.contractedPowerKw.toFixed(2)} kW`],["Max observed",`${e.maxObservedKw.toFixed(2)} kW`],["Exceedance intervals",String(e.exceedanceCount)],["Sizing requirement",`${e.sizing.kWhNeeded.toFixed(2)} kWh / ${e.sizing.kWNeeded.toFixed(2)} kW`],["Recommended",e.sizing.recommendedProduct?.label??"No feasible battery by kW + kWh"]],m=e.intervals??[],x=e.peakMoments??[],w=e.highestPeakDay??(m.length>0?(0,l.Vu)(m[0].timestamp,"Europe/Amsterdam"):null),b=new Set(x.filter(e=>w&&(0,l.Vu)(e.timestamp,"Europe/Amsterdam")===w).map(e=>{let{hour:t,minute:a}=(0,l.c8)(e.timestamp,"Europe/Amsterdam");return`${String(t).padStart(2,"0")}:${String(a).padStart(2,"0")}`})),f=w?(0,d.IW)(m,w,15,"Europe/Amsterdam").map(t=>({timeLabel:t.timestampLabel,consumptionKw:t.observedKw,contractKw:e.contractedPowerKw,isPeakMoment:b.has(t.timestampLabel)})):[],v=Math.max(1,...m.map(e=>e.consumptionKw??0))/20,y=Array.from({length:20},(t,a)=>{let r=a*v,i=r+v,o=m.filter(e=>e.consumptionKw>=r&&(19===a?e.consumptionKw<=i:e.consumptionKw<i)).length,n=i/Math.max(1,e.contractedPowerKw);return{label:`${r.toFixed(0)}-${i.toFixed(0)}`,count:o,color:n>1?"#dc2626":n>.9?"#d28a00":"#43a047"}}),k=x.map(e=>({timestamp:(0,l.i$)(e.timestamp),consumptionKw:e.consumptionKw.toFixed(2),excessKw:e.excessKw.toFixed(2),excessKwh:e.excessKwh.toFixed(2)}));return`<!doctype html>
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
        ${t?`<img src="${t}" alt="WattsNext logo" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
               <div class="logoFallback" aria-hidden="true"><span>WattsNext</span><span class="plus">+</span></div>`:'<div class="logoFallback" style="display:flex;" aria-hidden="true"><span>WattsNext</span><span class="plus">+</span></div>'}
      </div>
      <div class="brand">
        <h1>Peak Shaving Report</h1>
        <p>ENERGY SOLUTIONS</p>
      </div>
      <div class="stamp">
        <div class="pill">Peak Shaving Report</div>
        <div style="margin-top:8px;">Method: ${e.method}</div>
        <div>Compliance: ${(100*e.compliance).toFixed(0)}%</div>
      </div>
    </section>

    <section class="grid kpis">
      ${c.map(([e,t])=>`
        <div class="card">
          <div class="kpi-label">${e}</div>
          <div class="kpi-value">${t}</div>
        </div>`).join("")}
    </section>

    <section class="grid two">
      <div class="card">
        <h3>Aanbevolen batterijadvies</h3>
        <table>
          <tbody>
            <tr><th>Aanbevolen configuratie</th><td>${e.sizing.recommendedProduct?.label??"Geen haalbare configuratie"}</td></tr>
            <tr><th>Benodigde capaciteit</th><td>${e.sizing.kWhNeeded.toFixed(2)} kWh</td></tr>
            <tr><th>Benodigd vermogen</th><td>${e.sizing.kWNeeded.toFixed(2)} kW</td></tr>
            <tr><th>Geadviseerde productcapaciteit</th><td>${e.sizing.recommendedProduct?`${e.sizing.recommendedProduct.capacityKwh} kWh`:"-"}</td></tr>
            <tr><th>Geadviseerd productvermogen</th><td>${e.sizing.recommendedProduct?`${e.sizing.recommendedProduct.powerKw} kW`:"-"}</td></tr>
          </tbody>
        </table>
        <div class="callout">
          <p class="callout-title">Productsheet toegevoegd</p>
          <p class="callout-body">Voor de aanbevolen batterij (of modulaire basisvariant) is de productsheet uit de assets-map opgenomen in dit rapport.</p>
        </div>
      </div>
      <div class="card">
        <h3>Productsheet aanbevolen batterij</h3>
        ${a?a.dataUri.startsWith("data:application/pdf")?`<object class="brochureFrame" data="${a.dataUri}#page=1&zoom=page-width" type="application/pdf">
                   <p class="muted">Uw browser ondersteunt geen inline PDF-weergave. Open het HTML-rapport in een moderne browser.</p>
                 </object>`:`<img class="brochureFrame" src="${a.dataUri}" alt="Productsheet batterij ${a.key}" style="object-fit:contain;" />`:'<div class="callout"><p class="callout-title">Productsheet niet gevonden</p><p class="callout-body">Verwacht in assets: 64.pdf / 96.pdf / 261.pdf / 2090.pdf / 5015.pdf (of .jpg) op basis van de aanbevolen batterij.</p></div>'}
        ${a?`<div class="muted" style="margin-top:8px;">Gekoppelde brochure: ${a.key}</div>`:""}
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
            <tr><th>Rows</th><td>${e.quality.rows}</td></tr>
            <tr><th>Date range</th><td>${e.quality.startDate??"-"} to ${e.quality.endDate??"-"}</td></tr>
            <tr><th>Missing intervals</th><td>${e.quality.missingIntervalsCount}</td></tr>
            <tr><th>Duplicates</th><td>${e.quality.duplicateCount}</td></tr>
            <tr><th>Non-15-min transitions</th><td>${e.quality.non15MinIntervals}</td></tr>
            <tr><th>Max observed timestamp</th><td>${e.maxObservedTimestamp?(0,l.i$)(e.maxObservedTimestamp):"-"}</td></tr>
            <tr><th>Efficiency</th><td>${(100*e.efficiency).toFixed(0)}%</td></tr>
            <tr><th>Safety factor</th><td>${e.safetyFactor.toFixed(2)}x</td></tr>
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
    const scenarioData = ${h(s)};
    const sizingData = ${h(n)};
    const peakEvents = ${h(p)};
    const peakMoments = ${h(k)};
    const dayProfile = ${h(f)};
    const histogram = ${h(y)};

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
</html>`}(await e.json());return new s.NextResponse(t,{headers:{"Content-Type":"text/html; charset=utf-8","Content-Disposition":'attachment; filename="wattsnext-peak-shaving-report.html"'}})}let w=new i.AppRouteRouteModule({definition:{kind:o.x.APP_ROUTE,page:"/api/report/route",pathname:"/api/report",filename:"route",bundlePath:"app/api/report/route"},resolvedPagePath:"C:\\Users\\Micha\\Kwartier-data advies peak shaving\\kwartier-advies\\app\\api\\report\\route.ts",nextConfigOutput:"",userland:r}),{requestAsyncStorage:b,staticGenerationAsyncStorage:f,serverHooks:v}=w,y="/api/report/route";function k(){return(0,n.patchFetch)({serverHooks:v,staticGenerationAsyncStorage:f})}},7880:(e,t,a)=>{a.d(t,{F1:()=>c,Gy:()=>d,IW:()=>m,LM:()=>s,TN:()=>i,yy:()=>p});var r=a(103);let i=[{label:"WattsNext ESS Cabinet 64 kWh",capacityKwh:64,powerKw:30,modular:!0,unitPriceEur:15689.33},{label:"WattsNext ESS Cabinet 96 kWh",capacityKwh:96,powerKw:48,modular:!0,unitPriceEur:22225.98},{label:"ESS All-in-one Cabinet 261 kWh",capacityKwh:261,powerKw:125,modular:!0,unitPriceEur:43995.96},{label:"WattsNext All-in-one Container 2.09 MWh",capacityKwh:2090,powerKw:1e3,modular:!1,unitPriceEur:318658.06},{label:"WattsNext All in-one Container 5.015 MWh",capacityKwh:5015,powerKw:2580,modular:!1,unitPriceEur:675052.49}];function o(e){return Math.round(100*e)/100}function n(e){let t=o(e.totalPriceEur);return{label:e.label,capacityKwh:e.totalCapacityKwh,powerKw:e.totalPowerKw,unitCapacityKwh:e.unitCapacityKwh,unitPowerKw:e.unitPowerKw,count:e.count,unitPriceEur:o(e.unitPriceEur),totalPriceEur:t,breakdown:[{type:`${e.unitCapacityKwh} kWh`,count:e.count,unitCapacityKwh:e.unitCapacityKwh,unitPriceEur:o(e.unitPriceEur),totalPriceEur:t}]}}function s(e,t){return e.map(e=>{let a=e.timestamp,i="string"==typeof a&&/^\d{4}-\d{2}-\d{2}T.*Z$/.test(a)?a:(()=>{let e=(0,r.ZB)(a);return Number.isNaN(e.getTime())?String(a):e.toISOString()})(),o=e.consumptionKwh/.25,n=Math.max(0,o-t);return{...e,timestamp:i,consumptionKw:o,excessKw:n,excessKwh:.25*n}})}function d(e){let t=[],a=null;return e.forEach((e,r)=>{e.excessKw>0?(a||(a={peakTimestamp:e.timestamp,durationIntervals:0,maxExcessKw:0,totalExcessKwh:0,intervalIndexes:[]}),a.durationIntervals+=1,(e.excessKw>a.maxExcessKw||e.excessKw===a.maxExcessKw&&e.timestamp<a.peakTimestamp)&&(a.maxExcessKw=e.excessKw,a.peakTimestamp=e.timestamp),a.totalExcessKwh+=e.excessKwh,a.intervalIndexes.push(r)):a&&(t.push(a),a=null)}),a&&t.push(a),t}function l(e,t){if(0===e.length)return 0;let a=[...e].sort((e,t)=>e-t),r=Math.ceil(t/100*a.length)-1;return a[Math.max(0,Math.min(r,a.length-1))]}function p(e){let{intervals:t,events:a,method:r,compliance:o,safetyFactor:s,efficiency:d}=e,p=0,c=0;if("MAX_PEAK"===r){let e=[...a].sort((e,t)=>t.totalExcessKwh-e.totalExcessKwh)[0];e&&(p=e.totalExcessKwh,c=e.maxExcessKw)}if("P95"===r){if(a.length<20){let e=[...a].sort((e,t)=>t.totalExcessKwh-e.totalExcessKwh)[0];e&&(p=e.totalExcessKwh,c=e.maxExcessKw)}else p=l(a.map(e=>e.totalExcessKwh),95),c=l(a.map(e=>e.maxExcessKw),95)}if("FULL_COVERAGE"===r){let e=new Map;t.forEach(t=>{let a=t.timestamp.slice(0,10),r=e.get(a)??[];r.push(t),e.set(a,r)});let a=0,r=0;e.forEach(e=>{let t=e.reduce((e,t)=>e+t.excessKwh,0);t>a&&(a=t,r=Math.max(...e.map(e=>e.excessKw)))}),p=a,c=r}let m=(p*=o)/d*s,u=(c*=o)*s,{recommendedProduct:h,alternativeProduct:g,noFeasibleBatteryByPower:x}=function(e,t=0){let a=Math.max(0,e),r=Math.max(0,t),o=[];i.forEach(e=>{let t=e.unitPriceEur??0;if(e.modular){let i=Math.max(1,Math.ceil(a/e.capacityKwh),Math.ceil(r/e.powerKw));for(let n=1;n<=i;n+=1){let i=n*e.capacityKwh,s=n*e.powerKw;if(i<a||s<r)continue;let d=n*t;o.push({label:`${n}x ${e.capacityKwh} kWh (modulair)`,totalCapacityKwh:i,totalPowerKw:s,totalPriceEur:d,overCapacityKwh:i-a,overPowerKw:s-r,count:n,unitCapacityKwh:e.capacityKwh,unitPowerKw:e.powerKw,unitPriceEur:t})}return}e.capacityKwh>=a&&e.powerKw>=r&&o.push({label:e.label,totalCapacityKwh:e.capacityKwh,totalPowerKw:e.powerKw,totalPriceEur:t,overCapacityKwh:e.capacityKwh-a,overPowerKw:e.powerKw-r,count:1,unitCapacityKwh:e.capacityKwh,unitPowerKw:e.powerKw,unitPriceEur:t})});let s=o.sort((e,t)=>e.totalPriceEur-t.totalPriceEur||e.overCapacityKwh-t.overCapacityKwh||e.overPowerKw-t.overPowerKw||e.totalCapacityKwh-t.totalCapacityKwh);return 0===s.length?{recommendedProduct:null,alternativeProduct:null,noFeasibleBatteryByPower:r>0}:{recommendedProduct:n(s[0]),alternativeProduct:s[1]?n(s[1]):null,noFeasibleBatteryByPower:!1}}(m,u);return{kWhNeededRaw:p,kWNeededRaw:c,kWhNeeded:m,kWNeeded:u,recommendedProduct:h,alternativeProduct:g,noFeasibleBatteryByPower:x}}function c(e){if(0===e.length)return{rows:0,startDate:null,endDate:null,missingIntervalsCount:0,duplicateCount:0,non15MinIntervals:0,warnings:["No rows found in dataset."]};let t=e.map(e=>new Date(e.timestamp)).filter(e=>!Number.isNaN(e.getTime())).sort((e,t)=>e.getTime()-t.getTime()),a=t.length-new Set(t.map(e=>e.toISOString())).size,r=0,i=0;for(let e=1;e<t.length;e+=1){let a=(t[e].getTime()-t[e-1].getTime())/6e4;Math.abs(a-15)>.01&&(r+=1,a>15.01&&(i+=Math.max(0,Math.round(a/15)-1)))}let o=[];return a>0&&o.push(`Detected ${a} duplicate timestamps.`),r>0&&o.push(`Detected ${r} non-15-minute interval transitions.`),{rows:e.length,startDate:t[0]?.toISOString()??null,endDate:t[t.length-1]?.toISOString()??null,missingIntervalsCount:i,duplicateCount:a,non15MinIntervals:r,warnings:o}}function m(e,t,a=15,i="Europe/Amsterdam"){return(function(e,t,a=15,i="Europe/Amsterdam"){if(!t||a<=0)return[];let[o,n,s]=t.split("-").map(Number),d=new Date(o,n-1,s,0,0,0,0);if(Number.isNaN(d.getTime()))return[];let l=Math.floor(1440/a),p=Array.from({length:l},(e,t)=>{let r=t*a;return{timeLabel:`${String(Math.floor(r/60)).padStart(2,"0")}:${String(r%60).padStart(2,"0")}`,timestampIso:new Date(d.getTime()+6e4*r).toISOString(),consumptionKw:0}});return e.forEach(e=>{if((0,r.Vu)(e.timestamp,i)!==t)return;let o=(0,r.ZB)(e.timestamp);if(Number.isNaN(o.getTime()))return;let{hour:n,minute:s}=(0,r.c8)(o,i);if(!Number.isFinite(n)||!Number.isFinite(s))return;let d=Math.floor((60*n+s)/a);d<0||d>=l||(p[d].consumptionKw=Math.max(p[d].consumptionKw,e.consumptionKw))}),p})(e.map(e=>({timestamp:e.timestamp,consumptionKw:e.consumptionKw})),t,a,i).map(e=>({timestampLabel:e.timeLabel,timestampIso:e.timestampIso,observedKw:e.consumptionKw}))}},103:(e,t,a)=>{a.d(t,{Vu:()=>l,ZB:()=>d,c8:()=>p,i$:()=>c});let r=Date.UTC(1899,11,30),i="Europe/Amsterdam";function o(e){return Date.UTC(e.year,e.month-1,e.day,e.hour,e.minute,e.second,0)}function n(e,t){let a=o(e);for(let r=0;r<3;r+=1){let r=function(e,t){let a=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:!1,hourCycle:"h23",timeZone:t}).formatToParts(e).map(e=>[e.type,e.value]));return{year:Number(a.year),month:Number(a.month),day:Number(a.day),hour:Number(a.hour),minute:Number(a.minute),second:Number(a.second)}}(new Date(a),t),i=o(e)-o(r);if(0===i)break;a+=i}return new Date(a)}function s(e){let t=new Date(9e5*Math.round((r+864e5*e)/9e5));return n({year:t.getUTCFullYear(),month:t.getUTCMonth()+1,day:t.getUTCDate(),hour:t.getUTCHours(),minute:t.getUTCMinutes(),second:t.getUTCSeconds()},i)}function d(e){if(e instanceof Date)return e;if("number"==typeof e&&Number.isFinite(e))return s(e);let t=String(e??"").trim();if(!t)return new Date(Number.NaN);let a=Number(t);return Number.isFinite(a)&&/^\d+(\.\d+)?$/.test(t)?s(a):function(e){let t=(e.includes(" tot ")?e.split(" tot ")[0].trim():e).match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+|T)(\d{2}):(\d{2})(?::(\d{2}))?$/);if(!t)return null;let[,a,r,o,s,d,l]=t,p=n({year:Number(o),month:Number(r),day:Number(a),hour:Number(s),minute:Number(d),second:l?Number(l):0},i);return Number.isNaN(p.getTime())?null:p}(t)||new Date(t)}function l(e,t="Europe/Amsterdam"){let a="string"==typeof e?d(e):e;if(Number.isNaN(a.getTime()))return"";let r=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{year:"numeric",month:"2-digit",day:"2-digit",timeZone:t}).formatToParts(a).map(e=>[e.type,e.value]));return`${r.year}-${r.month}-${r.day}`}function p(e,t="Europe/Amsterdam"){let a="string"==typeof e?d(e):e;if(Number.isNaN(a.getTime()))return{hour:Number.NaN,minute:Number.NaN};let r=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{hour:"2-digit",minute:"2-digit",hour12:!1,timeZone:t}).formatToParts(a).map(e=>[e.type,e.value]));return{hour:Number(r.hour),minute:Number(r.minute)}}function c(e){let t="string"==typeof e?d(e):e;if(Number.isNaN(t.getTime()))return"-";let a=Object.fromEntries(new Intl.DateTimeFormat("nl-NL",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:!1,timeZone:"Europe/Amsterdam"}).formatToParts(t).map(e=>[e.type,e.value]));return`${a.day}-${a.month}-${a.year} ${a.hour}:${a.minute}`}}};var t=require("../../../webpack-runtime.js");t.C(e);var a=e=>t(t.s=e),r=t.X(0,[276,972],()=>a(1096));module.exports=r})();