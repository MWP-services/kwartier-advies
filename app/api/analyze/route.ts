import { NextResponse } from 'next/server';
import type { AnalyzeRequestBody, PersistedAnalyzeInput } from '@/lib/analysisJobTypes';
import { jsonError } from '@/lib/apiResponses';
import { getAnalysisJobStore, toStartAnalysisJobResponse } from '@/lib/analysisJobStore';
import { ensureAnalysisWorkerStarted } from '@/lib/analysisWorker';
import { getUploadedDataset } from '@/lib/serverDataStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_DIRECT_ROWS = 200_000;

function elapsedMs(start: number): number {
  return Math.round(performance.now() - start);
}

function logAnalyzeStart(message: string, extra?: Record<string, unknown>): void {
  if (extra) {
    console.log(`[analyze] start ${message}`, extra);
    return;
  }
  console.log(`[analyze] start ${message}`);
}

function validateAndPersistInput(body: AnalyzeRequestBody): PersistedAnalyzeInput {
  if (!body.settings) {
    throw new Error('Ongeldige analyse-aanvraag.');
  }

  if (body.settings.analysisType === 'PV_SELF_CONSUMPTION' && body.settings.pvInputMode !== 'intervalData') {
    if (!body.annualBillInput) {
      throw new Error('Vul eerst de jaarnota-gegevens in.');
    }

    return {
      settings: body.settings,
      annualBillInput: body.annualBillInput
    };
  }

  if (!body.mapping) {
    throw new Error('Ongeldige analyse-aanvraag.');
  }

  const rows = body.uploadId ? getUploadedDataset(body.uploadId)?.rows : body.rows;
  if (!rows) {
    throw new Error(body.uploadId ? 'Upload niet gevonden. Upload het bestand opnieuw.' : 'Ongeldige analyse-aanvraag.');
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Ongeldige analyse-aanvraag.');
  }

  if (rows.length > MAX_DIRECT_ROWS) {
    throw new Error(`Dataset is te groot voor deze analyse (${rows.length} rijen). Gebruik maximaal ${MAX_DIRECT_ROWS} rijen.`);
  }

  return {
    rows,
    mapping: body.mapping,
    settings: body.settings
  };
}

export async function POST(request: Request) {
  const requestStart = performance.now();
  logAnalyzeStart('request received');

  try {
    const body = (await request.json()) as AnalyzeRequestBody;
    logAnalyzeStart('json parsed', { durationMs: elapsedMs(requestStart) });

    const validationStart = performance.now();
    let input: PersistedAnalyzeInput;
    try {
      input = validateAndPersistInput(body);
    } catch (error) {
      logAnalyzeStart('validation failed', {
        durationMs: elapsedMs(validationStart),
        error: error instanceof Error ? error.message : String(error)
      });
      return jsonError(error instanceof Error ? error.message : 'Ongeldige analyse-aanvraag.', 400);
    }
    logAnalyzeStart('validation completed', {
      durationMs: elapsedMs(validationStart),
      rowCount: input.rows?.length ?? 0,
      analysisType: input.settings.analysisType
    });

    const storeStart = performance.now();
    const job = await getAnalysisJobStore().createJob(input);
    logAnalyzeStart('job stored', { jobId: job.jobId, durationMs: elapsedMs(storeStart) });

    ensureAnalysisWorkerStarted();
    logAnalyzeStart('accepted', { jobId: job.jobId, totalDurationMs: elapsedMs(requestStart) });

    return NextResponse.json(toStartAnalysisJobResponse(job), { status: 202 });
  } catch (error) {
    console.error('[analyze] start failed', error);
    return jsonError('Analyse kon niet worden gestart.', 500);
  }
}
