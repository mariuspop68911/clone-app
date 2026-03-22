import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { concat, EMPTY, map, Observable, of, switchMap, timeout } from 'rxjs';

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

interface RagDocumentListEnvelope {
  value?: RagDocumentResponse[];
  [key: string]: unknown;
}

export interface RagAskRequest {
  question: string;
  docKey: string;
  topK?: number;
  languageCode?: string;
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
  characterKey?: string;
  characterIndex?: number;
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
  promptTxt?: string;
  charactersInImage?: string[];
  segments?: RagComicSlideSegment[];
  [key: string]: unknown;
}

export interface RagComicSlide {
  id?: number;
  comicGroupNoteId?: number;
  comicNoteId?: number;
  naration?: string;
  promptTxt?: string;
  charactersInSlide?: RagComicSlideCharacter[];
  comicNote?: RagComicSlideNote;
  imageUrls?: string[];
  [key: string]: unknown;
}

export interface RagComicSlidesWithImagesResponse {
  docKey?: string;
  docId?: number;
  folder?: string;
  lastLimit?: number;
  count?: number;
  returnedCount?: number;
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
  charactersSavedCount?: number;
  slidesSavedCount?: number;
  slides?: RagComicSlidesWithImagesResponse;
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

export interface RagSlideDialog {
  id?: number;
  dialogOrder?: number;
  speakerCharacterName?: string;
  speakerCharacterKey?: string;
  speakerGender?: string;
  dialogLine?: string;
  context?: string | null;
  [key: string]: unknown;
}

export interface RagSlideDialogsResponse {
  docKey?: string;
  docId?: number;
  slideId?: number;
  count?: number;
  dialogs?: RagSlideDialog[];
  [key: string]: unknown;
}

interface PipelineCharacterRawResponseItem {
  id?: number;
  characterName?: string;
  characterKey?: string;
  gender?: string;
  appearance?: string;
  alternateNames?: string[];
  imageUrl?: string;
  promptTxt?: string;
  [key: string]: unknown;
}

interface PipelineCharactersRawResponse {
  docKey?: string;
  docId?: number;
  count?: number;
  characters?: PipelineCharacterRawResponseItem[];
  [key: string]: unknown;
}

interface PipelineSlideRawNote {
  note_id?: number;
  chunk_index?: number;
  location?: string;
  main_note?: string;
  importance?: number;
  [key: string]: unknown;
}

interface PipelineSlideRawCharacter {
  character_name?: string;
  character_key?: string;
  character_index?: number;
  [key: string]: unknown;
}

interface PipelineSlideRaw {
  id?: number;
  chunkId?: number;
  noteId?: number;
  chunkIndex?: number;
  chunkIndexes?: number[];
  note?: PipelineSlideRawNote;
  unimportant?: PipelineSlideRawNote[];
  charactersInSlide?: PipelineSlideRawCharacter[];
  finalSummary?: string;
  imagePrompt?: string;
  imageUrl?: string;
  promptTxt?: string;
  [key: string]: unknown;
}

interface PipelineSlidesResponse {
  docKey?: string;
  docId?: number;
  lastLimit?: number;
  count?: number;
  returnedCount?: number;
  slides?: PipelineSlideRaw[];
  [key: string]: unknown;
}

interface PipelineProcessAllResponse {
  docKey?: string;
  docId?: number;
  limit?: number;
  processedChunks?: number;
  lastSceneId?: number;
  charactersSavedCount?: number;
  slidesSavedCount?: number;
  slides?: PipelineSlidesResponse;
  notes?: RagComicNoteResponse[];
  comicNotes?: RagComicNoteResponse[] | Record<string, unknown>;
  groupNotes?: Record<string, unknown>;
  isLastBatch?: boolean;
  [key: string]: unknown;
}

@Injectable({ providedIn: 'root' })
export class RagApiService {
  private readonly baseUrl = '/api/rag';
  private readonly pipelineBaseUrl = '/api/pipeline';
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
      .get<RagDocumentResponse[] | RagDocumentListEnvelope>(`${this.baseUrl}/documents`)
      .pipe(
        timeout(this.listDocumentsTimeoutMs),
        map((response) => {
          if (Array.isArray(response)) {
            return response;
          }
          return Array.isArray(response?.value) ? response.value : [];
        })
      );
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
    return this.http
      .post<PipelineProcessAllResponse>(`${this.pipelineBaseUrl}/process_all`, req)
      .pipe(map((response) => this.toComicBookGenerateResponse(response)));
  }

  resetComicBook(docKey: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/comic-book/${encodeURIComponent(docKey)}/reset`);
  }

  resetPipelineDocument(docKey: string): Observable<void> {
    return this.http.delete<void>(
      `${this.pipelineBaseUrl}/${encodeURIComponent(docKey)}/reset`
    );
  }

  getComicSlidesWithImages(
    docKey: string,
    languageCode?: string
  ): Observable<RagComicSlidesWithImagesResponse> {
    const encodedDocKey = encodeURIComponent(docKey);

    return this.http
      .get<PipelineSlidesResponse>(`${this.pipelineBaseUrl}/${encodedDocKey}/slides`, {
        params: this.slideParams(languageCode, 0, 10)
      })
      .pipe(
        switchMap((firstResponse) =>
          concat(
            of(this.toComicSlidesWithImagesResponse(firstResponse)),
            this.shouldFetchRemainingSlides(firstResponse)
              ? this.http
                  .get<PipelineSlidesResponse>(`${this.pipelineBaseUrl}/${encodedDocKey}/slides`, {
                    params: this.slideParams(languageCode, 10)
                  })
                  .pipe(
                    map((restResponse) =>
                      this.toComicSlidesWithImagesResponse(
                        this.mergeSlidesResponses(firstResponse, restResponse)
                      )
                    )
                  )
              : EMPTY
          )
        )
      );
  }

  getCharacterReferenceImages(docKey: string): Observable<RagCharacterReferenceImageListResponse> {
    return this.http
      .get<PipelineCharactersRawResponse>(
        `${this.pipelineBaseUrl}/${encodeURIComponent(docKey)}/characters_raw`
      )
      .pipe(map((response) => this.toCharacterReferenceImageListResponse(response)));
  }

  getSlidePrompt(docKey: string, slideId: number, languageCode?: string): Observable<RagSlidePromptResponse> {
    return this.http
      .get<PipelineSlidesResponse>(`${this.pipelineBaseUrl}/${encodeURIComponent(docKey)}/slides`, {
        params: this.languageParams(languageCode, true)
      })
      .pipe(
        map((response) => {
          const slide = Array.isArray(response.slides)
            ? response.slides.find((entry) => entry.id === slideId)
            : null;
          return {
            docKey: response.docKey,
            docId: response.docId,
            slideId,
            promptText: this.toTrimmedString(slide?.promptTxt)
          };
        })
      );
  }

  getSlideHeads(docKey: string, slideId: number): Observable<RagSlideHeadsResponse> {
    return this.http.get<RagSlideHeadsResponse>(
      `${this.baseUrl}/comic-book/${encodeURIComponent(docKey)}/gcs-slide-heads/${slideId}`
    );
  }

  getSlideDialogs(
    docKey: string,
    slideId: number,
    languageCode?: string
  ): Observable<RagSlideDialogsResponse> {
    return this.http.get<RagSlideDialogsResponse>(
      `${this.pipelineBaseUrl}/${encodeURIComponent(docKey)}/slides/${slideId}/dialogs`,
      {
        params: this.languageParams(languageCode)
      }
    );
  }

  private languageParams(languageCode?: string, includePromptTxt?: boolean): HttpParams | undefined {
    const normalized = typeof languageCode === 'string' ? languageCode.trim().toLowerCase() : '';
    let params = normalized ? new HttpParams().set('lang', normalized) : undefined;

    if (includePromptTxt) {
      params = (params ?? new HttpParams()).set('includePromptTxt', 'true');
    }

    return params;
  }

  private slideParams(
    languageCode?: string,
    start?: number,
    end?: number,
    includePromptTxt?: boolean
  ): HttpParams | undefined {
    let params = this.languageParams(languageCode, includePromptTxt);

    if (typeof start === 'number' && Number.isFinite(start)) {
      params = (params ?? new HttpParams()).set('start', Math.max(0, Math.floor(start)));
    }

    if (typeof end === 'number' && Number.isFinite(end)) {
      params = (params ?? new HttpParams()).set('end', Math.max(0, Math.floor(end)));
    }

    return params;
  }

  private shouldFetchRemainingSlides(response: PipelineSlidesResponse): boolean {
    const totalCount = typeof response.count === 'number' ? response.count : 0;
    const returnedCount =
      typeof response.returnedCount === 'number'
        ? response.returnedCount
        : Array.isArray(response.slides)
          ? response.slides.length
          : 0;

    return totalCount > returnedCount;
  }

  private mergeSlidesResponses(
    firstResponse: PipelineSlidesResponse,
    restResponse: PipelineSlidesResponse
  ): PipelineSlidesResponse {
    const firstSlides = Array.isArray(firstResponse.slides) ? firstResponse.slides : [];
    const restSlides = Array.isArray(restResponse.slides) ? restResponse.slides : [];

    return {
      ...restResponse,
      docKey: this.toTrimmedString(firstResponse.docKey) ?? this.toTrimmedString(restResponse.docKey),
      docId: firstResponse.docId ?? restResponse.docId,
      count:
        typeof restResponse.count === 'number'
          ? restResponse.count
          : typeof firstResponse.count === 'number'
            ? firstResponse.count
            : firstSlides.length + restSlides.length,
      returnedCount: firstSlides.length + restSlides.length,
      slides: [...firstSlides, ...restSlides]
    };
  }

  private toCharacterReferenceImageListResponse(
    response: PipelineCharactersRawResponse
  ): RagCharacterReferenceImageListResponse {
    const characters = Array.isArray(response.characters)
      ? response.characters.map((character) => ({
          characterName: this.toTrimmedString(character.characterName),
          imageUrl: this.toTrimmedString(character.imageUrl),
          characterKey: this.toTrimmedString(character.characterKey),
          gender: this.toTrimmedString(character.gender),
          appearance: this.toTrimmedString(character.appearance),
          alternateNames: Array.isArray(character.alternateNames)
            ? character.alternateNames.filter(
                (name): name is string => typeof name === 'string' && name.trim().length > 0
              )
            : [],
          promptTxt: this.toTrimmedString(character.promptTxt),
          id: character.id
        }))
      : [];

    return {
      docKey: this.toTrimmedString(response.docKey),
      docId: response.docId,
      count: typeof response.count === 'number' ? response.count : characters.length,
      characters
    };
  }

  private toComicSlidesWithImagesResponse(
    response: PipelineSlidesResponse
  ): RagComicSlidesWithImagesResponse {
    const slides = Array.isArray(response.slides)
      ? response.slides.map((slide) => this.toComicSlide(slide))
      : [];

    return {
      docKey: this.toTrimmedString(response.docKey),
      docId: response.docId,
      lastLimit:
        typeof response.lastLimit === 'number' && Number.isFinite(response.lastLimit)
          ? response.lastLimit
          : undefined,
      count: typeof response.count === 'number' ? response.count : slides.length,
      returnedCount:
        typeof response.returnedCount === 'number' ? response.returnedCount : slides.length,
      slideCount: typeof response.count === 'number' ? response.count : slides.length,
      slides
    };
  }

  private toComicBookGenerateResponse(
    response: PipelineProcessAllResponse
  ): RagComicBookGenerateResponse {
    return {
      docKey: this.toTrimmedString(response.docKey),
      docId: response.docId,
      limit: response.limit,
      processedChunks: response.processedChunks,
      lastSceneId: response.lastSceneId,
      charactersSavedCount: response.charactersSavedCount,
      slidesSavedCount: response.slidesSavedCount,
      slides: response.slides
        ? this.toComicSlidesWithImagesResponse(response.slides)
        : undefined,
      notes: response.notes,
      comicNotes: response.comicNotes,
      groupNotes: response.groupNotes,
      isLastBatch: response.isLastBatch
    };
  }

  private toComicSlide(slide: PipelineSlideRaw): RagComicSlide {
    const note = slide.note;
    const imagePrompt = this.toTrimmedString(slide.imagePrompt);
    const promptTxt = this.toTrimmedString(slide.promptTxt);
    const narration =
      this.toTrimmedString(slide.finalSummary) ??
      this.toTrimmedString(note?.main_note) ??
      imagePrompt ??
      undefined;
    const imageUrl = this.toTrimmedString(slide.imageUrl);
    const charactersInImage = Array.isArray(slide.charactersInSlide)
      ? slide.charactersInSlide
          .map((character) => this.toTrimmedString(character.character_name))
          .filter((name): name is string => Boolean(name))
      : [];
    const charactersInSlide = Array.isArray(slide.charactersInSlide)
      ? slide.charactersInSlide.map((character) => ({
          name: this.toTrimmedString(character.character_name),
          characterKey: this.toTrimmedString(character.character_key),
          characterIndex:
            typeof character.character_index === 'number' ? character.character_index : undefined
        }))
      : [];

    return {
      id: slide.id,
      comicNoteId: slide.noteId,
      naration: narration,
      promptTxt,
      charactersInSlide,
      comicNote: {
        id: slide.noteId ?? note?.note_id,
        chunkIndex: slide.chunkIndex ?? note?.chunk_index,
        imagePrompt,
        promptTxt,
        charactersInImage,
        segments: note
          ? [
              {
                location: this.toTrimmedString(note.location),
                main_note: this.toTrimmedString(note.main_note)
              }
            ]
          : []
      },
      imageUrls: imageUrl ? [imageUrl] : []
    };
  }

  private toTrimmedString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
}
