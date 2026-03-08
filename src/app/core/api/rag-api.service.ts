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

export interface RagImageGenerateRequest {
  prompt: string;
  limit?: number;
}

export interface RagImageGenerateResponse {
  model?: string;
  mimeType?: string;
  imageBase64?: string;
  [key: string]: unknown;
}

export interface RagComicPageGenerateRequest {
  docKey: string;
  limit?: number;
}

export interface RagComicPageGenerateResponse {
  status?: string;
  docKey?: string;
  docId?: number;
  limit?: number;
  requestedNotes?: number;
  processedNotes?: number;
  failedNotes?: number;
  imageUris?: string[];
  [key: string]: unknown;
}

export interface RagComicPageNoteResponse {
  id?: number;
  docId?: number;
  chunkId?: number;
  chunkIndex?: number;
  previousSceneId?: number;
  previousLocation?: string;
  previousMainNotesJson?: string;
  imagePrompt?: string;
  charactersInImageJson?: string;
  segmentsJson?: string;
  updatedSceneIdMax?: number;
  rawJson?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface RagComicPageItemResponse {
  comicNote?: RagComicPageNoteResponse;
  imageUris?: string[];
  [key: string]: unknown;
}

export interface RagComicPagesResponse {
  docKey?: string;
  docId?: number;
  folder?: string;
  limit?: number;
  requestedNotes?: number;
  returnedNotes?: number;
  items?: RagComicPageItemResponse[];
  [key: string]: unknown;
}

export interface RagComicNoteResponse {
  id?: number;
  [key: string]: unknown;
}

export interface RagComicBookGenerateRequest {
  docKey: string;
  limit?: number;
}

export interface RagComicBookGenerateResponse {
  docKey?: string;
  docId?: number;
  limit?: number;
  processedChunks?: number;
  lastSceneId?: number;
  notes?: RagComicNoteResponse[];
  [key: string]: unknown;
}

export interface RagComicCharacterImageItem {
  name?: string;
  appearance?: string | null;
  [key: string]: unknown;
}

export interface RagComicCharacterImagesGenerateResponse {
  docKey?: string;
  docId?: number;
  count?: number;
  characters?: RagComicCharacterImageItem[];
  [key: string]: unknown;
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

  generateImage(req: RagImageGenerateRequest): Observable<RagImageGenerateResponse> {
    return this.http.post<RagImageGenerateResponse>(`${this.baseUrl}/image/generate`, req);
  }

  generateComicBook(req: RagComicBookGenerateRequest): Observable<RagComicBookGenerateResponse> {
    return this.http.post<RagComicBookGenerateResponse>(`${this.baseUrl}/comic-book/generate`, req);
  }

  generateComicCharacterImages(
    docKey: string
  ): Observable<RagComicCharacterImagesGenerateResponse> {
    return this.http.get<RagComicCharacterImagesGenerateResponse>(
      `${this.baseUrl}/comic-book/${encodeURIComponent(docKey)}/generate-image-characters`
    );
  }

  generateComicPageImages(req: RagComicPageGenerateRequest): Observable<RagComicPageGenerateResponse> {
    return this.http.post<RagComicPageGenerateResponse>(`${this.baseUrl}/image/generate`, req);
  }

  getComicPages(docKey: string, limit?: number): Observable<RagComicPagesResponse> {
    let params: HttpParams | undefined;
    if (typeof limit === 'number' && Number.isFinite(limit)) {
      params = new HttpParams().set('limit', String(limit));
    }
    return this.http.get<RagComicPagesResponse>(
      `${this.baseUrl}/image/${encodeURIComponent(docKey)}/comic-pages`,
      { params }
    );
  }
}
