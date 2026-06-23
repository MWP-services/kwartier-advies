import type { AnalysisResult } from './analysis';
import type { PvBatterySimulationResult, PvSelfConsumptionAdviceResult, SizingResult } from './calculations';
import type { ScenarioResult } from './simulation';

export function compactScenarioResult(scenario: ScenarioResult): ScenarioResult {
  return {
    ...scenario,
    shavedSeries: [],
    socSeries: []
  };
}

export function compactPvBatterySimulationResult(scenario: PvBatterySimulationResult): PvBatterySimulationResult {
  const compactScenario = { ...scenario };
  delete compactScenario.valueByInterval;
  delete compactScenario.socSeries;
  return compactScenario;
}

export function compactPvSelfConsumptionAdvice(
  advice: PvSelfConsumptionAdviceResult | null | undefined
): PvSelfConsumptionAdviceResult | null | undefined {
  if (!advice) return advice;

  return {
    ...advice,
    simulationAdvice: {
      conservative: compactPvBatterySimulationResult(advice.simulationAdvice.conservative),
      recommended: compactPvBatterySimulationResult(advice.simulationAdvice.recommended),
      spacious: compactPvBatterySimulationResult(advice.simulationAdvice.spacious),
      allScenarios: advice.simulationAdvice.allScenarios.map(compactPvBatterySimulationResult)
    }
  };
}

export function compactSizingResult(sizing: SizingResult): SizingResult {
  return {
    ...sizing,
    pvSelfConsumptionAdvice: compactPvSelfConsumptionAdvice(sizing.pvSelfConsumptionAdvice)
  };
}

export function compactAnalysisResult(result: AnalysisResult, analysisId: string): AnalysisResult & { analysisId: string } {
  return {
    ...result,
    analysisId,
    sizing: compactSizingResult(result.sizing),
    scenarios: result.scenarios.map(compactScenarioResult)
  };
}
