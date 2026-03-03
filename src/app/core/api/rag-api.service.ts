import { HttpClient, HttpParams } from '@angular/common/http';
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

export interface RagAskRequest {
  question: string;
  docKey: string;
  topK?: number;
}

export interface RagAskResponse {
  answer?: string;
  docKey?: string;
  topK?: number;
  retrieved?: unknown[];
  [key: string]: unknown;
}

export interface RagCharacterDetails {
  id: number;
  doc_id?: number;
  docId?: number;
  character_name?: string;
  characterName?: string;
  summary?: string;
  top_k?: number;
  topK?: number;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface RagChapterEventResponse {
  id: number;
  docKey: string;
  chapterId: number;
  chapterTitle?: string | null;
  eventOrder: number;
  eventText: string;
  importanceScore: number;
  createdAt?: string;
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

  askQuestion(req: RagAskRequest): Observable<RagAskResponse> {
    return this.http.post<RagAskResponse>(`${this.baseUrl}/ask`, req);
  }

  getCharactersByDocKey(docKey: string): Observable<RagCharacterDetails[]> {
    return this.http.get<RagCharacterDetails[]>(
      `${this.baseUrl}/characters/${encodeURIComponent(docKey)}`
    );
  }

  listChapterEvents(docKey: string, minImportance?: number): Observable<RagChapterEventResponse[]> {
    let params: HttpParams | undefined;
    if (typeof minImportance === 'number' && Number.isFinite(minImportance)) {
      params = new HttpParams().set('minImportance', minImportance.toString());
    }
    return this.http.get<RagChapterEventResponse[]>(
      `${this.baseUrl}/chapter-events/${encodeURIComponent(docKey)}`,
      { params }
    );
  }
}
