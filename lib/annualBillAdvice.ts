import type { AnalysisResult, AnalysisSettings, AnnualBillInput } from './analysis';
import type { ScenarioResult } from './simulation';
import type { MarketYear } from '../src/lib/annual-bill/recentDynamicPrices';
import { prepareDynamicAnnualContext } from '../src/lib/annual-bill/simulateDynamicAnnualBill';
import { calculateAnnualBillAdvice } from '../src/lib/annual-bill/calculateAnnualBillAdvice';
import { resolveAnnualBillEnergyBasis } from '../src/lib/annual-bill/energyBasis';
import { resolveAnnualBillPrices, annualBillPriceWarnings } from '../src/lib/annual-bill/tariffs';
import { getBatterySpecForCapacity } from './batterySpecs';

/** Annual advice has one technical source. No quarter-data sizing engine is invoked. */
export function buildAnnualBillIndicativeAnalysis(input: AnnualBillInput, settings: AnalysisSettings, marketYear?: MarketYear): AnalysisResult | null {
  const basis = resolveAnnualBillEnergyBasis(input);
  const prices = resolveAnnualBillPrices(input);
  let dynamicContext;
  let financeWarning: string | undefined;
  try {
    dynamicContext = input.contractType === 'dynamic' && marketYear && basis.status === 'usable'
      ? prepareDynamicAnnualContext(input, marketYear, basis.gridImportKwh, basis.gridExportKwh) : undefined;
  } catch {
    financeWarning = 'Dynamisch financieel model niet beschikbaar door ongeldige prijzen of financiële invoer; technische dimensionering blijft beschikbaar.';
  }
  const advice = calculateAnnualBillAdvice({ ...input,
    averageImportPriceEurPerKwh: prices.importSource === 'fallback' ? undefined : prices.importPrice,
    averageFeedInPriceEurPerKwh: prices.feedInPrice,
    emergencyPowerEnabled: settings.emergencyPowerEnabled,
    emergencyPowerReservePercent: settings.emergencyPowerReservePercent,
    dynamicContext
  });
  if (input.contractType === 'dynamic' && !marketYear) advice.warnings.push('Dynamische marktprijzen ontbreken: technische capaciteit beschikbaar, euroberekening gebruikt indicatieve gemiddelde tarieven.');
  if (financeWarning) advice.warnings.push(financeWarning);
  if (input.contractType !== 'dynamic') advice.warnings.push(...annualBillPriceWarnings(input));
  const recommended = advice.options.find(x => x.batteryKwh === advice.recommendedBatteryKwh);
  const product = (capacity: number | null | undefined) => capacity == null ? null : ({
    label: `${capacity} kWh`, capacityKwh: capacity, powerKw: getBatterySpecForCapacity(capacity).maxDischargeKw
  });
  const scenarios: ScenarioResult[] = advice.options.map(option => {
    const sim = option.technicalSimulation!;
    const spec = getBatterySpecForCapacity(option.batteryKwh);
    return {
      optionLabel: `${option.batteryKwh} kWh`, capacityKwh: option.batteryKwh, usableCapacityKwh: sim.usableCapacityKwh,
      exceedanceIntervalsBefore: 0, exceedanceIntervalsAfter: 0, exceedanceEnergyKwhBefore: 0, exceedanceEnergyKwhAfter: 0,
      achievedComplianceDataset: 0, achievedComplianceDailyAverage: 0, achievedCompliance: 0, maxRemainingExcessKw: 0,
      maxChargeKw: spec.maxChargeKw, maxDischargeKw: spec.maxDischargeKw, endingSocKwh: sim.endingSocKwh, shavedSeries: [],
      importedEnergyBeforeKwh: advice.totalUsageKwh, importedEnergyAfterKwh: advice.totalUsageKwh - sim.annualGridImportReductionKwh,
      exportedEnergyBeforeKwh: advice.totalFeedInKwh, exportedEnergyAfterKwh: advice.totalFeedInKwh - sim.annualExportReductionKwh,
      importReductionKwh: sim.annualGridImportReductionKwh, storedPvUsedOnsiteKwh: sim.annualDeliveredFromBatteryKwh,
      importReductionKwhAnnualized: sim.annualGridImportReductionKwh, exportReductionKwhAnnualized: sim.annualExportReductionKwh,
      chargedKwhAnnualized: sim.annualChargedFromSolarKwh, dischargedKwhAnnualized: sim.annualDeliveredFromBatteryKwh,
      cyclesPerYear: sim.equivalentCyclesPerYear, marginalGainPerAddedKwh: option.marginalGainPerAddedKwh,
      annualValueEur: option.estimatedAnnualSavingsEur, limitations: ['Synthetisch jaarnotaprofiel; geen gemeten kwartierdata.']
    };
  });
  return {
    analysisType: 'PV_SELF_CONSUMPTION', intervals: [], events: [], peakMoments: [], scenarios,
    sizing: { kWhNeededRaw: advice.storageStatistics?.p75 ?? 0, kWNeededRaw: 0,
      kWhNeeded: advice.recommendedBatteryKwh ?? 0, kWNeeded: recommended ? getBatterySpecForCapacity(recommended.batteryKwh).maxDischargeKw : 0,
      recommendedProduct: product(advice.recommendedBatteryKwh), alternativeProduct: product(advice.spaciousBatteryKwh), noFeasibleBatteryByPower: false },
    highestPeakDay: null, maxObservedKw: 0, maxObservedTimestamp: null, exceedanceIntervals: 0, topExceededIntervals: [],
    normalizationDiagnostics: { interpretationRequested: 'INTERVAL', interpretationUsed: 'INTERVAL', rowsTotal: 0, rowsUsed: 0,
      invalidRows: 0, countOutliers: 0, maxOutlierKw: null, firstOutlierTimestamp: null, negativeDeltaCount: 0,
      fractionNonDecreasing: 0, medianDelta: 0, fractionHugeValues: 0, series: {}, warnings: [] },
    quality: { rows: 0, startDate: input.periodStart ?? null, endDate: input.periodEnd ?? null, missingIntervalsCount: 0,
      duplicateCount: 0, non15MinIntervals: 0, warnings: [] },
    pvSummary: null, pvWarnings: advice.warnings, annualBillAdvice: advice, annualBillInput: input
  };
}
