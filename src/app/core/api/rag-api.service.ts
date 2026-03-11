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

export interface RagComicSlideCharacter {
  name?: string;
  appearance?: string | null;
  [key: string]: unknown;
}

export interface RagComicSlideDialogue {
  character?: string;
  line?: string;
  [key: string]: unknown;
}

export interface RagComicSlideSegment {
  characters?: RagComicSlideCharacter[];
  location?: string;
  main_note?: string;
  dialogue?: RagComicSlideDialogue[];
  [key: string]: unknown;
}

export interface RagComicSlideNote {
  id?: number;
  chunkId?: number;
  chunkIndex?: number;
  imagePrompt?: string;
  charactersInImage?: string[];
  segments?: RagComicSlideSegment[];
  [key: string]: unknown;
}

export interface RagComicSlide {
  id?: number;
  comicGroupNoteId?: number;
  comicNoteId?: number;
  naration?: string;
  comicNote?: RagComicSlideNote;
  imageUrls?: string[];
  [key: string]: unknown;
}

export interface RagComicSlidesWithImagesResponse {
  docKey?: string;
  docId?: number;
  folder?: string;
  slideCount?: number;
  slides?: RagComicSlide[];
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

export interface RagComicGroupNotesGenerateRequest {
  docKey: string;
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

export interface RagComicSlidesResponse {
  docKey?: string;
  docId?: number;
  slideCount?: number;
  slides?: RagComicSlide[];
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

  askQuestion(req: RagAskRequest): Observable<RagAskResponse> {
    return this.http.post<RagAskResponse>(`${this.baseUrl}/ask`, req);
  }

  generateImage(req: RagImageGenerateRequest): Observable<RagImageGenerateResponse> {
    return this.http.post<RagImageGenerateResponse>(`${this.baseUrl}/image/generate`, req);
  }

  generateComicBook(req: RagComicBookGenerateRequest): Observable<RagComicBookGenerateResponse> {
    return this.http.post<RagComicBookGenerateResponse>(`${this.baseUrl}/comic-book/generate`, req);
  }

  generateComicGroupNotes(
    req: RagComicGroupNotesGenerateRequest
  ): Observable<RagComicBookGenerateResponse> {
    return this.http.post<RagComicBookGenerateResponse>(
      `${this.baseUrl}/comic-book/generate-group-notes`,
      req
    );
  }

  getComicSlidesWithImages(docKey: string): Observable<RagComicSlidesWithImagesResponse> {
    return this.http.get<RagComicSlidesWithImagesResponse>(
      `${this.baseUrl}/comic-book/${encodeURIComponent(docKey)}/slides-with-images`
    );
  }

  getComicSlides(docKey: string): Observable<RagComicSlidesResponse> {
    return this.http.get<RagComicSlidesResponse>(
      `${this.baseUrl}/comic-book/${encodeURIComponent(docKey)}/slides`
    );
  }
}
