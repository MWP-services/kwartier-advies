import { NextResponse } from 'next/server';
import type { AnalysisResult } from '@/lib/analysis';
import type { AnalysisSettings } from '@/lib/analysis';
import type { AnnualBillInput } from '@/lib/analysis';
import type { ColumnMapping } from '@/lib/parsing';
import type { PvBatterySimulationResult, PvSelfConsumptionAdviceResult, SizingResult } from '@/lib/calculations';
import type { ScenarioResult } from '@/lib/simulation';
import { buildAnnualBillIndicativeAnalysis } from '@/lib/annualBillAdvice';
import { runAnalysis } from '@/lib/clientAnalysis';
import { mapRows } from '@/lib/parsing';
import { getUploadedDataset, storeAnalysisResult } from '@/lib/serverDataStore';

export const runtime = 'nodejs';

interface AnalyzeRequestBody {
  uploadId?: string;
  rows?: Record<string, unknown>[];
  mapping?: ColumnMapping;
  settings?: AnalysisSettings;
  annualBillInput?: AnnualBillInput;
}

function compactScenarioResult(scenario: ScenarioResult): ScenarioResult {
  return {
    ...scenario,
    shavedSeries: [],
    socSeries: []
  };
}

function compactPvBatterySimulationResult(scenario: PvBatterySimulationResult): PvBatterySimulationResult {
  const compactScenario = { ...scenario };
  delete compactScenario.valueByInterval;
  delete compactScenario.socSeries;
  return compactScenario;
}

function compactPvSelfConsumptionAdvice(
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

function compactSizingResult(sizing: SizingResult): SizingResult {
  return {
    ...sizing,
    pvSelfConsumptionAdvice: compactPvSelfConsumptionAdvice(sizing.pvSelfConsumptionAdvice)
  };
}

function compactAnalysisResult(result: AnalysisResult, analysisId: string): AnalysisResult & { analysisId: string } {
  return {
    ...result,
    analysisId,
    sizing: compactSizingResult(result.sizing),
    scenarios: result.scenarios.map(compactScenarioResult)
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AnalyzeRequestBody;

    if (!body.settings) {
      return NextResponse.json({ error: 'Ongeldige analyse-aanvraag.' }, { status: 400 });
    }

    if (body.settings.analysisType === 'PV_SELF_CONSUMPTION' && body.settings.pvInputMode !== 'intervalData') {
      if (!body.annualBillInput) {
        return NextResponse.json({ error: 'Vul eerst de jaarnota-gegevens in.' }, { status: 400 });
      }

      const result = buildAnnualBillIndicativeAnalysis(body.annualBillInput, body.settings);
      if (!result) {
        return NextResponse.json(
          { error: 'Voor indicatief jaarnota-advies zijn minimaal totaal verbruik en totale teruglevering nodig.' },
          { status: 422 }
        );
      }

      const analysisId = storeAnalysisResult(result);
      return NextResponse.json(compactAnalysisResult(result, analysisId));
    }

    if ((!Array.isArray(body.rows) && !body.uploadId) || !body.mapping) {
      return NextResponse.json({ error: 'Ongeldige analyse-aanvraag.' }, { status: 400 });
    }

    const rows = body.uploadId ? getUploadedDataset(body.uploadId)?.rows : body.rows;
    if (!rows) {
      return NextResponse.json({ error: 'Upload niet gevonden. Upload het bestand opnieuw.' }, { status: 404 });
    }

    const mappedRows = mapRows(rows, body.mapping);
    const result = runAnalysis(mappedRows, body.settings);

    if (!result) {
      return NextResponse.json({ error: 'Geen bruikbare rijen na normalisatie of filtering.' }, { status: 422 });
    }

    const analysisId = storeAnalysisResult(result);
    return NextResponse.json(compactAnalysisResult(result, analysisId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analyse op de server is mislukt.' },
      { status: 500 }
    );
  }
}
