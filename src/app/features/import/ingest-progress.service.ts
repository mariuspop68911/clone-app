import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  Observable,
  catchError,
  filter,
  ignoreElements,
  map,
  of,
  shareReplay,
  switchMap,
  takeUntil,
  takeWhile,
  throwError,
  timer
} from 'rxjs';
import { RagIngestMode, RagIngestResponse } from '../../core/api/rag-api.service';

export interface IngestProgressRequest {
  docKey: string;
  mode: RagIngestMode;
  file: File;
  thumbnail?: File | null;
}

export interface IngestProgressStatus {
  ingestId: string;
  docKey?: string;
  documentId?: number;
  mode?: string;
  progressPercent: number;
  stage: string;
  message: string;
  done: boolean;
  failed: boolean;
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

@Injectable({ providedIn: 'root' })
export class IngestProgressService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/rag';

  createIngestId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `ingest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  startIngest(request: IngestProgressRequest): IngestProgressTask {
    const ingestId = this.createIngestId();
    const formData = new FormData();
    formData.append('docKey', request.docKey);
    formData.append('mode', request.mode);
    formData.append('ingestId', ingestId);
    formData.append('file', request.file, request.file.name);
    if (request.thumbnail) {
      formData.append('thumbnail', request.thumbnail, request.thumbnail.name);
    }

    const upload$ = this.http
      .post<RagIngestResponse>(`${this.baseUrl}/ingest`, formData)
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));

    const uploadError$ = upload$.pipe(
      ignoreElements(),
      catchError((error) => of(error))
    );

    const status$ = timer(0, 1000).pipe(
      switchMap(() =>
        this.http
          .get<RawIngestProgressStatus>(`${this.baseUrl}/ingest/${encodeURIComponent(ingestId)}/status`)
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
      map((status) => this.normalizeStatus(status, ingestId)),
      takeUntil(uploadError$),
      takeWhile((status) => !status.done && !status.failed, true),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    return {
      ingestId,
      upload$,
      status$
    };
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
      docKey: this.readString(status.docKey),
      documentId: this.readNumber(status.documentId),
      mode: this.readString(status.mode),
      progressPercent: normalizedPercent || fallbackPercent,
      stage,
      message: this.readString(status.message) ?? '',
      done,
      failed,
      chunksInserted: this.readNumber(status.chunksInserted),
      updatedAt: this.readString(status.updatedAt)
    };
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
