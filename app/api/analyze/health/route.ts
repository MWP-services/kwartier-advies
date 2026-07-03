import { NextResponse } from 'next/server';
import { getAnalysisJobStore } from '@/lib/analysisJobStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEARTBEAT_STALE_MS = 45_000;

type WorkerStatus = 'online' | 'offline';

interface AnalyzeHealthResponse {
  healthy: boolean;
  workerStatus: WorkerStatus;
  lastHeartbeatAt?: string;
  jobStoreDir: string;
  ageMs?: number;
}

function healthResponse(payload: AnalyzeHealthResponse, status: number): NextResponse<AnalyzeHealthResponse> {
  return NextResponse.json(payload, { status });
}

export async function GET() {
  const store = getAnalysisJobStore();
  const jobStoreDir = store.getDirectory();

  try {
    const heartbeat = await store.getWorkerHeartbeat();
    if (!heartbeat) {
      return healthResponse({ healthy: false, workerStatus: 'offline', jobStoreDir }, 503);
    }

    const heartbeatTime = new Date(heartbeat.timestamp).getTime();
    if (!Number.isFinite(heartbeatTime)) {
      return healthResponse(
        { healthy: false, workerStatus: 'offline', lastHeartbeatAt: heartbeat.timestamp, jobStoreDir },
        503
      );
    }

    const ageMs = Math.max(0, Date.now() - heartbeatTime);
    const healthy = ageMs <= HEARTBEAT_STALE_MS;

    return healthResponse(
      {
        healthy,
        workerStatus: healthy ? 'online' : 'offline',
        lastHeartbeatAt: heartbeat.timestamp,
        jobStoreDir,
        ageMs
      },
      healthy ? 200 : 503
    );
  } catch (error) {
    console.error('[analyze] health failed to read worker heartbeat', error);
    return healthResponse({ healthy: false, workerStatus: 'offline', jobStoreDir }, 503);
  }
}
