import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, timeout } from 'rxjs';

export interface RagIngestResponse {
  docKey: string;
  documentId: number;
  chunksInserted: number;
}

export interface RagDocumentResponse {
  documentId?: number;
  docKey?: string;
  fileName?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export type RagSummarySize = 'small' | 'large';

export interface RagSummaryRequest {
  docKey: string;
  size: RagSummarySize;
}

export interface RagSummaryResponse {
  docKey?: string;
  size?: string;
  totalChunksInDoc?: number;
  processedChunks?: number;
  sectionSummaries?: number;
  summary?: string;
  [key: string]: unknown;
}

export interface RagStoredSummaryResponse {
  id: number;
  name: string;
  docKey: string;
  size: string;
  totalChunksInDoc: number;
  processedChunks: number;
  sectionSummaries: number;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class RagApiService {
  private readonly baseUrl = '/api/rag';
  private readonly ingestTimeoutMs = 120000;
  private readonly listDocumentsTimeoutMs = 30000;
  private readonly listSummariesTimeoutMs = 60000;

  constructor(private readonly http: HttpClient) {}

  ingestDocument(docKey: string, file: File): Observable<RagIngestResponse> {
    const formData = new FormData();
    formData.append('file', file, file.name);

    return this.http
      .post<RagIngestResponse>(`${this.baseUrl}/ingest`, formData, { params: { docKey } })
      .pipe(timeout(this.ingestTimeoutMs));
  }

  listDocuments(): Observable<RagDocumentResponse[]> {
    return this.http
      .get<RagDocumentResponse[]>(`${this.baseUrl}/documents`)
      .pipe(timeout(this.listDocumentsTimeoutMs));
  }

  summarizeDocument(req: RagSummaryRequest): Observable<RagSummaryResponse> {
    return this.http.post<RagSummaryResponse>(`${this.baseUrl}/summary`, req);
  }

  listStoredSummaries(docKey: string): Observable<RagStoredSummaryResponse[]> {
    return this.http
      .get<RagStoredSummaryResponse[]>(`${this.baseUrl}/summaries/${encodeURIComponent(docKey)}`)
      .pipe(timeout(this.listSummariesTimeoutMs));
  }
}
