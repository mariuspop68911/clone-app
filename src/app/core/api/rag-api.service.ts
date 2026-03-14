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

export interface RagComicBookGenerateAllRequest {
  docKey: string;
  start: number;
  end: number;
}

export interface RagComicBookGenerateResponse {
  docKey?: string;
  docId?: number;
  limit?: number;
  processedChunks?: number;
  lastSceneId?: number;
  notes?: RagComicNoteResponse[];
  comicNotes?: RagComicNoteResponse[] | Record<string, unknown>;
  groupNotes?: Record<string, unknown>;
  isLastBatch?: boolean;
  [key: string]: unknown;
}

export interface RagCharacterReferenceImageResponse {
  characterName?: string;
  imageUrl?: string;
  [key: string]: unknown;
}

export interface RagCharacterReferenceImageListResponse {
  docKey?: string;
  docId?: number;
  folder?: string;
  count?: number;
  characters?: RagCharacterReferenceImageResponse[];
  [key: string]: unknown;
}

export interface RagSlidePromptResponse {
  docKey?: string;
  docId?: number;
  slideId?: number;
  folder?: string;
  promptText?: string;
  [key: string]: unknown;
}

export interface RagSlideHeadCharacter {
  characterName?: string;
  declaredOrder?: number;
  matched?: boolean;
  pixelX?: number;
  pixelY?: number;
  normalizedX?: number;
  normalizedY?: number;
  mouthPixelX?: number;
  mouthPixelY?: number;
  mouthNormalizedX?: number;
  mouthNormalizedY?: number;
  confidence?: number;
  [key: string]: unknown;
}

export interface RagSlideHeadsResponse {
  docKey?: string;
  docId?: number;
  slideId?: number;
  folder?: string;
  json?: string;
  [key: string]: unknown;
}

export interface RagSlideHeadCoordinatesJson {
  docId?: number;
  slideId?: number;
  comicNoteId?: number;
  imageUri?: string;
  imageWidth?: number;
  imageHeight?: number;
  mappingStrategy?: string;
  characters?: RagSlideHeadCharacter[];
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

  generateComicBookAll(
    req: RagComicBookGenerateAllRequest
  ): Observable<RagComicBookGenerateResponse> {
    return this.http.post<RagComicBookGenerateResponse>(
      `${this.baseUrl}/comic-book/generate-all`,
      req
    );
  }

  getComicSlidesWithImages(docKey: string): Observable<RagComicSlidesWithImagesResponse> {
    return this.http.get<RagComicSlidesWithImagesResponse>(
      `${this.baseUrl}/comic-book/${encodeURIComponent(docKey)}/slides-with-images`
    );
  }

  getCharacterReferenceImages(docKey: string): Observable<RagCharacterReferenceImageListResponse> {
    return this.http.get<RagCharacterReferenceImageListResponse>(
      `${this.baseUrl}/comic-book/${encodeURIComponent(docKey)}/gcs-reference-characters`
    );
  }

  getSlidePrompt(docKey: string, slideId: number): Observable<RagSlidePromptResponse> {
    return this.http.get<RagSlidePromptResponse>(
      `${this.baseUrl}/comic-book/${encodeURIComponent(docKey)}/gcs-slide-prompt/${slideId}`
    );
  }

  getSlideHeads(docKey: string, slideId: number): Observable<RagSlideHeadsResponse> {
    return this.http.get<RagSlideHeadsResponse>(
      `${this.baseUrl}/comic-book/${encodeURIComponent(docKey)}/gcs-slide-heads/${slideId}`
    );
  }
}
