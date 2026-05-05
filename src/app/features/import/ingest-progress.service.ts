import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import {
  Observable,
  Subscription,
  Subject,
  catchError,
  filter,
  map,
  of,
  shareReplay,
  switchMap,
  takeUntil,
  takeWhile,
  throwError,
  timer
} from 'rxjs';
import { AppJobStatusResponse, RagIngestMode, RagIngestResponse } from '../../core/api/rag-api.service';
import { JobStatusPollingService } from '../../core/api/job-status-polling.service';

export interface IngestProgressRequest {
  docKey: string;
  mode: RagIngestMode;
  file: File;
  thumbnail?: File | null;
  thumbnailUrl?: string | null;
}

export interface IngestProgressStatus {
  ingestId: string;
  jobId?: string;
  docKey?: string;
  documentId?: number;
  mode?: string;
  progressPercent: number;
  stage: string;
  message: string;
  done: boolean;
  failed: boolean;
  usable: boolean;
  backgroundProcessing: boolean;
  chunksInserted?: number;
  updatedAt?: string;
}

export interface IngestProgressTask {
  ingestId: string;
  upload$: Observable<RagIngestResponse>;
  status$: Observable<IngestProgressStatus>;
}

interface RawIngestProgressStatus {
  ingestId?: unknown;
  docKey?: unknown;
  documentId?: unknown;
  mode?: unknown;
  progressPercent?: unknown;
  progress?: unknown;
  percent?: unknown;
  stage?: unknown;
  status?: unknown;
  message?: unknown;
  done?: unknown;
  failed?: unknown;
  chunksInserted?: unknown;
  updatedAt?: unknown;
}

interface TrackedIngestTask {
  ingestId: string;
  docKey: string;
  stop$: Subject<void>;
  uploadSubscription: Subscription;
  statusSubscription: Subscription;
}

@Injectable({ providedIn: 'root' })
export class IngestProgressService {
  private readonly http = inject(HttpClient);
  private readonly jobStatusPolling = inject(JobStatusPollingService);
  private readonly baseUrl = '/api/rag';
  private readonly trackedStatuses = signal<Record<string, IngestProgressStatus>>({});
  private readonly trackedTasks = new Map<string, TrackedIngestTask>();

  createIngestId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `ingest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  startIngest(request: IngestProgressRequest): IngestProgressTask {
    const ingestId = this.createIngestId();
    const requestedDocKey = request.docKey.trim();
    const stop$ = new Subject<void>();
    const formData = new FormData();
    formData.append('docKey', requestedDocKey);
    formData.append('mode', request.mode);
    formData.append('ingestId', ingestId);
    formData.append('file', request.file, request.file.name);
    if (request.thumbnail) {
      formData.append('thumbnail', request.thumbnail, request.thumbnail.name);
    }
    if (typeof request.thumbnailUrl === 'string' && request.thumbnailUrl.trim()) {
      formData.append('thumbnailUrl', request.thumbnailUrl.trim());
    }

    const upload$ = this.http
      .post<RagIngestResponse>(`${this.baseUrl}/ingest`, formData)
      .pipe(takeUntil(stop$))
      .pipe(shareReplay({ bufferSize: 1, refCount: false }));

    const status$ = upload$.pipe(
      switchMap((response) =>
        this.observeIngestStatus(response, ingestId, request.mode, requestedDocKey)
      ),
      takeUntil(stop$),
      shareReplay({ bufferSize: 1, refCount: false })
    );

    this.updateTrackedStatus(requestedDocKey, {
      ingestId,
      docKey: requestedDocKey,
      mode: request.mode,
      progressPercent: 0,
      stage: 'STARTED',
      message: 'Uploading document...',
      done: false,
      failed: false,
      usable: false,
      backgroundProcessing: false
    });

    const uploadSubscription = upload$.subscribe({
      next: (response) => {
        const responseDocKey =
          typeof response.docKey === 'string' && response.docKey.trim()
            ? response.docKey.trim()
            : requestedDocKey;
        this.renameTrackedStatus(requestedDocKey, responseDocKey, ingestId);
        this.updateTrackedStatus(responseDocKey, {
          ingestId,
          jobId: this.readString(response.jobId),
          docKey: responseDocKey,
          documentId: typeof response.documentId === 'number' ? response.documentId : undefined,
          mode: request.mode,
          progressPercent: Math.max(5, this.trackedStatus(responseDocKey)?.progressPercent ?? 0),
          stage: 'STARTED',
          message:
            typeof response.jobId === 'string' && response.jobId.trim()
              ? 'Upload accepted. Processing has started.'
              : 'Upload complete. Waiting for ingest progress updates.',
          done: false,
          failed: false,
          usable: false,
          backgroundProcessing: false,
          chunksInserted:
            typeof response.chunksInserted === 'number' ? response.chunksInserted : undefined
        });
      },
      error: (error) => {
        this.updateTrackedStatus(requestedDocKey, {
          ...this.failedStatus(ingestId, requestedDocKey),
          message: this.readErrorMessage(error)
        });
        this.cleanupTrackedTask(ingestId);
      }
    });

    const statusSubscription = status$.subscribe({
      next: (status) => {
        const trackedDocKey =
          (typeof status.docKey === 'string' && status.docKey.trim()) ||
          this.trackedTaskDocKey(ingestId) ||
          requestedDocKey;
        const docKey = typeof trackedDocKey === 'string' ? trackedDocKey.trim() : requestedDocKey;
        const current = this.trackedStatus(docKey);
        const usable = current?.usable === true || status.done;
        this.updateTrackedStatus(docKey, {
          ...status,
          docKey,
          usable,
          backgroundProcessing: usable && !status.done && !status.failed,
          message:
            usable && !status.done && !status.failed
              ? this.backgroundProcessingMessage(status.message)
              : status.message
        });

        if (status.done || status.failed) {
          this.cleanupTrackedTask(ingestId);
        }
      },
      error: (error) => {
        const docKey = this.trackedTaskDocKey(ingestId) ?? requestedDocKey;
        this.updateTrackedStatus(docKey, {
          ...this.failedStatus(ingestId, docKey),
          usable: this.trackedStatus(docKey)?.usable === true,
          backgroundProcessing: false,
          message: this.readErrorMessage(error)
        });
        this.cleanupTrackedTask(ingestId);
      }
    });

    this.trackedTasks.set(ingestId, {
      ingestId,
      docKey: requestedDocKey,
      stop$,
      uploadSubscription,
      statusSubscription
    });

    return {
      ingestId,
      upload$,
      status$
    };
  }

  trackedStatus(docKey: string | null | undefined): IngestProgressStatus | null {
    const normalizedDocKey = typeof docKey === 'string' ? docKey.trim() : '';
    if (!normalizedDocKey) {
      return null;
    }
    return this.trackedStatuses()[normalizedDocKey] ?? null;
  }

  trackedStatusesSnapshot(): IngestProgressStatus[] {
    return Object.values(this.trackedStatuses());
  }

  private observeIngestStatus(
    response: RagIngestResponse,
    fallbackIngestId: string,
    mode: RagIngestMode,
    requestedDocKey: string
  ): Observable<IngestProgressStatus> {
    const responseJobId = this.readString(response.jobId);
    const responseIngestId = this.readString(response.ingestId) ?? fallbackIngestId;

    if (responseJobId) {
      return this.jobStatusPolling.watchJob(responseJobId).pipe(
        map((status) =>
          this.normalizeJobStatus(status, responseJobId, responseIngestId, mode, requestedDocKey, response)
        ),
        takeWhile((status) => !status.done && !status.failed, true)
      );
    }

    return timer(0, 1000).pipe(
      switchMap(() =>
        this.http
          .get<RawIngestProgressStatus>(
            `${this.baseUrl}/ingest/${encodeURIComponent(responseIngestId)}/status`
          )
          .pipe(
            catchError((error: unknown) => {
              if (this.shouldRetryStatusRequest(error)) {
                return of(null);
              }
              return throwError(() => error);
            })
          )
      ),
      filter((status): status is RawIngestProgressStatus => status !== null),
      map((status) => this.normalizeStatus(status, responseIngestId)),
      takeWhile((status) => !status.done && !status.failed, true)
    );
  }

  stopTrackingDoc(docKey: string | null | undefined): void {
    const normalizedDocKey = typeof docKey === 'string' ? docKey.trim() : '';
    if (!normalizedDocKey) {
      return;
    }

    for (const [ingestId, task] of this.trackedTasks.entries()) {
      if (task.docKey === normalizedDocKey) {
        this.cleanupTrackedTask(ingestId);
      }
    }

    this.trackedStatuses.update((current) => {
      const next = { ...current };
      delete next[normalizedDocKey];
      return next;
    });
  }

  private normalizePercent(value: unknown): number {
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return this.normalizePercent(parsed);
      }
    }

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  private normalizeStatus(status: RawIngestProgressStatus, ingestId: string): IngestProgressStatus {
    const failed = this.readBoolean(status.failed);
    const done = this.readBoolean(status.done);
    const stage = this.readString(status.stage) ?? this.readString(status.status) ?? this.fallbackStage(done, failed);
    const normalizedPercent = this.normalizePercent(
      status.progressPercent ?? status.progress ?? status.percent
    );
    const fallbackPercent = this.fallbackPercent(stage, done, failed);

    return {
      ingestId: this.readString(status.ingestId) ?? ingestId,
      jobId: undefined,
      docKey: this.readString(status.docKey),
      documentId: this.readNumber(status.documentId),
      mode: this.readString(status.mode),
      progressPercent: normalizedPercent || fallbackPercent,
      stage,
      message: this.readString(status.message) ?? '',
      done,
      failed,
      usable: done,
      backgroundProcessing: false,
      chunksInserted: this.readNumber(status.chunksInserted),
      updatedAt: this.readString(status.updatedAt)
    };
  }

  private normalizeJobStatus(
    status: AppJobStatusResponse,
    jobId: string,
    ingestId: string,
    mode: RagIngestMode,
    requestedDocKey: string,
    response: RagIngestResponse
  ): IngestProgressStatus {
    const resultRecord =
      status.result && typeof status.result === 'object'
        ? (status.result as Record<string, unknown>)
        : null;
    const statusValue = this.readString(status.status)?.toUpperCase() ?? '';
    const stage = (this.readString(status.stage) ?? (statusValue || 'STARTED')).toUpperCase();
    const failed = statusValue === 'FAILED' || stage === 'FAILED';
    const done = statusValue === 'DONE' || stage === 'DONE';
    const usable =
      done ||
      stage === 'FIRST_CHAPTER_READY' ||
      this.readBoolean(resultRecord?.['usable']) === true;
    const docKey =
      this.readString(status.targetDocKey) ??
      this.readString(resultRecord?.['docKey']) ??
      this.readString(response.docKey) ??
      requestedDocKey;
    const documentId =
      this.readNumber(status.targetDocId) ??
      this.readNumber(resultRecord?.['documentId']) ??
      this.readNumber(resultRecord?.['id']) ??
      this.readNumber(response.documentId);
    const message =
      this.readString(status.message) ??
      (done
        ? 'Ingest completed.'
        : failed
          ? 'Ingest failed.'
          : usable
            ? 'First chapter ready. Remaining chapters are still processing in the background.'
            : 'Processing your document...');

    return {
      ingestId,
      jobId,
      docKey,
      documentId,
      mode,
      progressPercent: this.normalizePercent(status.progressPercent ?? (done ? 100 : 0)),
      stage,
      message,
      done,
      failed,
      usable,
      backgroundProcessing: usable && !done && !failed,
      chunksInserted:
        this.readNumber(resultRecord?.['chunksInserted']) ?? this.readNumber(response.chunksInserted),
      updatedAt: undefined
    };
  }

  private trackedTaskDocKey(ingestId: string): string | null {
    return this.trackedTasks.get(ingestId)?.docKey ?? null;
  }

  private updateTrackedStatus(docKey: string, status: IngestProgressStatus): void {
    const normalizedDocKey = docKey.trim();
    if (!normalizedDocKey) {
      return;
    }

    this.trackedStatuses.update((current) => ({
      ...current,
      [normalizedDocKey]: {
        ...current[normalizedDocKey],
        ...status,
        docKey: normalizedDocKey
      }
    }));
  }

  private renameTrackedStatus(previousDocKey: string, nextDocKey: string, ingestId: string): void {
    const normalizedPrevious = previousDocKey.trim();
    const normalizedNext = nextDocKey.trim();
    if (!normalizedPrevious || !normalizedNext || normalizedPrevious === normalizedNext) {
      const task = this.trackedTasks.get(ingestId);
      if (task && normalizedNext) {
        this.trackedTasks.set(ingestId, { ...task, docKey: normalizedNext });
      }
      return;
    }

    this.trackedStatuses.update((current) => {
      const next = { ...current };
      const existing = next[normalizedPrevious];
      delete next[normalizedPrevious];
      if (existing) {
        next[normalizedNext] = {
          ...existing,
          docKey: normalizedNext
        };
      }
      return next;
    });

    const task = this.trackedTasks.get(ingestId);
    if (task) {
      this.trackedTasks.set(ingestId, { ...task, docKey: normalizedNext });
    }
  }

  private cleanupTrackedTask(ingestId: string): void {
    const task = this.trackedTasks.get(ingestId);
    if (!task) {
      return;
    }

    task.uploadSubscription.unsubscribe();
    task.statusSubscription.unsubscribe();
    task.stop$.next();
    task.stop$.complete();
    this.trackedTasks.delete(ingestId);
  }

  private backgroundProcessingMessage(message: string): string {
    const normalized = message.trim();
    if (!normalized) {
      return 'First chapter ready. Remaining chapters are still processing in the background.';
    }
    return `First chapter ready. ${normalized}`;
  }

  private failedStatus(ingestId: string, docKey: string): IngestProgressStatus {
    return {
      ingestId,
      docKey,
      progressPercent: 100,
      stage: 'FAILED',
      message: 'Ingest failed.',
      done: false,
      failed: true,
      usable: false,
      backgroundProcessing: false
    };
  }

  private readErrorMessage(error: unknown): string {
    const err = error as {
      status?: number;
      error?: unknown;
      message?: string;
    };
    const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
    const backendMessage =
      typeof err?.error === 'string'
        ? err.error
        : (err?.error as { message?: string; error?: string } | undefined)?.message ??
          (err?.error as { message?: string; error?: string } | undefined)?.error ??
          err?.message ??
          'unknown error';
    return `${status}: ${backendMessage}`;
  }

  private shouldRetryStatusRequest(error: unknown): boolean {
    const statusCode =
      typeof (error as { status?: unknown } | null)?.status === 'number'
        ? ((error as { status: number }).status ?? 0)
        : 0;

    return statusCode === 0 || statusCode === 404 || statusCode >= 500;
  }

  private readBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      return value.trim().toLowerCase() === 'true';
    }

    return false;
  }

  private readNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
  }

  private readString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  private fallbackStage(done: boolean, failed: boolean): string {
    if (failed) {
      return 'FAILED';
    }

    if (done) {
      return 'DONE';
    }

    return 'STARTED';
  }

  private fallbackPercent(stage: string, done: boolean, failed: boolean): number {
    if (failed) {
      return 100;
    }

    if (done) {
      return 100;
    }

    const stagePercents: Record<string, number> = {
      STARTED: 2,
      EXTRACTING_PAGES: 10,
      SAVING_DOCUMENT: 18,
      SAVING_COVER: 24,
      BOOK_CONTEXT: 35,
      CHUNKING: 48,
      EMBEDDINGS: 68,
      PERSISTING_CHUNKS: 82,
      SAVING_CONTEXT: 90,
      WAITING_FOR_PDF_WORKFLOW: 94,
      UPLOADING_PDF: 96,
      EXTRACTING_PDF_IMAGES: 97,
      PDF_UPLOAD_READY: 98,
      SAVING_PDF_REFERENCE: 99,
      DONE: 100,
      FAILED: 100
    };

    return stagePercents[stage] ?? 0;
  }
}
