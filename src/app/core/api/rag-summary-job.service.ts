import { Injectable, signal } from '@angular/core';
import {
  RagApiService,
  RagSummaryResponse,
  RagSummarySize
} from './rag-api.service';

export type RagSummaryJobStatus = 'running' | 'success' | 'error';

export interface RagSummaryJobState {
  docKey: string;
  size: RagSummarySize;
  status: RagSummaryJobStatus;
  progress: number;
  startedAt: number;
  updatedAt: number;
  response?: RagSummaryResponse;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class RagSummaryJobService {
  private readonly jobs = signal<Record<string, RagSummaryJobState>>({});
  private readonly progressTimers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(private readonly ragApi: RagApiService) {}

  getJob(docKey: string): RagSummaryJobState | null {
    if (!docKey) {
      return null;
    }
    return this.jobs()[docKey] ?? null;
  }

  start(docKey: string, size: RagSummarySize): boolean {
    const key = docKey.trim();
    if (!key) {
      return false;
    }

    const existing = this.jobs()[key];
    if (existing?.status === 'running') {
      return false;
    }

    const now = Date.now();
    this.patchJob(key, {
      docKey: key,
      size,
      status: 'running',
      progress: 1,
      startedAt: now,
      updatedAt: now,
      error: undefined,
      response: undefined
    });
    this.startProgressTicker(key);

    this.ragApi.summarizeDocument({ docKey: key, size }).subscribe({
      next: (response) => {
        this.stopProgressTicker(key);
        const doneAt = Date.now();
        this.patchJob(key, {
          docKey: key,
          size,
          status: 'success',
          progress: 100,
          response,
          error: undefined,
          startedAt: this.jobs()[key]?.startedAt ?? doneAt,
          updatedAt: doneAt
        });
      },
      error: (err) => {
        this.stopProgressTicker(key);
        const doneAt = Date.now();
        const isTimeout =
          err?.name === 'TimeoutError' ||
          (typeof err?.status === 'number' && err.status === 0);
        const message = isTimeout
          ? 'Request timed out or connection was interrupted before response returned.'
          : typeof err?.error === 'string'
            ? err.error
            : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
        this.patchJob(key, {
          docKey: key,
          size,
          status: 'error',
          progress: 100,
          error: message,
          response: undefined,
          startedAt: this.jobs()[key]?.startedAt ?? doneAt,
          updatedAt: doneAt
        });
      }
    });

    return true;
  }

  private startProgressTicker(docKey: string): void {
    this.stopProgressTicker(docKey);

    const timer = setInterval(() => {
      const current = this.jobs()[docKey];
      if (!current || current.status !== 'running') {
        this.stopProgressTicker(docKey);
        return;
      }
      const nextProgress = Math.min(current.progress + 2, 95);
      this.patchJob(docKey, {
        ...current,
        progress: nextProgress,
        updatedAt: Date.now()
      });
    }, 1000);

    this.progressTimers.set(docKey, timer);
  }

  private stopProgressTicker(docKey: string): void {
    const timer = this.progressTimers.get(docKey);
    if (!timer) {
      return;
    }
    clearInterval(timer);
    this.progressTimers.delete(docKey);
  }

  private patchJob(docKey: string, job: RagSummaryJobState): void {
    this.jobs.update((current) => ({
      ...current,
      [docKey]: job
    }));
  }
}
