"use strict";

// src/lib/annual-bill/sizingPolicy.ts
var SIZING_POLICIES = { compact: { target: 0.9, label: "Compact" }, spacious: { target: 0.95, label: "Ruim" }, future: { target: 0.97, label: "Toekomstgericht" } };
var SIZING_CONFIG = {
  defaultPolicy: "spacious",
  // Short-duration solar storage: at most three mean days of the limiting energy flow.
  maxStorageDays: 3,
  plateauSteps: 2,
  plateauRelativeGain: 0.01,
  minimumAnnualGainKwh: 50,
  minimumGainPerAddedKwh: 10,
  maxReserveCapacityRatio: 1.5,
  minimumCycles: 40,
  scenarioVariation: 0.25,
  maximumFutureGrowthFraction: 0.5
};

// src/lib/annual-bill/energyBasis.ts
var valid = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0;
function total(value, a, b) {
  if (value != null) return value;
  return a != null && b != null ? a + b : void 0;
}
function resolveAnnualBillEnergyBasis(input) {
  const manualOverride = input.energyInputEdited && input.energyTotalsConfirmed && input.confirmedEnergy;
  const pair = manualOverride || input.physicalEnergy || input.annualizedEnergy || input.confirmedEnergy;
  const source = manualOverride ? "manual" : input.physicalEnergy ? "physical_meter" : input.annualizedEnergy ? "annualized_summary" : input.confirmedEnergy || input.source !== "pdf" ? "manual" : "billing";
  const imp = pair ? pair.gridImportKwh : total(input.totalUsageKwh, input.usageNormalKwh, input.usageOffPeakKwh);
  const exp = pair ? pair.gridExportKwh : total(input.totalFeedInKwh, input.feedInNormalKwh, input.feedInOffPeakKwh);
  const start = pair ? pair.periodStart : input.periodStart;
  const end = pair ? pair.periodEnd : input.periodEnd;
  const periodEndInclusive = (pair ? pair.periodEndInclusive : input.periodEndInclusive) ?? false;
  const date = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? Date.parse(value) : NaN;
  const days = start && end ? (date(end) - date(start)) / 864e5 + Number(periodEndInclusive) : void 0;
  const annualized = pair ? !manualOverride && !!input.annualizedEnergy && !input.physicalEnergy || pair.annualized === true : input.energyVolumesAnnualized === true;
  const warnings = [];
  let status = "usable";
  let confidence = "medium";
  for (const [value, label] of [[imp, "netafname"], [exp, "netteruglevering"]]) {
    if (!valid(value)) {
      status = "insufficient_data";
      warnings.push(`Geen betrouwbaar batterijcapaciteitsadvies mogelijk: jaarlijkse ${label} ontbreekt of is ongeldig.`);
    }
  }
  if (!pair) {
    for (const [value, normal, offPeak] of [[input.totalUsageKwh, input.usageNormalKwh, input.usageOffPeakKwh], [input.totalFeedInKwh, input.feedInNormalKwh, input.feedInOffPeakKwh]]) {
      if (valid(value) && valid(normal) && valid(offPeak) && Math.abs(value - normal - offPeak) > 1) {
        status = "insufficient_data";
        warnings.push("Energietotaal conflicteert met normaal- en dalregisters; corrigeer eerst de fysieke waarden.");
      }
    }
  }
  if (!pair && input.source === "pdf" && !input.energyTotalsConfirmed) {
    status = "insufficient_data";
    warnings.push("Bevestig dat de factuurtotalen fysieke netafname en netteruglevering over dezelfde periode zijn; gesaldeerde waarden zijn niet bruikbaar.");
  }
  if (source === "billing") {
    confidence = "low";
    warnings.push("Generieke factuurtotalen: fysieke energiegrondslag niet afzonderlijk vastgelegd.");
  }
  if (days !== void 0 && (!Number.isFinite(days) || days <= 0 || !annualized && (days < 270 || days > 450))) {
    status = "insufficient_data";
    warnings.push("Factuurperiode ongeschikt voor automatisch jaaradvies (vereist 270\u2013450 dagen of expliciete jaarvolumes).");
  } else if (!annualized && days !== void 0 && (days < 330 || days > 400)) {
    confidence = "low";
    warnings.push("Afwijkende factuurperiode: sterke annualisering, seizoenvertekening mogelijk.");
  }
  if (days === void 0 && !annualized) {
    confidence = "low";
    if (start || end || source !== "manual" && !input.energyTotalsConfirmed) {
      status = "insufficient_data";
      warnings.push("Een volledige representatieve periode of expliciete jaarvolumes ontbreken.");
    } else warnings.push("Periode ontbreekt: handmatig ingevoerde of bevestigde totalen worden als jaarvolumes behandeld.");
  }
  if (input.energyConflicts?.length) {
    status = "insufficient_data";
    warnings.push(...input.energyConflicts);
  }
  const extractionConfidence = pair?.extractionConfidence ?? input.extractionConfidence;
  if (extractionConfidence != null && (!Number.isFinite(extractionConfidence) || extractionConfidence < 0.8)) {
    confidence = "low";
    warnings.push("Extractie vereist controle op conflicten of onzekerheid.");
  }
  const factor = !annualized && days && Number.isFinite(days) && days > 0 ? 365 / days : 1;
  return {
    gridImportKwh: valid(imp) ? imp * factor : 0,
    gridExportKwh: valid(exp) ? exp * factor : 0,
    originalImportKwh: imp,
    originalExportKwh: exp,
    periodStart: start,
    periodEnd: end,
    periodDays: days,
    annualizationFactor: factor,
    source,
    annualized,
    confidence,
    warnings,
    status,
    periodEndInclusive,
    evidence: pair?.evidence
  };
}

// src/lib/annual-bill/buildAnnualBillSyntheticProfile.ts
function annualBillShape(month, hour, weekend, profile) {
  const season = Math.cos((month - 1) * Math.PI / 6);
  const load = profile === "continuous" || profile === "unknown" || profile === "custom" ? 1 : profile === "agricultural" ? hour >= 5 && hour < 23 ? 1.2 : 0.85 : profile === "business" || profile === "office" ? (hour >= 8 && hour < 18 ? 1.8 : 0.35) * (weekend ? 0.45 : 1) : (hour >= 17 && hour < 23 ? 1.9 : hour >= 6 && hour < 9 ? 1.3 : hour < 6 ? 0.4 : 0.8) * (weekend ? 1.08 : 1);
  const daylight = 12 - 4 * season;
  return { load: load * (1 + 0.25 * season), solar: Math.abs(hour - 13) < daylight / 2 ? Math.max(0, Math.sin(Math.PI * (hour - (13 - daylight / 2)) / daylight)) * (1 - 0.7 * season) : 0 };
}
function buildAnnualBillSyntheticProfile(importKwh, exportKwh, profile = "home", variation = 0, custom) {
  if (![importKwh, exportKwh].every((n) => Number.isFinite(n) && n >= 0)) throw new Error("Ongeldige jaarvolumes");
  const weights = Array.from({ length: 365 * 96 }, (_, i) => {
    const date = new Date(Date.UTC(2025, 0, 1) + i * 9e5);
    return { start: date.toISOString(), ...annualBillShape(date.getUTCMonth() + 1, date.getUTCHours() + date.getUTCMinutes() / 60 + 0.125, [0, 6].includes(date.getUTCDay()), profile) };
  });
  if (profile === "custom" && custom && (![custom.dayPercent, custom.nightPercent, custom.weekendPercent].every((n) => Number.isFinite(n) && n >= 0 && n <= 100) || Math.abs(custom.dayPercent + custom.nightPercent - 100) > 0.01)) throw new Error("Maatwerk: dag en nacht moeten samen 100% zijn; weekend is aandeel van de week.");
  for (const row of weights) {
    const d = new Date(row.start);
    const h = d.getUTCHours();
    row.load *= h >= 18 || h < 7 ? 1 + variation : 1 - variation;
  }
  if (profile === "custom" && custom) {
    const category = (start) => {
      const d = new Date(start);
      return [0, 6].includes(d.getUTCDay()) ? 2 : d.getUTCHours() >= 7 && d.getUTCHours() < 19 ? 0 : 1;
    };
    const sums = [0, 0, 0];
    weights.forEach((r) => sums[category(r.start)] += r.load);
    const shares = [(1 - custom.weekendPercent / 100) * custom.dayPercent / 100, (1 - custom.weekendPercent / 100) * custom.nightPercent / 100, custom.weekendPercent / 100];
    weights.forEach((r) => {
      const c = category(r.start);
      r.load *= shares[c] / sums[c];
    });
  }
  const load = weights.reduce((sum, x) => sum + x.load, 0);
  const solar = weights.reduce((sum, x) => sum + x.solar, 0);
  return weights.map((x) => ({ start: x.start, importKwh: importKwh * x.load / load, exportKwh: exportKwh * x.solar / solar }));
}
function dailyStorageStatistics(profile) {
  const days = [];
  let date = "";
  let available = 0;
  let shifted = 0;
  for (const row of profile) {
    const nextDate = row.start.slice(0, 10);
    if (nextDate !== date) {
      if (date) days.push(shifted);
      date = nextDate;
      available = 0;
      shifted = 0;
    }
    const net = row.importKwh - row.exportKwh;
    if (net < 0) available -= net;
    else {
      const used = Math.min(available, net);
      shifted += used;
      available -= used;
    }
  }
  if (date) days.push(shifted);
  days.sort((a, b) => a - b);
  const percentile = (p) => days[Math.ceil(p * days.length) - 1] ?? 0;
  return { p50: percentile(0.5), p75: percentile(0.75), p90: percentile(0.9) };
}

// src/lib/annual-bill/simulateAnnualBillBattery.ts
function simulateAnnualBillBattery(profile, spec, config = {}) {
  const efficiency = Math.sqrt(spec.roundTripEfficiency);
  if (!(efficiency > 0 && efficiency <= 1) || ![spec.capacityKwh, spec.maxChargeKw, spec.maxDischargeKw].every((n) => Number.isFinite(n) && n >= 0)) throw new Error("Ongeldige batterijspecificatie");
  const minimum = config.minimumSocFraction ?? 0.1;
  const emergency = config.emergencyReserveFraction ?? 0;
  if (![minimum, emergency].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) throw new Error("Ongeldige SOC-reserve");
  const reserve = spec.capacityKwh * Math.min(1, minimum + emergency);
  const usableCapacityKwh = spec.capacityKwh - reserve;
  let soc = reserve;
  const empty = () => ({
    annualGridImportReductionKwh: 0,
    annualExportReductionKwh: 0,
    annualChargedFromSolarKwh: 0,
    annualDeliveredFromBatteryKwh: 0,
    annualLossesKwh: 0,
    equivalentCyclesPerYear: 0,
    unusedExportBecauseBatteryFullKwh: 0,
    unusedExportBecausePowerLimitKwh: 0,
    startingSocKwh: soc,
    endingSocKwh: soc,
    minimumObservedSocKwh: soc,
    maximumObservedSocKwh: soc,
    usableCapacityKwh
  });
  let result = empty();
  if (profile.some((row) => ![row.importKwh, row.exportKwh].every((n) => Number.isFinite(n) && n >= 0))) throw new Error("Ongeldige kwartierenergie");
  for (let year = 0; year < 2; year++) {
    result = empty();
    for (const row of profile) {
      const net = row.importKwh - row.exportKwh;
      const exportAvailable = Math.max(0, -net);
      const importAvailable = Math.max(0, net);
      const powerLimited = Math.min(exportAvailable, spec.maxChargeKw * 0.25);
      const charge = Math.max(0, Math.min(powerLimited, (spec.capacityKwh - soc) / efficiency));
      result.unusedExportBecausePowerLimitKwh += exportAvailable - powerLimited;
      result.unusedExportBecauseBatteryFullKwh += powerLimited - charge;
      soc += charge * efficiency;
      result.maximumObservedSocKwh = Math.max(result.maximumObservedSocKwh, soc);
      const delivered = Math.max(0, Math.min(importAvailable, spec.maxDischargeKw * 0.25, (soc - reserve) * efficiency));
      soc -= delivered / efficiency;
      result.minimumObservedSocKwh = Math.min(result.minimumObservedSocKwh, soc);
      result.annualChargedFromSolarKwh += charge;
      result.annualDeliveredFromBatteryKwh += delivered;
      result.annualLossesKwh += charge * (1 - efficiency) + delivered * (1 / efficiency - 1);
    }
  }
  result.endingSocKwh = soc;
  result.annualGridImportReductionKwh = result.annualDeliveredFromBatteryKwh;
  result.annualExportReductionKwh = result.annualChargedFromSolarKwh;
  result.equivalentCyclesPerYear = usableCapacityKwh > 0 ? result.annualDeliveredFromBatteryKwh / efficiency / usableCapacityKwh : 0;
  return result;
}

// lib/batterySpecs.ts
var BASE_BATTERY_SPECS = {
  64: {
    source: "public/assets/64.pdf, pagina 2: ES64/30K-A/EU",
    fallback: true,
    assumptions: "Capaciteit en vermogen uit brochure; round-trip rendement ontbreekt, 90% aangenomen.",
    capacityKwh: 64.3,
    maxChargeKw: 32,
    maxDischargeKw: 30,
    roundTripEfficiency: 0.9
  },
  96: {
    source: "public/assets/96.pdf, pagina 2: ES96/48K-A/EU",
    fallback: true,
    assumptions: "Capaciteit en vermogen uit brochure; round-trip rendement ontbreekt, 90% aangenomen.",
    capacityKwh: 96.46,
    maxChargeKw: 48,
    maxDischargeKw: 48,
    roundTripEfficiency: 0.9
  },
  232: {
    source: "public/assets/232.pdf, pagina 2: ES232/115K-A/EU",
    assumptions: "Nominale capaciteit afgerond op 232 kWh. Brochure Max. Efficiency 90% als systeemeffici\xEBntie ge\xEFnterpreteerd.",
    capacityKwh: 232,
    maxChargeKw: 115,
    maxDischargeKw: 115,
    roundTripEfficiency: 0.9
  },
  261: {
    source: "public/assets/261.pdf, pagina 2: ESS261/125K-A/EU",
    assumptions: "Brochure Max. Efficiency 90% als systeemeffici\xEBntie ge\xEFnterpreteerd.",
    capacityKwh: 261.24,
    maxChargeKw: 125,
    maxDischargeKw: 125,
    roundTripEfficiency: 0.9
  },
  2090: {
    source: "public/assets/2090.pdf, pagina 2: ES2090/1000K-A/EU",
    assumptions: "Brochure Max. Efficiency 90% als systeemeffici\xEBntie ge\xEFnterpreteerd.",
    capacityKwh: 2090,
    maxChargeKw: 1e3,
    maxDischargeKw: 1e3,
    roundTripEfficiency: 0.9
  },
  5015: {
    source: "public/assets/5015.pdf, pagina 2: ES5015/2580K-C/EU",
    assumptions: "Brochure Max. Efficiency 88% als systeemeffici\xEBntie ge\xEFnterpreteerd.",
    capacityKwh: 5015.88,
    maxChargeKw: 2580,
    maxDischargeKw: 2580,
    roundTripEfficiency: 0.88
  }
};
var MODULAR_BASES = [232, 261, 64, 96];
var CONTAINER_2090 = BASE_BATTERY_SPECS[2090];
var CONTAINER_5015 = BASE_BATTERY_SPECS[5015];
var FIXED_CAPACITY_TOLERANCE_KWH = 1;
var MODULAR_TOLERANCE_KWH = 1e-6;
function isNear(value, target, tolerance) {
  return Math.abs(value - target) <= tolerance;
}
function matchFixedContainer(capacityKwh) {
  if (isNear(capacityKwh, CONTAINER_2090.capacityKwh, FIXED_CAPACITY_TOLERANCE_KWH) || isNear(capacityKwh, 2090, FIXED_CAPACITY_TOLERANCE_KWH)) {
    return { ...CONTAINER_2090 };
  }
  if (isNear(capacityKwh, CONTAINER_5015.capacityKwh, FIXED_CAPACITY_TOLERANCE_KWH) || isNear(capacityKwh, 5015, FIXED_CAPACITY_TOLERANCE_KWH)) {
    return { ...CONTAINER_5015 };
  }
  return null;
}
function matchSingleCabinet(capacityKwh) {
  const candidates = [64, 96, 232, 261];
  for (const key of candidates) {
    const spec = BASE_BATTERY_SPECS[key];
    if (isNear(capacityKwh, key, FIXED_CAPACITY_TOLERANCE_KWH) || isNear(capacityKwh, spec.capacityKwh, FIXED_CAPACITY_TOLERANCE_KWH)) {
      return { ...spec };
    }
  }
  return null;
}
function getBatterySpecForCapacity(capacityKwh) {
  if (!Number.isFinite(capacityKwh) || capacityKwh <= 0) {
    return {
      capacityKwh: 0,
      maxChargeKw: 0,
      maxDischargeKw: 0,
      roundTripEfficiency: 0.9
    };
  }
  const fixedContainer = matchFixedContainer(capacityKwh);
  if (fixedContainer) return fixedContainer;
  const singleCabinet = matchSingleCabinet(capacityKwh);
  if (singleCabinet) return singleCabinet;
  for (const baseSize of MODULAR_BASES) {
    const countRaw = capacityKwh / baseSize;
    const count = Math.round(countRaw);
    if (count >= 1 && isNear(countRaw, count, MODULAR_TOLERANCE_KWH)) {
      const baseSpec = BASE_BATTERY_SPECS[baseSize];
      return {
        source: baseSpec.source,
        assumptions: baseSpec.assumptions,
        fallback: baseSpec.fallback,
        capacityKwh,
        maxChargeKw: baseSpec.maxChargeKw * count,
        maxDischargeKw: baseSpec.maxDischargeKw * count,
        roundTripEfficiency: baseSpec.roundTripEfficiency
      };
    }
  }
  return {
    fallback: true,
    source: [7.68, 10.24, 12.8, 15.36, 17.92, 20.48, 23.04].includes(capacityKwh) ? "public/assets/2.5_22.5.pdf, pagina 2: alleen DC-modulespecificatie" : "Geen volledige productspecificatie beschikbaar",
    assumptions: "0,5C AC-laad-/ontlaadvermogen en 90% round-trip rendement aangenomen; omvormer en systeemrendement niet gespecificeerd.",
    capacityKwh,
    maxChargeKw: capacityKwh / 2,
    maxDischargeKw: capacityKwh / 2,
    roundTripEfficiency: 0.9
  };
}

// src/lib/annual-bill/logging.ts
function logAnnualBill(event, traceId, details = {}, level = "info") {
  const line = `[annual-bill] ${JSON.stringify({ timestamp: (/* @__PURE__ */ new Date()).toISOString(), event, traceId: traceId ?? "untracked", ...details })}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

// src/lib/annual-bill/recentDynamicPrices.ts
var HOUR = 36e5;
var DAY = 24 * HOUR;

// src/lib/annual-bill/simulateDynamicAnnualBill.ts
var localParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", month: "numeric", hour: "numeric", weekday: "short", hourCycle: "h23" });
function simulateDynamicBattery(hours, capacity, usableFraction, efficiency = 0.95) {
  const usable = capacity * usableFraction;
  const power = capacity / 2;
  let solarSoc = 0;
  let gridSoc = 0;
  const result = { inverterPowerKw: power, equivalentFullCycles: 0, baselineCostEur: 0, batteryCostEur: 0, avoidedImportCostEur: 0, lostExportRevenueEur: 0, savingsEur: 0, importBeforeKwh: 0, importAfterKwh: 0, exportBeforeKwh: 0, exportAfterKwh: 0, chargedFromGridKwh: 0, chargedSolarKwh: 0, deliveredSolarKwh: 0, deliveredGridKwh: 0, lossesKwh: 0, finalStoredKwh: 0 };
  for (let i = 0; i < hours.length; i++) {
    const row = hours[i];
    const future = hours.slice(i + 1, i + 25);
    const futurePrices = future.map((hour) => hour.importPrice).sort((a, b) => a - b);
    const highPrice = futurePrices[Math.floor(futurePrices.length * 0.75)] ?? row.importPrice;
    const lowPrice = futurePrices[Math.floor(futurePrices.length * 0.25)] ?? row.importPrice;
    let solarCharge = 0;
    let gridCharge = 0;
    let delivered = 0;
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
  result.equivalentFullCycles = usable > 0 ? (result.deliveredSolarKwh + result.deliveredGridKwh) / usable : 0;
  return result;
}

// lib/batteryAdviceOptions.ts
var STACK_BATTERY_OPTIONS_KWH = [7.68, 10.24, 12.8, 15.36, 17.92, 20.48, 23.04];
var BATTERY_ADVICE_OPTIONS_KWH = [
  30,
  40,
  64,
  96,
  232,
  261,
  2090,
  5015,
  ...STACK_BATTERY_OPTIONS_KWH
].sort((a, b) => a - b);

// src/lib/annual-bill/tariffs.ts
var MAX_ABS_ANNUAL_TARIFF = 2;
var DEFAULT_IMPORT_PRICE = 0.3;
var DEFAULT_FEED_IN_PRICE = 0.06;
function isUsableAnnualTariff(value) {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= MAX_ABS_ANNUAL_TARIFF;
}

// src/lib/annual-bill/calculateAnnualBillAdvice.ts
var ROUND_TRIP_EFFICIENCY = 0.95;
var MINIMUM_SOC_FRACTION = 0.1;
var ANNUAL_ENERGY_SAVINGS_TARGET = SIZING_POLICIES.spacious.target;
function selectAnnualBillBatteryByEnergy(options, target = ANNUAL_ENERGY_SAVINGS_TARGET) {
  const maxAnnualSavingsKwh = options.reduce((max, option) => Number.isFinite(option.annualGridImportReductionKwh) ? Math.max(max, option.annualGridImportReductionKwh) : max, 0);
  const compared = [...options].sort((a, b) => a.batteryKwh - b.batteryKwh).map((option) => ({
    ...option,
    percentOfMaximumSavings: maxAnnualSavingsKwh > 0 && Number.isFinite(option.annualGridImportReductionKwh) ? Math.max(0, option.annualGridImportReductionKwh) / maxAnnualSavingsKwh : 0
  }));
  const recommended = maxAnnualSavingsKwh > 0 ? compared.find((option) => option.percentOfMaximumSavings + 1e-12 >= target) ?? null : null;
  return { options: compared, maxAnnualSavingsKwh, recommended };
}
function round2(value) {
  return Math.round(value * 100) / 100;
}
function resolveImportPrice(input) {
  return {
    value: isUsableAnnualTariff(input.averageImportPriceEurPerKwh) ? input.averageImportPriceEurPerKwh : DEFAULT_IMPORT_PRICE,
    usedFallback: !isUsableAnnualTariff(input.averageImportPriceEurPerKwh)
  };
}
function resolveFeedInPrice(input) {
  return {
    value: isUsableAnnualTariff(input.averageFeedInPriceEurPerKwh) ? input.averageFeedInPriceEurPerKwh : DEFAULT_FEED_IN_PRICE,
    usedFallback: !isUsableAnnualTariff(input.averageFeedInPriceEurPerKwh)
  };
}
function positiveFinite(value) {
  return value != null && Number.isFinite(value) && value > 0;
}
function resolveBatteryInvestment(optionKwh, input, optionCount) {
  const quote = input.batteryInvestmentsEurByKwh?.[String(optionKwh)];
  if (positiveFinite(quote)) return { estimatedInvestmentEur: quote, investmentSource: "quoted" };
  const quoteApplies = input.batteryInvestmentCapacityKwh === optionKwh || input.batteryInvestmentCapacityKwh == null && optionCount === 1;
  if (positiveFinite(input.batteryInvestmentEur) && quoteApplies) {
    return { estimatedInvestmentEur: input.batteryInvestmentEur, investmentSource: "quoted" };
  }
  const eurPerKwh = optionKwh <= 20 ? 900 : optionKwh <= 40 ? 775 : 625;
  return { estimatedInvestmentEur: optionKwh * eurPerKwh, investmentSource: "estimated" };
}
function resolveUsableFraction(input) {
  const emergencyReserve = input.emergencyPowerEnabled ? Math.max(0, Math.min(1 - MINIMUM_SOC_FRACTION, (input.emergencyPowerReservePercent ?? 0) / 100)) : 0;
  return Math.max(0, 1 - MINIMUM_SOC_FRACTION - emergencyReserve);
}
function paybackYears(investmentEur, annualSavingsEur) {
  return investmentEur > 0 && annualSavingsEur > 0 ? round2(investmentEur / annualSavingsEur) : null;
}
function rangePayback(investmentEur, savings) {
  return {
    min: paybackYears(investmentEur, savings.max),
    expected: paybackYears(investmentEur, savings.expected),
    max: paybackYears(investmentEur, savings.min)
  };
}
function practicalAnnualBillOptions(options, p90, usableFraction, physicalLimit = Infinity) {
  if (!(p90 > 0) || !Number.isFinite(p90) || !(usableFraction > 0)) return [];
  const limit = Number.isFinite(physicalLimit) ? physicalLimit : p90 * 4 / usableFraction;
  return [...new Set(options)].filter((n) => Number.isFinite(n) && n > 0 && n <= limit).sort((a, b) => a - b);
}
function calculateAnnualBillAdvice(input) {
  const energyBasis = resolveAnnualBillEnergyBasis(input);
  const totalUsageKwh = energyBasis.gridImportKwh;
  const totalFeedInKwh = energyBasis.gridExportKwh;
  const warnings = [...energyBasis.warnings];
  const consumptionProfile = input.consumptionProfile || "unknown";
  const customConsumption = input.customConsumption ?? { dayPercent: 50, nightPercent: 50, weekendPercent: 28.57 };
  let baseConfidence = energyBasis.confidence;
  if (!input.consumptionProfile) {
    baseConfidence = "low";
    warnings.push("Verbruiksprofiel onbekend: kantoor, continu en avondgericht verbruik worden vergeleken.");
  }
  if (input.annualPvProductionKwh != null && input.annualPvProductionKwh > 0 && input.annualPvProductionKwh < totalFeedInKwh) {
    energyBasis.status = "insufficient_data";
    baseConfidence = "low";
    warnings.push("PV-opwek is lager dan netteruglevering: controleer energiegrondslag en periode.");
  }
  if (consumptionProfile === "custom" && input.customConsumption && (![input.customConsumption.dayPercent, input.customConsumption.nightPercent, input.customConsumption.weekendPercent].every((n) => Number.isFinite(n) && n >= 0 && n <= 100) || Math.abs(input.customConsumption.dayPercent + input.customConsumption.nightPercent - 100) > 0.01)) {
    energyBasis.status = "insufficient_data";
    warnings.push("Maatwerkverdeling ongeldig: dag en nacht moeten samen 100% zijn.");
  }
  const profile = energyBasis.status === "usable" ? buildAnnualBillSyntheticProfile(totalUsageKwh, totalFeedInKwh, consumptionProfile, 0, customConsumption) : [];
  const storageStatistics = energyBasis.status === "usable" ? dailyStorageStatistics(profile) : void 0;
  const usableFraction = resolveUsableFraction(input);
  const emergencyReserveFraction = 1 - MINIMUM_SOC_FRACTION - usableFraction;
  const sizingPolicy = input.sizingPolicy ?? SIZING_CONFIG.defaultPolicy;
  const target = SIZING_POLICIES[sizingPolicy].target;
  const scenarioProfiles = energyBasis.status !== "usable" ? [] : consumptionProfile === "unknown" ? ["office", "continuous", "home"].map((p) => buildAnnualBillSyntheticProfile(totalUsageKwh, totalFeedInKwh, p)) : [-SIZING_CONFIG.scenarioVariation, 0, SIZING_CONFIG.scenarioVariation].map((v) => buildAnnualBillSyntheticProfile(totalUsageKwh, totalFeedInKwh, consumptionProfile, v, customConsumption));
  const scenarioLabels = consumptionProfile === "unknown" ? ["Kantoor", "Continu", "Woning/avond"] : ["Meer dagverbruik", "Verwacht", "Meer avond/nacht"];
  if (energyBasis.status === "usable" && sizingPolicy === "future" && input.futureAdditionalImportKwh != null) {
    if (!Number.isFinite(input.futureAdditionalImportKwh) || input.futureAdditionalImportKwh < 0 || input.futureAdditionalImportKwh > totalUsageKwh * SIZING_CONFIG.maximumFutureGrowthFraction) {
      warnings.push("Toekomstige groei ongeldig of groter dan 50%; afzonderlijke analyse nodig.");
      baseConfidence = "low";
    } else {
      scenarioLabels.push("Expliciete toekomstige groei");
      scenarioProfiles.push(buildAnnualBillSyntheticProfile(totalUsageKwh + input.futureAdditionalImportKwh, totalFeedInKwh, consumptionProfile, SIZING_CONFIG.scenarioVariation, customConsumption));
    }
  }
  const scenarioStats = scenarioProfiles.map(dailyStorageStatistics);
  const dailyNeed = Math.max(0, ...scenarioStats.map((s) => Math.max(s.p90, s.p75 * 1.25, s.p50 * 1.5)));
  const physicalLimit = usableFraction > 0 ? SIZING_CONFIG.maxStorageDays * Math.min(totalUsageKwh, totalFeedInKwh) / 365 / usableFraction : 0;
  const batteryOptions = energyBasis.status === "usable" && totalUsageKwh > 0 && totalFeedInKwh > 0 ? practicalAnnualBillOptions(input.batteryOptionsKwh ?? BATTERY_ADVICE_OPTIONS_KWH, dailyNeed, usableFraction, physicalLimit) : [];
  if (dailyNeed > 0 && !batteryOptions.length) warnings.push("Geen catalogusbatterij binnen de fysieke bovengrens; een kleinere opslagoplossing kan passend zijn.");
  const importPrice = resolveImportPrice(input);
  const feedInPrice = resolveFeedInPrice(input);
  if (!input.dynamicContext && importPrice.usedFallback) warnings.push("Importprijs ontbreekt; informatieve berekening gebruikt EUR 0,30/kWh.");
  if (!input.dynamicContext && feedInPrice.usedFallback) warnings.push("Terugleververgoeding ontbreekt; informatieve berekening gebruikt EUR 0,06/kWh.");
  if (input.dynamicContext) warnings.push(
    ...input.dynamicContext.metadata.warnings,
    "Dynamische euroberekening is een apart legacy handelsmodel met 0,5C en 95% rendement; dit bepaalt de technische capaciteit niet."
  );
  if (input.batteryInvestmentEur != null && (!positiveFinite(input.batteryInvestmentEur) || (input.batteryInvestmentCapacityKwh == null ? batteryOptions.length !== 1 : !batteryOptions.includes(input.batteryInvestmentCapacityKwh)))) {
    warnings.push("Het investeringsbedrag is niet gebruikt: koppel een positief bedrag aan de bijbehorende capaciteit.");
  }
  if (Object.values(input.batteryInvestmentsEurByKwh ?? {}).some((n) => !positiveFinite(n))) warnings.push("Ongeldige investeringen per optie: indicatieve prijsraming gebruikt.");
  const simulatedOptions = batteryOptions.map((batteryKwh) => {
    const spec = getBatterySpecForCapacity(batteryKwh);
    const technicalSimulation = simulateAnnualBillBattery(profile, spec, { minimumSocFraction: MINIMUM_SOC_FRACTION, emergencyReserveFraction });
    if (spec.fallback) warnings.push(`${batteryKwh} kWh: fallback-specificatie; ${spec.assumptions ?? "0,5C en 90% rendement aangenomen wegens ontbrekende productspecificatie."}`);
    const investment = resolveBatteryInvestment(batteryKwh, input, batteryOptions.length);
    const dynamicSimulation = input.dynamicContext ? simulateDynamicBattery(input.dynamicContext.hours, batteryKwh, usableFraction, ROUND_TRIP_EFFICIENCY) : void 0;
    const savings = dynamicSimulation?.savingsEur ?? technicalSimulation.annualGridImportReductionKwh * importPrice.value - technicalSimulation.annualExportReductionKwh * feedInPrice.value;
    const scenarioImportReductionKwh = scenarioProfiles.map((p) => simulateAnnualBillBattery(p, spec, { minimumSocFraction: MINIMUM_SOC_FRACTION, emergencyReserveFraction }).annualGridImportReductionKwh);
    const selectionEnergyKwh = scenarioImportReductionKwh.reduce((a, b) => a + b, 0) / Math.max(1, scenarioImportReductionKwh.length);
    return {
      scenarioImportReductionKwh,
      selectionEnergyKwh,
      batteryKwh,
      technicalSimulation,
      dynamicSimulation,
      annualGridImportReductionKwh: technicalSimulation.annualGridImportReductionKwh,
      annualExportReductionKwh: technicalSimulation.annualExportReductionKwh,
      // Compatibility alias: delivered solar energy / avoided grid import, not charge input.
      estimatedAnnualStoredSolarKwh: technicalSimulation.annualGridImportReductionKwh,
      usableCapacityKwh: technicalSimulation.usableCapacityKwh,
      estimatedAnnualSavingsEur: round2(savings),
      ...investment,
      estimatedPaybackYears: paybackYears(investment.estimatedInvestmentEur, savings),
      utilizationScore: Math.min(1, technicalSimulation.equivalentCyclesPerYear / 365),
      confidence: spec.fallback ? "low" : baseConfidence,
      specSource: spec.fallback ? "fallback" : "product",
      explanation: `Fysiek gesimuleerd: ${round2(technicalSimulation.annualGridImportReductionKwh)} kWh minder netafname per jaar. Financi\xEBn uitsluitend informatief.`
    };
  });
  const selection = selectAnnualBillBatteryByEnergy(simulatedOptions, target);
  const maximum = Math.max(0, ...simulatedOptions.map((o) => o.selectionEnergyKwh));
  let best = 0;
  let flatSteps = 0;
  for (const o of simulatedOptions) {
    const gain = Math.max(0, o.selectionEnergyKwh - best);
    flatSteps = gain <= maximum * SIZING_CONFIG.plateauRelativeGain ? flatSteps + 1 : 0;
    best = Math.max(best, o.selectionEnergyKwh);
  }
  const practicalMaximumReliable = flatSteps >= SIZING_CONFIG.plateauSteps;
  if (maximum > 0 && !practicalMaximumReliable) {
    baseConfidence = "low";
    warnings.push("Praktisch maximum niet betrouwbaar vastgesteld binnen de technische bovengrens/catalogus; percentages gelden uitsluitend voor onderzochte opties.");
  }
  const choose = (fraction, energies = simulatedOptions.map((o) => o.selectionEnergyKwh)) => {
    const max = Math.max(0, ...energies);
    if (!max) return void 0;
    let chosen = simulatedOptions.findIndex((o, i) => energies[i] >= fraction * max - 1e-9);
    while (chosen > 0) {
      const prev = chosen - 1;
      const gain = energies[chosen] - energies[prev];
      const added = simulatedOptions[chosen].batteryKwh - simulatedOptions[prev].batteryKwh;
      if (gain >= SIZING_CONFIG.minimumAnnualGainKwh && gain / added >= SIZING_CONFIG.minimumGainPerAddedKwh) break;
      chosen--;
    }
    return simulatedOptions[chosen];
  };
  const scenarioCapacities = scenarioProfiles.map((_, i) => choose(target, simulatedOptions.map((o) => o.scenarioImportReductionKwh[i]))?.batteryKwh).filter((n) => n != null);
  let selected = choose(target);
  const compact = choose(SIZING_POLICIES.compact.target);
  if (selected && sizingPolicy !== "compact") {
    const next = simulatedOptions[simulatedOptions.indexOf(selected) + 1];
    const gain = next ? next.selectionEnergyKwh - selected.selectionEnergyKwh : 0;
    if (next && scenarioCapacities.some((n) => n > selected.batteryKwh) && next.batteryKwh / selected.batteryKwh <= SIZING_CONFIG.maxReserveCapacityRatio && gain >= SIZING_CONFIG.minimumAnnualGainKwh && gain / (next.batteryKwh - selected.batteryKwh) >= SIZING_CONFIG.minimumGainPerAddedKwh && next.technicalSimulation.equivalentCyclesPerYear >= SIZING_CONFIG.minimumCycles) selected = next;
  }
  const selectionExplanation = `${SIZING_POLICIES[sizingPolicy].label}: doel ${target * 100}% van het onderzochte opslagpotentieel, op basis van gelijk gewogen plausibele scenarios. Extra capaciteit vereist minstens ${SIZING_CONFIG.minimumAnnualGainKwh} kWh/jaar en ${SIZING_CONFIG.minimumGainPerAddedKwh} kWh/jaar per extra kWh capaciteit. Geen vaste capaciteitsopslag; noodstroomreserve is afzonderlijk afgetrokken.`;
  const options = selection.options.map((option, index, all) => {
    const previous = all[index - 1];
    const marginalGainKwh = previous ? option.annualGridImportReductionKwh - previous.annualGridImportReductionKwh : option.annualGridImportReductionKwh;
    return { ...option, marginalGainKwh, marginalGainPerAddedKwh: marginalGainKwh / (option.batteryKwh - (previous?.batteryKwh ?? 0)) };
  });
  const recommended = options.find((x) => x.batteryKwh === selected?.batteryKwh);
  if (options.some((x) => x.investmentSource === "estimated")) warnings.push("Investering is een indicatieve prijsraming, geen offerte; uitsluitend gebruikt voor informatieve terugverdientijd.");
  warnings.push(
    "Indicatief advies op basis van jaarnota; kwartierdata geeft een nauwkeuriger dimensionering.",
    "Geschatte seizoen- en weekpatronen; alleen netto kwartieroverschot of -tekort is beschikbaar voor de batterij. Bruto jaartotalen blijven behouden. P75 is uitsluitend een basisindicatie. Geen degradatie of gemeten pieken; financi\xEBle band \xB125% is een modelaanname."
  );
  const expected = recommended?.estimatedAnnualSavingsEur ?? 0;
  const annualSavingsRangeEur = { min: round2(Math.min(expected * 0.75, expected * 1.25)), expected, max: round2(Math.max(expected * 0.75, expected * 1.25)) };
  const recommendationStatus = energyBasis.status === "insufficient_data" ? "insufficient_data" : recommended ? "recommended" : "no_solar_shift";
  logAnnualBill("calculation.ranking", input.traceId, { recommendedBatteryKwh: recommended?.batteryKwh ?? null, recommendationStatus, rankingMethod: "scenario_energy_v3", maxAnnualSavingsKwh: selection.maxAnnualSavingsKwh });
  return {
    energyBasis,
    consumptionProfile,
    storageStatistics,
    recommendationStatus,
    savingsCalculationStatus: recommendationStatus === "insufficient_data" ? "not_calculated" : "calculated",
    sizingPolicy,
    scenarioLabels,
    practicalMaximumReliable,
    selectionExplanation,
    scenarioCapacityRange: scenarioCapacities.length ? { min: Math.min(...scenarioCapacities), max: Math.max(...scenarioCapacities) } : void 0,
    conservativeBatteryKwh: compact?.batteryKwh ?? null,
    spaciousBatteryKwh: choose(0.95)?.batteryKwh ?? null,
    dynamicPricing: input.dynamicContext?.metadata,
    recommendedBatteryKwh: recommended?.batteryKwh ?? null,
    totalUsageKwh,
    totalFeedInKwh,
    estimatedPvProductionKwh: input.annualPvProductionKwh,
    options,
    annualSavingsRangeEur,
    paybackRangeYears: rangePayback(recommended?.estimatedInvestmentEur ?? 0, annualSavingsRangeEur),
    confidence: energyBasis.status === "insufficient_data" || !practicalMaximumReliable ? "low" : recommended?.confidence ?? baseConfidence,
    minimumSocPercent: 10,
    efficiencyPercent: recommended ? getBatterySpecForCapacity(recommended.batteryKwh).roundTripEfficiency * 100 : 90,
    emergencyPowerReservePercent: emergencyReserveFraction * 100,
    warnings,
    explanation: recommendationStatus === "insufficient_data" ? "Geen betrouwbaar batterijcapaciteitsadvies mogelijk: controleer de energiegrondslag." : recommended ? `${recommended.batteryKwh} kWh is geselecteerd. ${selectionExplanation} Deze batterij benut ${(recommended.percentOfMaximumSavings * 100).toFixed(1)}% van de verwachte reductie binnen de onderzochte opties. ${practicalMaximumReliable ? "De marginale winst vlakt over meerdere capaciteiten af." : "Het praktische maximum is onzeker; geen gegarandeerde doelrealisatie."} Financi?n bepalen de capaciteit niet.` : dailyNeed > 0 && !batteryOptions.length ? "Geen passende catalogusbatterij binnen de technische bovengrens. Dit betekent niet dat opslagpotentieel ontbreekt." : "Op basis van de beschikbare teruglevering is geen PV-opslagbatterij aanbevolen."
  };
}

// scripts/check-annual-bill-v3.ts
var cases = [
  { name: "Kleine woning", imp: 2e3, exp: 300, profile: "home" },
  { name: "Gemiddelde woning", imp: 4200, exp: 1800, profile: "home" },
  { name: "Hoge netafname woning", imp: 12e3, exp: 6e3, profile: "home" },
  ...["office", "agricultural", "continuous"].map((profile) => ({ name: "Eneco " + profile, imp: 35444 * 365 / 363, exp: 16439 * 365 / 363, profile })),
  { name: "Groot bedrijf", imp: 35e4, exp: 16e4, profile: "continuous" }
];
var output = console.log;
console.log = () => {
};
console.info = () => {
};
output(JSON.stringify(cases.map((c) => {
  const input = { source: "manual", totalUsageKwh: c.imp, totalFeedInKwh: c.exp, consumptionProfile: c.profile };
  const compact = calculateAnnualBillAdvice({ ...input, sizingPolicy: "compact" });
  const roomy = calculateAnnualBillAdvice(input);
  const profile = buildAnnualBillSyntheticProfile(c.imp, c.exp, c.profile);
  const limit = dailyStorageStatistics(profile).p90 / 0.9 * 1.25;
  const capacities = [...BATTERY_ADVICE_OPTIONS_KWH.filter((n) => n <= limit), ...BATTERY_ADVICE_OPTIONS_KWH.filter((n) => n > limit).slice(0, 2)];
  const v2 = capacities.map((n) => ({ capacity: n, energy: simulateAnnualBillBattery(profile, getBatterySpecForCapacity(n)).annualGridImportReductionKwh }));
  const max = Math.max(...v2.map((o) => o.energy));
  return { name: c.name, v2: v2.find((o) => o.energy >= max * 0.9)?.capacity, compact: compact.recommendedBatteryKwh, spacious: roomy.recommendedBatteryKwh, reliable: roomy.practicalMaximumReliable, range: roomy.scenarioCapacityRange, candidates: roomy.options.map((o) => ({ capacity: o.batteryKwh, energy: o.annualGridImportReductionKwh, extra: o.marginalGainKwh, scenarios: o.scenarioImportReductionKwh })) };
}), null, 2));
