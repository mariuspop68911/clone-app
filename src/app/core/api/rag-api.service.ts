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

@Injectable({ providedIn: 'root' })
export class RagApiService {
  private readonly baseUrl = '/api/rag';
  private readonly ingestTimeoutMs = 120000;
  private readonly listDocumentsTimeoutMs = 30000;

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
}
