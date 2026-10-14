import { calculateAnnualBillAdvice } from '../src/lib/annual-bill/calculateAnnualBillAdvice';
import { buildAnnualBillSyntheticProfile, dailyStorageStatistics, type ConsumptionProfile } from '../src/lib/annual-bill/buildAnnualBillSyntheticProfile';
import { simulateAnnualBillBattery } from '../src/lib/annual-bill/simulateAnnualBillBattery';
import { BATTERY_ADVICE_OPTIONS_KWH } from '../lib/batteryAdviceOptions';
import { getBatterySpecForCapacity } from '../lib/batterySpecs';
const cases = [
  { name: 'Kleine woning', imp: 2000, exp: 300, profile: 'home' },
  { name: 'Gemiddelde woning', imp: 4200, exp: 1800, profile: 'home' },
  { name: 'Hoge netafname woning', imp: 12000, exp: 6000, profile: 'home' },
  ...['office','agricultural','continuous'].map(profile => ({ name: 'Eneco '+profile, imp: 35444*365/363, exp: 16439*365/363, profile })),
  { name: 'Groot bedrijf', imp: 350000, exp: 160000, profile: 'continuous' }
];
const output = console.log; console.log = () => {}; console.info = () => {};
output(JSON.stringify(cases.map(c => {
 const input = { source: 'manual' as const, totalUsageKwh: c.imp, totalFeedInKwh: c.exp, consumptionProfile: c.profile as ConsumptionProfile };
 const compact = calculateAnnualBillAdvice({...input,sizingPolicy:'compact'});
 const roomy = calculateAnnualBillAdvice(input);
 // Reproduce V2 candidate rule and 90% selection with the same underlying physics.
 const profile = buildAnnualBillSyntheticProfile(c.imp,c.exp,c.profile as ConsumptionProfile);
 const limit = dailyStorageStatistics(profile).p90/0.9*1.25;
 const capacities = [...BATTERY_ADVICE_OPTIONS_KWH.filter(n=>n<=limit),...BATTERY_ADVICE_OPTIONS_KWH.filter(n=>n>limit).slice(0,2)];
 const v2 = capacities.map(n=>({capacity:n,energy:simulateAnnualBillBattery(profile,getBatterySpecForCapacity(n)).annualGridImportReductionKwh}));
 const max = Math.max(...v2.map(o=>o.energy));
 return { name:c.name, v2: v2.find(o=>o.energy>=max*0.9)?.capacity, compact:compact.recommendedBatteryKwh, spacious:roomy.recommendedBatteryKwh, reliable:roomy.practicalMaximumReliable, range:roomy.scenarioCapacityRange, candidates:roomy.options.map(o=>({capacity:o.batteryKwh,energy:o.annualGridImportReductionKwh,extra:o.marginalGainKwh,scenarios:o.scenarioImportReductionKwh})) };
}),null,2));
