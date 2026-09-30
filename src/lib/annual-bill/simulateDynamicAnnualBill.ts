import type { AnnualBillInput } from '../../../lib/analysis';
import type { MarketYear } from './recentDynamicPrices';
import { validateMarketYear } from './recentDynamicPrices';

export type SimulatedHour = { start: string; importKwh: number; exportKwh: number; importPrice: number; exportPrice: number };
export type DynamicSimulation = {
  inverterPowerKw: number;
  equivalentFullCycles: number;
  baselineCostEur: number;
  batteryCostEur: number;
  avoidedImportCostEur: number;
  lostExportRevenueEur: number;
  savingsEur: number;
  importBeforeKwh: number;
  importAfterKwh: number;
  exportBeforeKwh: number;
  exportAfterKwh: number;
  chargedFromGridKwh: number;
  chargedSolarKwh: number;
  deliveredSolarKwh: number;
  deliveredGridKwh: number;
  lossesKwh: number;
  finalStoredKwh: number;
};
export type DynamicAnnualContext = {
  hours: SimulatedHour[];
  metadata: {
    source: string; start: string; end: string; fetchedAt: string; hourCount: number;
    profile: 'home' | 'business'; averageImportPrice: number; averageExportPrice: number;
    importMarkup: number; exportDeduction: number; energyTaxExVat: number; vatPercent: number;
    warnings: string[];
  };
};

const localParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', month: 'numeric', hour: 'numeric', weekday: 'short', hourCycle: 'h23' });

export function prepareDynamicAnnualContext(input: AnnualBillInput, year: MarketYear, usage: number, feedIn: number): DynamicAnnualContext {
  const marketHours = validateMarketYear(year.hours, year.start, year.end);
  if (marketHours.length !== 8760) throw new Error('De dynamische simulatie vereist 365 volledige dagen.');
  if (![usage, feedIn].every((value) => Number.isFinite(value) && value >= 0)) throw new Error('Ongeldige jaarvolumes.');
  const warnings: string[] = [];
  const parameter = (value: number | undefined, label: string, max: number): number => {
    if (value == null) { warnings.push(`${label} ontbreekt: 0 aangenomen. Vul dit aan voor een volledige klantprijs.`); return 0; }
    if (!Number.isFinite(value) || value < 0 || value > max) throw new Error(`Ongeldige waarde voor ${label}.`);
    return value;
  };
  const vatPercent = parameter(input.electricityVatPercent, 'Btw-percentage', 100);
  const vat = 1 + vatPercent / 100;
  const importMarkup = parameter(input.dynamicImportMarkupEurPerKwh, 'Inkoopopslag excl. btw', 2);
  const exportDeduction = parameter(input.dynamicExportDeductionEurPerKwh, 'Terugleverinhouding excl. btw', 2);
  const energyTax = parameter(input.energyTaxEurPerKwh, 'Energiebelasting per kWh', 2);
  if (input.energyTaxVat == null && energyTax > 0) warnings.push('Btw-status energiebelasting onbekend: belasting behandeld als exclusief btw.');
  const energyTaxExVat = input.energyTaxVat === 'included' ? energyTax / vat : energyTax;
  const profile = input.consumptionProfile ?? 'home';
  const shaped = marketHours.map((point) => {
    const parts = Object.fromEntries(localParts.formatToParts(new Date(point.start)).map((part) => [part.type, part.value]));
    const hour = Number(parts.hour);
    const month = Number(parts.month);
    const winter = 1 + 0.25 * Math.cos((month - 1) * Math.PI / 6);
    const weekend = ['Sat', 'Sun'].includes(parts.weekday);
    const loadShape = profile === 'business'
      ? (hour >= 8 && hour < 18 ? 1.8 : 0.35) * (weekend ? 0.45 : 1)
      : (hour >= 17 && hour < 23 ? 1.9 : hour >= 6 && hour < 9 ? 1.3 : hour < 6 ? 0.4 : 0.8) * (weekend ? 1.08 : 1);
    const summer = 1 - 0.7 * Math.cos((month - 1) * Math.PI / 6);
    const daylight = 12 - 4 * Math.cos((month - 1) * Math.PI / 6);
    const solarShape = Math.max(0, Math.sin(Math.PI * (hour + 0.5 - (13 - daylight / 2)) / daylight));
    const inDaylight = Math.abs(hour + 0.5 - 13) < daylight / 2;
    return { ...point, load: loadShape * winter, solar: inDaylight ? solarShape * summer : 0 };
  });
  const loadSum = shaped.reduce((sum, hour) => sum + hour.load, 0);
  const solarSum = shaped.reduce((sum, hour) => sum + hour.solar, 0);
  const hours = shaped.map((point) => ({
    start: point.start, importKwh: usage * point.load / loadSum, exportKwh: feedIn * point.solar / solarSum,
    importPrice: (point.marketPriceEurPerKwh + importMarkup + energyTaxExVat) * vat,
    exportPrice: (point.marketPriceEurPerKwh - exportDeduction) * vat
  }));
  warnings.push('Verbruiks- en terugleverprofiel zijn geschat met seizoenen, werkdagen en lokale uren; geen gemeten uurdata. Uurgemiddelden kunnen zowel afname als teruglevering bevatten.');
  warnings.push('Historische marktprijzen zijn geen voorspelling. Aangenomen: dezelfde btw-behandeling voor afname en teruglevering, constant belastingtarief en constante opslagen gedurende het prijsjaar.');
  warnings.push('Batterijsturing gebruikt maximaal 24 uur vooruit bekende historische prijzen en een geschat profiel. Geen garantie op de haalbare besparing; geen saldering, vaste terugleverkosten, onderhoud of degradatie.');
  return { hours, metadata: {
    source: year.source, start: year.start, end: year.end, fetchedAt: year.fetchedAt, hourCount: hours.length, profile,
    averageImportPrice: usage > 0 ? hours.reduce((sum, hour) => sum + hour.importKwh * hour.importPrice, 0) / usage : 0,
    averageExportPrice: feedIn > 0 ? hours.reduce((sum, hour) => sum + hour.exportKwh * hour.exportPrice, 0) / feedIn : 0,
    importMarkup, exportDeduction, energyTaxExVat, vatPercent, warnings
  } };
}

// Chronological heuristic, not a claim of optimal dispatch. Charge losses are applied once;
// SOC begins empty above the reserve and the remaining final SOC has no financial credit.
export function simulateDynamicBattery(hours: SimulatedHour[], capacity: number, usableFraction: number, efficiency = 0.95): DynamicSimulation {
  const usable = capacity * usableFraction;
  const power = capacity / 2; // User-confirmed 0.5C for both charging and discharging.
  let solarSoc = 0;
  let gridSoc = 0;
  const result: DynamicSimulation = { inverterPowerKw: power, equivalentFullCycles: 0, baselineCostEur: 0, batteryCostEur: 0, avoidedImportCostEur: 0, lostExportRevenueEur: 0, savingsEur: 0, importBeforeKwh: 0, importAfterKwh: 0, exportBeforeKwh: 0, exportAfterKwh: 0, chargedFromGridKwh: 0, chargedSolarKwh: 0, deliveredSolarKwh: 0, deliveredGridKwh: 0, lossesKwh: 0, finalStoredKwh: 0 };
  for (let i = 0; i < hours.length; i++) {
    const row = hours[i];
    const future = hours.slice(i + 1, i + 25);
    const futurePrices = future.map((hour) => hour.importPrice).sort((a, b) => a - b);
    const highPrice = futurePrices[Math.floor(futurePrices.length * 0.75)] ?? row.importPrice;
    const lowPrice = futurePrices[Math.floor(futurePrices.length * 0.25)] ?? row.importPrice;
    let solarCharge = 0;
    let gridCharge = 0;
    let delivered = 0;
    // Store PV only when its future avoided import value exceeds its current export value.
    if (future.length && highPrice > 0 && highPrice * efficiency > row.exportPrice) {
      solarCharge = Math.max(0, Math.min(row.exportKwh, power, (usable - solarSoc - gridSoc) / efficiency));
      solarSoc += solarCharge * efficiency;
    }
    if (!solarCharge && row.importPrice > 0 && (row.importPrice >= highPrice || !future.length)) {
      delivered = Math.min(row.importKwh, power, solarSoc + gridSoc);
      const solarDelivered = Math.min(solarSoc, delivered);
      solarSoc -= solarDelivered;
      gridSoc -= delivered - solarDelivered;
      result.deliveredSolarKwh += solarDelivered;
      result.deliveredGridKwh += delivered - solarDelivered;
    }
    const futureDemand = future.reduce((sum, hour) => sum + (hour.importPrice > row.importPrice / efficiency + 0.02 ? hour.importKwh : 0), 0);
    const futureSolar = future.reduce((sum, hour) => sum + hour.exportKwh, 0);
    if (!delivered && row.importPrice <= lowPrice && highPrice * efficiency > row.importPrice + 0.02) {
      const target = Math.max(0, Math.min(usable, futureDemand - futureSolar * efficiency) - solarSoc - gridSoc);
      gridCharge = Math.max(0, Math.min(target / efficiency, power - solarCharge));
      gridSoc += gridCharge * efficiency;
    }
    const afterImport = row.importKwh - delivered + gridCharge;
    const afterExport = row.exportKwh - solarCharge;
    result.importBeforeKwh += row.importKwh;
    result.exportBeforeKwh += row.exportKwh;
    result.importAfterKwh += afterImport;
    result.exportAfterKwh += afterExport;
    result.chargedSolarKwh += solarCharge;
    result.chargedFromGridKwh += gridCharge;
    result.baselineCostEur += row.importKwh * row.importPrice - row.exportKwh * row.exportPrice;
    result.batteryCostEur += afterImport * row.importPrice - afterExport * row.exportPrice;
    result.avoidedImportCostEur += (row.importKwh - afterImport) * row.importPrice;
    result.lostExportRevenueEur += solarCharge * row.exportPrice;
  }
  result.savingsEur = result.baselineCostEur - result.batteryCostEur;
  result.lossesKwh = (result.chargedSolarKwh + result.chargedFromGridKwh) * (1 - efficiency);
  result.finalStoredKwh = solarSoc + gridSoc;
  // Based on delivered energy divided by usable capacity; final stored energy is not a completed cycle.
  result.equivalentFullCycles = usable > 0 ? (result.deliveredSolarKwh + result.deliveredGridKwh) / usable : 0;
  return result;
}
