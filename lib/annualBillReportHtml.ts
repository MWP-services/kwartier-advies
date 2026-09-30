import type { PdfPayload } from './pdf';
import { pvReportStyles } from './reportStyles';
import { resolveAverageImportPrice, resolveAverageFeedInPrice } from '../src/lib/annual-bill/annualBillUx';
import { resolveAnnualBillPrices } from '../src/lib/annual-bill/tariffs';

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
}
const number = (value: number) => Number.isFinite(value) ? value.toLocaleString('nl-NL', { maximumFractionDigits: 2 }) : '—';
const euro = (value: number) => Number.isFinite(value) ? value.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' }) : '—';
const tariff = (value: number) => `€ ${value.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 5 })}/kWh`;

// Inline SVG keeps the report and its charts usable offline and in print.
function bars(title: string, values: { label: string; value: number; selected?: boolean }[], unit: string): string {
  const max = Math.max(1, ...values.map((item) => item.value));
  const height = values.length * 52 + 20;
  return `<svg role="img" aria-label="${escapeHtml(title)}" viewBox="0 0 760 ${height}" style="width:100%;height:auto"><title>${escapeHtml(title)}</title>${values.map((item, index) => {
    const y = index * 52 + 10;
    const width = Math.max(0, item.value / max * 420);
    return `<text x="0" y="${y + 20}" font-size="14" fill="#232323">${escapeHtml(item.label)}</text><rect x="180" y="${y}" width="${width}" height="30" rx="5" fill="${item.selected ? '#2F5F33' : '#8DC63F'}"/><text x="${190 + width}" y="${y + 20}" font-size="14" fill="#232323">${number(item.value)} ${escapeHtml(unit)}</text>`;
  }).join('')}</svg>`;
}

export function generateAnnualBillReportHtml(
  data: NonNullable<PdfPayload['annualBill']>,
  logo: string | null,
  brochure: { key: string; dataUri: string } | null
): string {
  const { input, advice } = data;
  const prices = resolveAnnualBillPrices(input);
  const recommended = advice.options.find((option) => option.batteryKwh === advice.recommendedBatteryKwh);
  const warnings = [...new Set([...advice.warnings, ...(input.missingFields ?? []).map((field) => `Ontbrekend of geschat: ${field}`), ...(data.warnings ?? []).filter((warning) => warning.startsWith('Ontbrekend veld:'))])];
  const capacity = recommended ? `${number(recommended.batteryKwh)} kWh` : 'Geen advies mogelijk';
  const rows = [
    ['Bron', input.source === 'pdf' ? 'PDF-jaarnota, gecontroleerde invoer' : 'Handmatige jaargegevens'],
    ['Leverancier', input.supplierName || 'Niet ingevuld'],
    ['Contracttype', ({ fixed: 'Vast', variable: 'Variabel', dynamic: 'Dynamisch', unknown: 'Onbekend' })[input.contractType ?? 'unknown']],
    ['Factuurperiode', `${input.periodStart || 'Onbekend'} t/m ${input.periodEnd || 'Onbekend'}`],
    ['Netafname gebruikt in berekening', `${number(advice.totalUsageKwh)} kWh`],
    ['Teruglevering gebruikt in berekening', `${number(advice.totalFeedInKwh)} kWh`],
    ['PV-opwek', advice.estimatedPvProductionKwh == null ? 'Onbekend' : `${number(advice.estimatedPvProductionKwh)} kWh (${input.annualPvProductionKwh == null ? 'geschat uit zonnepanelen' : 'opgegeven'})`],
    ['Afnametarief gebruikt', tariff(advice.dynamicPricing?.averageImportPrice ?? resolveAverageImportPrice(input))],
    ...(!advice.dynamicPricing && input.tariffBasis === 'supply_only' ? [
      ['Leveringscomponent', tariff(prices.components.supplyPrice)],
      ['Energiebelasting per kWh', input.energyTaxEurPerKwh != null ? tariff(prices.components.energyTaxPrice) : 'Niet gevonden'],
      ['Btw-percentage', input.electricityVatPercent != null ? `${number(input.electricityVatPercent)}%` : 'Niet gevonden'],
      ['Toegevoegde btw per kWh', tariff(prices.components.vatOnSupply + prices.components.vatOnEnergyTax)],
      ['Energiebelasting stroom op nota', input.energyTaxElectricityEur != null ? euro(input.energyTaxElectricityEur) : 'Niet gevonden']
    ] : []),
    ['Terugleververgoeding gebruikt', tariff(advice.dynamicPricing?.averageExportPrice ?? resolveAverageFeedInPrice(input))],
    ['Investering', input.batteryInvestmentEur ? euro(input.batteryInvestmentEur) : 'Schatting per batterijgrootte']
  ];
  const dynamic = advice.dynamicPricing;
  const simulation = recommended?.dynamicSimulation;
  const dynamicSection = dynamic ? `<section class="card annual-section"><h2 class="section-title">Dynamische prijssimulatie</h2>
    <p>Bron: ${escapeHtml(dynamic.source)}. Prijsperiode ${escapeHtml(dynamic.start)} tot ${escapeHtml(dynamic.end)} (einde exclusief). ${dynamic.hourCount} uurprijzen, opgehaald op ${escapeHtml(dynamic.fetchedAt)}.</p>
    <p>Geschat profiel: ${dynamic.profile === 'home' ? 'huishouden' : 'bedrijf'}. Afname- en terugleverprijzen in de tarieftabel zijn gewogen met het geschatte profiel.</p>
    <p>Inkoopopslag excl. btw: ${tariff(dynamic.importMarkup)}; terugleverinhouding excl. btw: ${tariff(dynamic.exportDeduction)}; energiebelasting excl. btw: ${tariff(dynamic.energyTaxExVat)}; btw: ${number(dynamic.vatPercent)}%.</p>
    ${simulation ? `<table><tbody>
      <tr><th>Variabele stroomkosten zonder batterij</th><td>${euro(simulation.baselineCostEur)}</td></tr>
      <tr><th>Variabele stroomkosten met batterij</th><td>${euro(simulation.batteryCostEur)}</td></tr>
      <tr><th>Voordeel op afname, inclusief kosten netladen</th><td>${euro(simulation.avoidedImportCostEur)}</td></tr>
      <tr><th>Gemiste terugleveropbrengst</th><td>${euro(simulation.lostExportRevenueEur)}</td></tr>
      <tr><th>Besparing per jaar</th><td>${euro(simulation.savingsEur)}</td></tr>
      <tr><th>Eenvoudige terugverdientijd</th><td>${recommended?.estimatedPaybackYears == null ? 'Niet rendabel' : number(recommended.estimatedPaybackYears) + ' jaar'}</td></tr>
      <tr><th>Geladen uit het net</th><td>${number(simulation.chargedFromGridKwh)} kWh</td></tr>
      <tr><th>Laad- en ontlaadvermogen</th><td>${number(simulation.inverterPowerKw)} kW</td></tr>
      <tr><th>Equivalente cycli (ontladen / bruikbare capaciteit)</th><td>${number(simulation.equivalentFullCycles)}</td></tr>
      <tr><th>Batterijverlies</th><td>${number(simulation.lossesKwh)} kWh</td></tr>
    </tbody></table>` : '<p>Geen batterijoptie met een positieve berekende besparing.</p>'}
    <p>Historische simulatie met een geschat verbruiksprofiel; geen voorspelling of gemeten profiel.</p></section>` : '';
  return `<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>WattsNext — batterijadvies jaarnota</title><style>${pvReportStyles}
    .annual-section { margin-top:24px; } .grid.kpis { grid-template-columns:repeat(3,minmax(0,1fr)); } .annual-table { width:100%; } .annual-table .recommended { background:#EEF7EA; font-weight:700; }
    .annual-actions { margin:20px 0; display:flex; gap:16px; } .annual-actions button,.brochure-link { background:#2F5F33;color:white;padding:10px 18px;border:0;border-radius:10px;text-decoration:none;cursor:pointer; }
    .annual-note { color:#596354;font-size:13px; } .annual-brochure { width:100%;height:850px; } .annual-table-wrap { overflow-x:auto; }
    @media(max-width:900px) { .header { grid-template-columns:1fr; } .brand h1 {font-size:28px;} .grid.kpis {grid-template-columns:repeat(2,minmax(0,1fr));} }
    @media print { .annual-actions {display:none;} .annual-brochure {height:650px;} .brochure-section {break-before:page;} .header {grid-template-columns:1fr 1fr;padding:20px;} .brand h1 {font-size:26px;} .logoWrap {grid-column:1/-1;} }
  </style></head><body><main class="page">
    <header class="header"><div class="logoWrap">${logo ? `<img src="${logo}" alt="WattsNext"/>` : 'WattsNext'}</div><div class="brand"><h1>Batterijadvies op basis van jaarnota</h1><p>Meer eigen zonnestroom gebruiken met een passende batterij.</p></div><div class="advice-card"><div class="advice-label">Indicatief advies</div><div class="advice-title">${capacity}</div><p>Jaargegevens zonder gemeten kwartierprofiel</p></div></header>
    <div class="annual-actions"><button onclick="window.print()">Afdrukken / opslaan als PDF</button></div>
    <section class="grid kpis">${[['Netafname', `${number(advice.totalUsageKwh)} kWh`], ['Teruglevering', `${number(advice.totalFeedInKwh)} kWh`], ['Geschatte besparing / jaar', euro(advice.annualSavingsRangeEur.expected)]].map(([label, value]) => `<div class="card kpi-card"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div></div>`).join('')}</section>
    <section class="card annual-section"><h2 class="section-title">Uw batterijadvies</h2><p>${escapeHtml(advice.explanation)}</p><div class="callout">${recommended ? `Het rekenmodel adviseert ${capacity}. Deze optie levert naar schatting ${number(recommended.estimatedAnnualStoredSolarKwh)} kWh extra eigen gebruik van zonnestroom per jaar. ${dynamic ? 'Van de opties met een positieve besparing kiest het model de kortste eenvoudige terugverdientijd.' : 'Het advies houdt rekening met batterijbenutting en extra besparing bij een grotere batterij.'}` : 'Er zijn onvoldoende bruikbare gegevens voor een batterijadvies.'}</div><p>Geschatte jaarlijkse besparing: <strong>${euro(advice.annualSavingsRangeEur.min)} tot ${euro(advice.annualSavingsRangeEur.max)}</strong>, met ${euro(advice.annualSavingsRangeEur.expected)} als middenwaarde.</p><p class="annual-note">De bandbreedte is een rekenmarge van ±25%. Het benodigde laad-/ontlaadvermogen kan niet uit alleen jaartotalen worden bepaald.</p></section>
    <section class="grid two annual-section"><div class="card"><h2 class="section-title">Jaargegevens in beeld</h2>${bars('Netafname en teruglevering', [{ label: 'Netafname', value: advice.totalUsageKwh }, { label: 'Teruglevering', value: advice.totalFeedInKwh }], 'kWh')}<p class="annual-note">Netafname is stroom uit het net. Direct gebruikte zonnestroom staat hier niet bij. Dit zijn de jaarwaarden die het model gebruikt; eventuele schattingen staan bij de aandachtspunten.</p></div><div class="card"><h2 class="section-title">Verwacht effect van de batterij</h2>${bars('Netafname voor en na batterij', [{ label: 'Zonder batterij', value: advice.totalUsageKwh }, { label: 'Met batterij (schatting)', value: simulation?.importAfterKwh ?? Math.max(0, advice.totalUsageKwh - (recommended?.estimatedAnnualStoredSolarKwh ?? 0)), selected: true }], 'kWh')}<p class="annual-note">${dynamic ? 'Gesimuleerde netafname inclusief laden uit het net op goedkope uren. Geen gemeten profiel.' : 'Indicatieve afnamevermindering door opgeslagen zonnestroom. Geen gemeten of gesimuleerd dagprofiel.'}</p></div></section>
    <section class="card annual-section"><h2 class="section-title">Welke batterijgrootte past?</h2><p>Geschatte jaarlijkse besparing per optie. Donkergroen markeert het advies.</p>${bars('Jaarlijkse besparing per batterijgrootte', advice.options.map((option) => ({ label: `${number(option.batteryKwh)} kWh${option.batteryKwh === advice.recommendedBatteryKwh ? ' · advies' : ''}`, value: option.estimatedAnnualSavingsEur, selected: option.batteryKwh === advice.recommendedBatteryKwh })), '€/jaar')}<div class="annual-table-wrap"><table class="annual-table"><thead><tr><th>Batterij</th><th>Extra eigen zon / jaar</th><th>Besparing / jaar</th></tr></thead><tbody>${advice.options.map((option) => `<tr class="${option.batteryKwh === advice.recommendedBatteryKwh ? 'recommended' : ''}"><td>${number(option.batteryKwh)} kWh${option.batteryKwh === advice.recommendedBatteryKwh ? ' — advies' : ''}</td><td>${number(option.estimatedAnnualStoredSolarKwh)} kWh</td><td>${euro(option.estimatedAnnualSavingsEur)}</td></tr>`).join('')}</tbody></table></div></section>
    ${dynamicSection}<section class="grid two annual-section"><div class="card"><h2 class="section-title">Gegevens en tarieven</h2><table><tbody>${rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('')}</tbody></table></div><div class="card"><h2 class="section-title">Aannames en aandachtspunten</h2><p>Het model rekent met ${number(advice.efficiencyPercent)}% efficiëntie, ${number(advice.minimumSocPercent)}% minimale SOC, ${number(advice.emergencyPowerReservePercent)}% extra noodstroomreserve, ${dynamic ? 'een uurprofiel met seizoen- en weekpatronen, een laad- en ontlaadvermogen van 0,5C zonder vaste jaargrens voor cycli. De besparing is het verschil in stroomkosten met en zonder batterij, inclusief netladen en gemiste terugleveropbrengst.' : '45% avond-/nachtvraag en maximaal 230 equivalente laadcycli per jaar. De besparing volgt uit extra eigen zonnestroom maal het verschil tussen afnametarief en terugleververgoeding.'}</p><p>De eenvoudige berekening verwerkt geen afzonderlijke salderingsregeling, vaste terugleverkosten, onderhoud, degradatie of prijsontwikkeling. De invoer wordt als jaarvolume gebruikt; een afwijkende factuurperiode wordt niet automatisch naar een jaar omgerekend.</p>${warnings.length ? `<ul>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : '<p>Er zijn geen ontbrekende invoerwaarden gemeld door het rekenmodel.</p>'}<div class="callout">Bevestig het advies met kwartierdata, een productofferte en controle van aansluiting en installatie. De definitieve productkeuze hangt ook af van het benodigde vermogen.</div></div></section>
    <section class="card annual-section brochure-section"><h2 class="section-title">Bijpassende brochure — ${capacity}</h2>${brochure ? `<p>Productsheet bij de geadviseerde opslagcapaciteit (${capacity}).</p><p><a class="brochure-link" href="${brochure.dataUri}" download="WattsNext-brochure-${escapeHtml(brochure.key)}.${brochure.dataUri.startsWith('data:application/pdf') ? 'pdf' : 'png'}">Brochure openen / downloaden</a></p>${brochure.dataUri.startsWith('data:application/pdf') ? `<object class="annual-brochure" data="${brochure.dataUri}" type="application/pdf"><p>Gebruik de downloadlink om de bijgevoegde brochure te bekijken.</p></object><p class="annual-note">Bij afdrukken kan de PDF-bijlage apart moeten worden afgedrukt via de downloadlink.</p>` : `<img style="width:100%;height:auto" src="${brochure.dataUri}" alt="Brochure ${escapeHtml(brochure.key)} kWh"/>`}` : `<div class="callout">Voor ${capacity} is nog geen bijpassende productbrochure beschikbaar. De capaciteit is een indicatie; een specifiek merk of model is nog niet geselecteerd.</div>`}</section>
    <footer class="footer"><span>WattsNext · PV zelfverbruik · Jaarnota-advies</span><span>Indicatieve berekening</span></footer>
  </main></body></html>`;
}
