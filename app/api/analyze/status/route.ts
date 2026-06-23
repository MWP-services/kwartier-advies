import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/apiResponses';
import { getAnalysisJobStore, toAnalysisJobStatusResponse } from '@/lib/analysisJobStore';
import { ensureAnalysisWorkerStarted } from '@/lib/analysisWorker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    ensureAnalysisWorkerStarted();

    const url = new URL(request.url);
    const jobId = url.searchParams.get('jobId');
    if (!jobId) {
      return jsonError('jobId ontbreekt.', 400);
    }

    const job = await getAnalysisJobStore().getJob(jobId);
    if (!job) {
      return jsonError('Analysejob niet gevonden.', 404);
    }

    return NextResponse.json(toAnalysisJobStatusResponse(job));
  } catch (error) {
    console.error('[analyze] status failed', error);
    return jsonError('Status kon niet worden opgehaald.', 500);
  }
}
