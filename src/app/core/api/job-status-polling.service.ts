import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, expand, shareReplay, switchMap, timer } from 'rxjs';
import { appEnvironment, buildApiUrl } from '../config/app-environment';
import { AppJobStatusResponse } from './rag-api.service';

@Injectable({ providedIn: 'root' })
export class JobStatusPollingService {
  private readonly http = inject(HttpClient);
  private readonly activePolls = new Map<string, Observable<AppJobStatusResponse>>();
  private readonly pollIntervalMs = appEnvironment.polling.jobStatusMs;
  private readonly jobsBaseUrl = buildApiUrl('/jobs');

  watchJob(jobId: string): Observable<AppJobStatusResponse> {
    const normalizedJobId = jobId.trim();
    if (!normalizedJobId) {
      throw new Error('Job id is required.');
    }

    const existing = this.activePolls.get(normalizedJobId);
    if (existing) {
      return existing;
    }

    const stream$ = this.fetchJobStatus(normalizedJobId).pipe(
      expand((status) =>
        this.isTerminal(status)
          ? EMPTY
          : timer(this.pollIntervalMs).pipe(switchMap(() => this.fetchJobStatus(normalizedJobId)))
      ),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    this.activePolls.set(normalizedJobId, stream$);
    stream$.subscribe({
      complete: () => {
        if (this.activePolls.get(normalizedJobId) === stream$) {
          this.activePolls.delete(normalizedJobId);
        }
      },
      error: () => {
        if (this.activePolls.get(normalizedJobId) === stream$) {
          this.activePolls.delete(normalizedJobId);
        }
      }
    });

    return stream$;
  }

  isTerminal(status: AppJobStatusResponse | null | undefined): boolean {
    const value = this.normalizedStatusValue(status);
    return value === 'DONE' || value === 'FAILED';
  }

  isSuccessful(status: AppJobStatusResponse | null | undefined): boolean {
    return this.normalizedStatusValue(status) === 'DONE';
  }

  private fetchJobStatus(jobId: string): Observable<AppJobStatusResponse> {
    return this.http.get<AppJobStatusResponse>(`${this.jobsBaseUrl}/${encodeURIComponent(jobId)}`);
  }

  private normalizedStatusValue(status: AppJobStatusResponse | null | undefined): string {
    return typeof status?.status === 'string' ? status.status.trim().toUpperCase() : '';
  }
}
