import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  AnalysisJobRecord,
  AnalysisJobStatusResponse,
  PersistedAnalyzeInput,
  StartAnalysisJobResponse
} from './analysisJobTypes';

const JOB_PREFIX = 'analysis_';
const JOB_FILE_SUFFIX = '.json';
const LOCK_SUFFIX = '.lock';
export const WORKER_HEARTBEAT_FILE = 'analysis-worker-heartbeat.json';
const STALE_PROCESSING_MS = 30 * 60 * 1000;
const FILE_WRITE_RETRY_DELAYS_MS = [25, 75, 150, 300, 600];

export interface AnalysisWorkerHeartbeat {
  timestamp: string;
  pid: number;
  workerRole: string;
  jobStoreDir: string;
}

export interface AnalysisJobStore {
  createJob(input: PersistedAnalyzeInput): Promise<AnalysisJobRecord>;
  getJob(jobId: string): Promise<AnalysisJobRecord | null>;
  updateJob(jobId: string, patch: Partial<AnalysisJobRecord>): Promise<AnalysisJobRecord>;
  claimNextJob(): Promise<{ job: AnalysisJobRecord; release: () => Promise<void> } | null>;
  getDirectory(): string;
  writeWorkerHeartbeat(heartbeat: AnalysisWorkerHeartbeat): Promise<void>;
  getWorkerHeartbeat(): Promise<AnalysisWorkerHeartbeat | null>;
}

let storeOverride: AnalysisJobStore | null = null;
let defaultStore: AnalysisJobStore | null = null;
let defaultStoreDir: string | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function createJobId(): string {
  return `${JOB_PREFIX}${crypto.randomUUID().replace(/-/g, '')}`;
}

function safeJobId(jobId: string): string {
  if (!/^analysis_[a-f0-9]{32}$/i.test(jobId)) {
    throw new Error('Ongeldige jobId.');
  }
  return jobId;
}

function atomicJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function isRetriableFileError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'EPERM' || code === 'EBUSY' || code === 'EACCES' || code === 'ENOENT';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function resolveAnalysisJobStoreDir(): string {
  if (process.env.ANALYSIS_JOB_STORE_DIR) {
    return path.resolve(process.env.ANALYSIS_JOB_STORE_DIR);
  }

  if (process.env.WEBSITE_SITE_NAME) {
    return '/home/data/kwartieradvies/analysis-jobs';
  }

  return path.join(process.cwd(), '.analysis-jobs');
}

function logAnalyzeJobStore(message: string, extra?: Record<string, unknown>): void {
  if (extra) {
    console.log(`[analyze] jobstore ${message}`, extra);
    return;
  }
  console.log(`[analyze] jobstore ${message}`);
}

export class FileAnalysisJobStore implements AnalysisJobStore {
  constructor(private readonly directory: string) {}

  private async ensureDirectory(): Promise<void> {
    await mkdir(this.directory, { recursive: true });
  }

  private jobPath(jobId: string): string {
    return path.join(this.directory, `${safeJobId(jobId)}${JOB_FILE_SUFFIX}`);
  }

  private lockPath(jobId: string): string {
    return path.join(this.directory, `${safeJobId(jobId)}${LOCK_SUFFIX}`);
  }

  private heartbeatPath(): string {
    return path.join(this.directory, WORKER_HEARTBEAT_FILE);
  }

  private async writeAtomicJson(filePath: string, value: unknown): Promise<void> {
    await this.ensureDirectory();
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= FILE_WRITE_RETRY_DELAYS_MS.length; attempt += 1) {
      const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${attempt}.tmp`;
      try {
        await writeFile(tmpPath, atomicJson(value), 'utf8');
        await rename(tmpPath, filePath);
        return;
      } catch (error) {
        lastError = error;
        await rm(tmpPath, { force: true }).catch(() => undefined);
        if (!isRetriableFileError(error) || attempt >= FILE_WRITE_RETRY_DELAYS_MS.length) {
          break;
        }
        await delay(FILE_WRITE_RETRY_DELAYS_MS[attempt]);
      }
    }

    throw lastError;
  }

  private async writeJob(job: AnalysisJobRecord): Promise<void> {
    await this.writeAtomicJson(this.jobPath(job.jobId), job);
  }

  async createJob(input: PersistedAnalyzeInput): Promise<AnalysisJobRecord> {
    const timestamp = nowIso();
    const job: AnalysisJobRecord = {
      jobId: createJobId(),
      status: 'queued',
      progress: 0,
      currentStep: 'Analyse staat in de wachtrij',
      createdAt: timestamp,
      updatedAt: timestamp,
      attempts: 0,
      input
    };
    await this.writeJob(job);
    return job;
  }

  async getJob(jobId: string): Promise<AnalysisJobRecord | null> {
    try {
      const content = await readFile(this.jobPath(jobId), 'utf8');
      return JSON.parse(content) as AnalysisJobRecord;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async updateJob(jobId: string, patch: Partial<AnalysisJobRecord>): Promise<AnalysisJobRecord> {
    const current = await this.getJob(jobId);
    if (!current) throw new Error(`Job ${jobId} bestaat niet.`);
    const next: AnalysisJobRecord = {
      ...current,
      ...patch,
      jobId: current.jobId,
      input: patch.input ?? current.input,
      updatedAt: nowIso()
    };
    await this.writeJob(next);
    if (patch.status && patch.status !== current.status) {
      logAnalyzeJobStore('status transition', { jobId, from: current.status, to: patch.status, attempts: next.attempts });
    }
    return next;
  }

  async claimNextJob(): Promise<{ job: AnalysisJobRecord; release: () => Promise<void> } | null> {
    await this.ensureDirectory();
    const fileNames = await readdir(this.directory);
    const jobFiles = fileNames
      .filter((fileName) => fileName.startsWith(JOB_PREFIX) && fileName.endsWith(JOB_FILE_SUFFIX))
      .sort();

    for (const fileName of jobFiles) {
      const jobId = fileName.slice(0, -JOB_FILE_SUFFIX.length);
      const job = await this.getJob(jobId);
      if (!job || job.status === 'completed' || job.status === 'failed') continue;

      const lockedUntilMs = job.lockedUntil ? new Date(job.lockedUntil).getTime() : 0;
      const isStaleProcessing =
        job.status === 'processing' &&
        Number.isFinite(lockedUntilMs) &&
        lockedUntilMs > 0 &&
        lockedUntilMs < Date.now();

      if (job.status !== 'queued' && !isStaleProcessing) continue;

      const lockPath = this.lockPath(jobId);
      try {
        await mkdir(lockPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          const removedStaleLock = await this.removeStaleLock(jobId, job.status);
          if (isStaleProcessing || removedStaleLock) {
            try {
              await mkdir(lockPath);
            } catch {
              continue;
            }
          } else {
            continue;
          }
        } else {
          throw error;
        }
      }

      let claimed: AnalysisJobRecord;
      try {
        claimed = await this.updateJob(jobId, {
          status: 'processing',
          progress: Math.max(job.progress, 5),
          currentStep: 'Analyse wordt gestart',
          attempts: job.attempts + 1,
          startedAt: job.startedAt ?? nowIso(),
          lockedUntil: new Date(Date.now() + STALE_PROCESSING_MS).toISOString()
        });
      } catch (error) {
        await rm(lockPath, { recursive: true, force: true }).catch(() => undefined);
        logAnalyzeJobStore('claim failed and lock released', {
          jobId,
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }

      return {
        job: claimed,
        release: async () => {
          await rm(lockPath, { recursive: true, force: true });
          logAnalyzeJobStore('lock released', { jobId });
        }
      };
    }

    return null;
  }

  private async removeStaleLock(jobId: string, status: AnalysisJobRecord['status']): Promise<boolean> {
    const lockPath = this.lockPath(jobId);
    try {
      const lockStat = await stat(lockPath);
      if (Date.now() - lockStat.mtimeMs > STALE_PROCESSING_MS) {
        await rm(lockPath, { recursive: true, force: true });
        logAnalyzeJobStore('removed stale lock', {
          jobId,
          status,
          lockAgeMs: Math.round(Date.now() - lockStat.mtimeMs)
        });
        return true;
      }
      logAnalyzeJobStore('recent lock retained', { jobId, status, lockAgeMs: Math.round(Date.now() - lockStat.mtimeMs) });
    } catch {
      try {
        await rm(lockPath, { recursive: true, force: true });
        logAnalyzeJobStore('removed unreadable stale lock', { jobId, status });
        return true;
      } catch (cleanupError) {
        console.error(`[analyze] jobstore failed to remove lock job=${jobId}`, cleanupError);
        return false;
      }
    }

    return false;
  }

  getDirectory(): string {
    return this.directory;
  }

  async writeWorkerHeartbeat(heartbeat: AnalysisWorkerHeartbeat): Promise<void> {
    await this.writeAtomicJson(this.heartbeatPath(), heartbeat);
  }

  async getWorkerHeartbeat(): Promise<AnalysisWorkerHeartbeat | null> {
    try {
      const content = await readFile(this.heartbeatPath(), 'utf8');
      return JSON.parse(content) as AnalysisWorkerHeartbeat;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
}

export function getAnalysisJobStore(): AnalysisJobStore {
  if (storeOverride) return storeOverride;

  const directory = resolveAnalysisJobStoreDir();
  if (!defaultStore || defaultStoreDir !== directory) {
    defaultStore = new FileAnalysisJobStore(directory);
    defaultStoreDir = directory;
  }

  return defaultStore;
}

export function setAnalysisJobStoreForTests(store: AnalysisJobStore | null): void {
  storeOverride = store;
  defaultStore = null;
  defaultStoreDir = null;
}

export function toStartAnalysisJobResponse(job: AnalysisJobRecord): StartAnalysisJobResponse {
  return {
    jobId: job.jobId,
    status: 'queued',
    progress: job.progress,
    currentStep: job.currentStep
  };
}

export function toAnalysisJobStatusResponse(job: AnalysisJobRecord): AnalysisJobStatusResponse {
  if (job.status === 'completed') {
    if (!job.result) {
      return {
        jobId: job.jobId,
        status: 'failed',
        progress: job.progress,
        currentStep: 'Analyse kon niet worden geladen',
        error: 'De analyse is afgerond, maar het resultaat ontbreekt.'
      };
    }

    return {
      jobId: job.jobId,
      status: 'completed',
      progress: 100,
      currentStep: job.currentStep,
      result: job.result
    };
  }

  if (job.status === 'failed') {
    return {
      jobId: job.jobId,
      status: 'failed',
      progress: job.progress,
      currentStep: job.currentStep,
      error: job.error ?? 'De analyse kon niet worden afgerond.'
    };
  }

  const activeStatus = job.status === 'queued' ? 'queued' : 'processing';

  return {
    jobId: job.jobId,
    status: activeStatus,
    progress: job.progress,
    currentStep: job.currentStep
  };
}
