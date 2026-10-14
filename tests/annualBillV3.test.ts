import { describe, it, expect } from 'vitest';
import { calculateAnnualBillAdvice as calculate } from '../src/lib/annual-bill/calculateAnnualBillAdvice';
import { buildAnnualBillSyntheticProfile } from '../src/lib/annual-bill/buildAnnualBillSyntheticProfile';
const eneco = { physicalEnergy: { gridImportKwh: 35444, gridExportKwh: 16439, periodStart: '2024-10-01', periodEnd: '2025-09-29' }, totalUsageKwh: 19005 };
describe('V3 physical and scenario sizing', () => {
 it.each(['office','agricultural','continuous','home'] as const)('compares policies for %s without truncating relevant Eneco options', consumptionProfile => {
  const input = {...eneco, consumptionProfile}; const compact = calculate({...input,sizingPolicy:'compact'}); const spacious = calculate(input); const future = calculate({...input,sizingPolicy:'future',futureAdditionalImportKwh:2000});
  expect(spacious.totalUsageKwh).toBeCloseTo(35444*365/363);
  expect(spacious.energyBasis?.periodDays).toBe(363);
  expect(spacious.options.map(o=>o.batteryKwh)).toEqual(expect.arrayContaining([12.8,20.48,30,40,64,96]));
  expect(compact.recommendedBatteryKwh!).toBeLessThanOrEqual(spacious.recommendedBatteryKwh!);
  expect(future.recommendedBatteryKwh!).toBeLessThan(2000);
  expect(spacious.options.every(o=>o.scenarioImportReductionKwh?.length===3)).toBe(true);
  expect(spacious).toEqual(calculate({...input,batteryOptionsKwh:[7.68,10.24,12.8,15.36,17.92,20.48,23.04,30,40,64,96,232,261,2090,5015,10000]}));
 });
 it('preserves annual totals across plausible profiles and custom shares', () => {
  for(const p of ['home','office','agricultural','continuous','custom'] as const){
   const rows=buildAnnualBillSyntheticProfile(35444,16439,p,0,{dayPercent:40,nightPercent:60,weekendPercent:30});
   expect(rows.reduce((s,r)=>s+r.importKwh,0)).toBeCloseTo(35444,6);
   expect(rows.reduce((s,r)=>s+r.exportKwh,0)).toBeCloseTo(16439,6);
  }
 });
 it('rejects invalid custom data and retains conflict protection',()=>{
  expect(calculate({...eneco,consumptionProfile:'custom',customConsumption:{dayPercent:80,nightPercent:80,weekendPercent:20}}).recommendationStatus).toBe('insufficient_data');
  expect(calculate({...eneco,energyConflicts:['overlap']}).recommendationStatus).toBe('insufficient_data');
 });
 it('does not claim a reliable maximum from one candidate',()=>{
  const r=calculate({...eneco,batteryOptionsKwh:[30]}); expect(r.practicalMaximumReliable).toBe(false); expect(r.confidence).toBe('low');
 });
});
