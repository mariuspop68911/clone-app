import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { concat, EMPTY, map, Observable, of, switchMap, timeout } from 'rxjs';

export interface RagIngestResponse {
  docKey: string;
  documentId: number;
  chunksInserted: number;
  ingestId?: string;
}

export interface RagIngestStatusResponse {
  ingestId?: string;
  stage?: string;
  status?: string;
  message?: string;
  [key: string]: unknown;
}

export type RagIngestMode =
  | 'Story Mode'
  | 'Learning Mode'
  | 'Action Mode'
  | 'Extraction Mode';

export interface RagDocumentResponse {
  id?: number;
  documentId?: number;
  docKey?: string;
  filename?: string;
  fileName?: string;
  createdAt?: string;
  coverUrl?: string;
  lastSlide?: number;
  [key: string]: unknown;
}

export interface RagDocumentLastSlideRequest {
  lastSlide: number;
}

export interface RagDocumentLastSlideResponse {
  docId?: number;
  docKey?: string;
  lastSlide?: number;
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
}

export interface RagGenerateLearningSlidesRequest {
  docKey: string;
}

export interface RagLearnSlide {
  id?: number;
  chunkId?: number;
  chunkIndex?: number;
  chunkIndexes?: number[];
  sourcePageNumbers?: number[];
  imageUrl?: string;
  imageUrls?: string[];
  title?: string;
  summary?: string;
  keyTakeaways?: string[] | boolean;
  isKeyTakeaways?: boolean;
  [key: string]: unknown;
}

export interface RagLearnSlidesResponse {
  docKey?: string;
  docId?: number;
  lastLimit?: number;
  count?: number;
  returnedCount?: number;
  slides?: RagLearnSlide[];
  [key: string]: unknown;
}

export interface RagLearningPipelineChapter {
  chapterIndex?: number;
  title?: string;
  startChunkIndex?: number;
  endChunkIndex?: number;
  startPageNumber?: number;
  endPageNumber?: number;
  keyTakeaways?: string[];
  quiz?: RagLearningChapterQuiz;
  reviewSlides?: RagLearnSlide[];
  [key: string]: unknown;
}

export interface RagLearningChapterQuizQuestion {
  question?: string;
  options?: string[];
  correctAnswerIndex?: number;
  referencePageNumbers?: number[];
  selectedAnswerIndex?: number;
  [key: string]: unknown;
}

export interface RagLearningChapterQuiz {
  docKey?: string;
  docId?: number;
  chapterIndex?: number;
  chapterTitle?: string;
  questions?: RagLearningChapterQuizQuestion[];
  completed?: boolean;
  [key: string]: unknown;
}

export interface RagLearningPipelineContextResponse {
  docKey?: string;
  docId?: number;
  mainTopics?: string[];
  coreConcepts?: string[];
  keyTerms?: string[];
  importantExamples?: string[];
  causeAndEffect?: string[];
  commonMisunderstandings?: string[];
  importantTakeaways?: string[];
  teachingInsights?: string[];
  chapters?: RagLearningPipelineChapter[];
  [key: string]: unknown;
}

export interface RagExplainLike12Request {
  docKey: string;
  summary: string;
  chunkId?: number | null;
  imageUrl?: string | null;
}

export interface RagExplainLike12Response {
  docKey?: string;
  chunkId?: number;
  summary?: string;
  explanation?: string;
  [key: string]: unknown;
}

export interface RagGenerateChapterQuizSlide {
  slideIndex: number;
  title: string;
  summary: string;
  sourcePageNumbers: number[];
}

export interface RagGenerateChapterQuizRequest {
  docKey: string;
  chapterIndex: number;
  chapterTitle: string;
  keyTakeaways: string;
  slides: RagGenerateChapterQuizSlide[];
}

export interface RagCompleteChapterQuizRequest {
  docKey: string;
  chapterIndex: number;
  chapterTitle?: string;
}

export interface RagAnswerChapterQuizRequest {
  docKey: string;
  chapterIndex: number;
  questionIndex: number;
  selectedAnswerIndex: number;
}

export interface RagGenerateChapterReviewSlidesRequest {
  docKey: string;
  chapterIndex: number;
}

export interface RagGenerateChapterReviewSlidesResponse {
  docKey?: string;
  docId?: number;
  chapterIndex?: number;
  chapterTitle?: string;
  referencePageNumbers?: number[];
  count?: number;
  slides?: RagLearnSlide[];
  [key: string]: unknown;
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

interface PipelineLearningSlideRaw {
  id?: number;
  chunkId?: number;
  chunkIndex?: number;
  chunkIndexes?: number[];
  sourcePageNumbers?: number[];
  imageUrl?: string;
  imageUrls?: string[];
  title?: string;
  summary?: string;
  keyTakeaways?: string[] | boolean;
  key_takeaways?: string[] | boolean;
  importantTakeaways?: string[] | boolean;
  isKeyTakeaways?: boolean;
  is_key_takeaways?: boolean;
  [key: string]: unknown;
}

interface PipelineLearningSlidesResponse {
  docKey?: string;
  docId?: number;
  lastLimit?: number;
  count?: number;
  returnedCount?: number;
  slides?: PipelineLearningSlideRaw[];
  [key: string]: unknown;
}

interface PipelineLearningChapterRaw {
  chapterIndex?: number;
  title?: string;
  startChunkIndex?: number;
  endChunkIndex?: number;
  startPageNumber?: number;
  endPageNumber?: number;
  quiz?: PipelineLearningChapterQuizRaw;
  reviewSlides?: PipelineLearningSlideRaw[];
  [key: string]: unknown;
}

interface PipelineLearningChapterQuizQuestionRaw {
  question?: string;
  options?: string[];
  correctAnswerIndex?: number;
  referencePageNumbers?: number[];
  selectedAnswerIndex?: number;
  [key: string]: unknown;
}

interface PipelineLearningChapterQuizRaw {
  docKey?: string;
  docId?: number;
  chapterIndex?: number;
  chapterTitle?: string;
  questions?: PipelineLearningChapterQuizQuestionRaw[];
  completed?: boolean;
  [key: string]: unknown;
}

interface PipelineLearningContextResponse {
  docKey?: string;
  docId?: number;
  mainTopics?: string[];
  coreConcepts?: string[];
  keyTerms?: string[];
  importantExamples?: string[];
  causeAndEffect?: string[];
  commonMisunderstandings?: string[];
  importantTakeaways?: string[];
  teachingInsights?: string[];
  chapters?: PipelineLearningChapterRaw[];
  [key: string]: unknown;
}

interface PipelineLearningChapterReviewSlidesResponse {
  docKey?: string;
  docId?: number;
  chapterIndex?: number;
  chapterTitle?: string;
  referencePageNumbers?: number[];
  count?: number;
  slides?: PipelineLearningSlideRaw[];
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
  private readonly learningPipelineBaseUrl = '/api/learning_pipeline';
  private readonly ingestTimeoutMs = 120000;
  private readonly listDocumentsTimeoutMs = 30000;

  constructor(private readonly http: HttpClient) {}

  ingestDocument(
    docKey: string,
    file: File,
    mode?: RagIngestMode,
    ingestId?: string,
    thumbnailFile?: File | null
  ): Observable<RagIngestResponse> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    if (thumbnailFile) {
      formData.append('thumbnail', thumbnailFile, thumbnailFile.name);
    }
    if (typeof ingestId === 'string' && ingestId.trim()) {
      formData.append('ingestId', ingestId.trim());
    }
    const params: Record<string, string> = { docKey };
    if (typeof mode === 'string' && mode.trim()) {
      params['mode'] = mode;
    }

    return this.http
      .post<RagIngestResponse>(`${this.baseUrl}/ingest`, formData, { params })
      .pipe(timeout(this.ingestTimeoutMs));
  }

  getIngestStatus(ingestId: string): Observable<RagIngestStatusResponse> {
    return this.http.get<RagIngestStatusResponse>(
      `${this.baseUrl}/ingest/${encodeURIComponent(ingestId)}/status`
    );
  }

  listDocuments(): Observable<RagDocumentResponse[]> {
    return this.http
      .get<RagDocumentResponse[] | RagDocumentListEnvelope>(`${this.baseUrl}/documents`)
      .pipe(
        timeout(this.listDocumentsTimeoutMs),
        map((response) => {
          if (Array.isArray(response)) {
            return response.map((doc) => this.toDocumentResponse(doc));
          }
          return Array.isArray(response?.value) ? response.value.map((doc) => this.toDocumentResponse(doc)) : [];
        })
      );
  }

  saveDocumentLastSlide(
    docId: number,
    lastSlide: number
  ): Observable<RagDocumentLastSlideResponse> {
    return this.http.post<RagDocumentLastSlideResponse>(
      `${this.baseUrl}/documents/${encodeURIComponent(String(docId))}/last-slide`,
      { lastSlide: Math.max(0, Math.floor(lastSlide)) }
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

  generateLearningSlides(req: RagGenerateLearningSlidesRequest): Observable<RagLearnSlidesResponse> {
    return this.http
      .post<PipelineLearningSlidesResponse>(
        `${this.learningPipelineBaseUrl}/generate-learning`,
        req
      )
      .pipe(map((response) => this.toLearningSlidesResponse(response)));
  }

  getLearningSlides(docKey: string, start?: number, end?: number): Observable<RagLearnSlidesResponse> {
    return this.http
      .get<PipelineLearningSlidesResponse>(
        `${this.learningPipelineBaseUrl}/${encodeURIComponent(docKey)}/slides`,
        { params: this.slideParams(undefined, start, end) }
      )
      .pipe(map((response) => this.toLearningSlidesResponse(response)));
  }

  getLearningPipelineContext(docKey: string): Observable<RagLearningPipelineContextResponse> {
    return this.http
      .get<PipelineLearningContextResponse>(
        `${this.learningPipelineBaseUrl}/${encodeURIComponent(docKey)}/context`
      )
      .pipe(map((response) => this.toLearningPipelineContextResponse(response)));
  }

  generateChapterQuiz(
    req: RagGenerateChapterQuizRequest
  ): Observable<RagLearningChapterQuiz> {
    return this.http
      .post<PipelineLearningChapterQuizRaw>(
        `${this.learningPipelineBaseUrl}/generate-chapter-quiz`,
        req
      )
      .pipe(map((response) => this.toLearningChapterQuiz(response)));
  }

  completeChapterQuiz(req: RagCompleteChapterQuizRequest): Observable<unknown> {
    return this.http.post(`${this.learningPipelineBaseUrl}/complete-chapter-quiz`, req);
  }

  answerChapterQuiz(req: RagAnswerChapterQuizRequest): Observable<unknown> {
    return this.http.post(`${this.learningPipelineBaseUrl}/answer-chapter-quiz`, req);
  }

  generateChapterReviewSlides(
    req: RagGenerateChapterReviewSlidesRequest
  ): Observable<RagGenerateChapterReviewSlidesResponse> {
    return this.http
      .post<PipelineLearningChapterReviewSlidesResponse>(
        `${this.learningPipelineBaseUrl}/generate-chapter-review-slides`,
        req
      )
      .pipe(map((response) => this.toGenerateChapterReviewSlidesResponse(response)));
  }

  explainLearningSummary(req: RagExplainLike12Request): Observable<RagExplainLike12Response> {
    return this.http.post<RagExplainLike12Response>(
      `${this.learningPipelineBaseUrl}/explain-like-12`,
      req
    );
  }

  getDocumentPdfUrl(docId: number): string {
    return `${this.baseUrl}/documents/${encodeURIComponent(String(docId))}/pdf`;
  }

  resetComicBook(docKey: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/comic-book/${encodeURIComponent(docKey)}/reset`);
  }

  resetPipelineDocument(docKey: string): Observable<void> {
    return this.http.delete<void>(
      `${this.pipelineBaseUrl}/${encodeURIComponent(docKey)}/reset`
    );
  }

  resetLearningSlides(docKey: string): Observable<void> {
    return this.http.delete<void>(
      `${this.learningPipelineBaseUrl}/${encodeURIComponent(docKey)}/slides`
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

  private toDocumentResponse(response: RagDocumentResponse): RagDocumentResponse {
    const numericId =
      typeof response.documentId === 'number'
        ? response.documentId
        : typeof response.id === 'number'
          ? response.id
          : undefined;

    return {
      ...response,
      id: typeof response.id === 'number' ? response.id : numericId,
      documentId: numericId,
      docKey: this.toTrimmedString(response.docKey),
      filename: this.toTrimmedString(response.filename) ?? this.toTrimmedString(response.fileName),
      fileName: this.toTrimmedString(response.fileName) ?? this.toTrimmedString(response.filename),
      createdAt: this.toTrimmedString(response.createdAt),
      coverUrl: this.toTrimmedString(response.coverUrl),
      lastSlide:
        typeof response.lastSlide === 'number' && Number.isFinite(response.lastSlide)
          ? response.lastSlide
          : undefined
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

  private toLearningSlidesResponse(
    response: PipelineLearningSlidesResponse
  ): RagLearnSlidesResponse {
    const slides = Array.isArray(response.slides)
      ? response.slides.map((slide) => this.toLearningSlide(slide))
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
      slides
    };
  }

  private toLearningPipelineContextResponse(
    response: PipelineLearningContextResponse
  ): RagLearningPipelineContextResponse {
    return {
      docKey: this.toTrimmedString(response.docKey),
      docId: response.docId,
      mainTopics: this.toStringList(response.mainTopics),
      coreConcepts: this.toStringList(response.coreConcepts),
      keyTerms: this.toStringList(response.keyTerms),
      importantExamples: this.toStringList(response.importantExamples),
      causeAndEffect: this.toStringList(response.causeAndEffect),
      commonMisunderstandings: this.toStringList(response.commonMisunderstandings),
      importantTakeaways: this.toStringList(response.importantTakeaways),
      teachingInsights: this.toStringList(response.teachingInsights),
      chapters: Array.isArray(response.chapters)
        ? response.chapters.map((chapter) => ({
            chapterIndex:
              typeof chapter.chapterIndex === 'number' && Number.isFinite(chapter.chapterIndex)
                ? chapter.chapterIndex
                : undefined,
            title: this.toTrimmedString(chapter.title),
            startChunkIndex:
              typeof chapter.startChunkIndex === 'number' && Number.isFinite(chapter.startChunkIndex)
                ? chapter.startChunkIndex
                : undefined,
            endChunkIndex:
              typeof chapter.endChunkIndex === 'number' && Number.isFinite(chapter.endChunkIndex)
                ? chapter.endChunkIndex
                : undefined,
            startPageNumber:
              typeof chapter.startPageNumber === 'number' && Number.isFinite(chapter.startPageNumber)
                ? chapter.startPageNumber
                : undefined,
            endPageNumber:
              typeof chapter.endPageNumber === 'number' && Number.isFinite(chapter.endPageNumber)
                ? chapter.endPageNumber
                : undefined,
            keyTakeaways: [],
            quiz: chapter.quiz ? this.toLearningChapterQuiz(chapter.quiz) : undefined,
            reviewSlides: Array.isArray(chapter.reviewSlides)
              ? chapter.reviewSlides.map((slide) => this.toLearningSlide(slide))
              : []
          }))
        : []
    };
  }

  private toGenerateChapterReviewSlidesResponse(
    response: PipelineLearningChapterReviewSlidesResponse
  ): RagGenerateChapterReviewSlidesResponse {
    return {
      docKey: this.toTrimmedString(response.docKey),
      docId: typeof response.docId === 'number' ? response.docId : undefined,
      chapterIndex:
        typeof response.chapterIndex === 'number' && Number.isFinite(response.chapterIndex)
          ? response.chapterIndex
          : undefined,
      chapterTitle: this.toTrimmedString(response.chapterTitle),
      referencePageNumbers: Array.isArray(response.referencePageNumbers)
        ? response.referencePageNumbers.filter(
            (value): value is number => typeof value === 'number' && Number.isFinite(value)
          )
        : [],
      count: typeof response.count === 'number' ? response.count : undefined,
      slides: Array.isArray(response.slides)
        ? response.slides.map((slide) => this.toLearningSlide(slide))
        : []
    };
  }

  private toLearningChapterQuiz(
    response: PipelineLearningChapterQuizRaw | null | undefined
  ): RagLearningChapterQuiz {
    return {
      docKey: this.toTrimmedString(response?.docKey),
      docId: typeof response?.docId === 'number' ? response.docId : undefined,
      chapterIndex:
        typeof response?.chapterIndex === 'number' && Number.isFinite(response.chapterIndex)
          ? response.chapterIndex
          : undefined,
      chapterTitle: this.toTrimmedString(response?.chapterTitle),
      questions: Array.isArray(response?.questions)
        ? response.questions.map((question) => ({
            question: this.toTrimmedString(question.question),
            options: this.toStringList(question.options),
            correctAnswerIndex:
              typeof question.correctAnswerIndex === 'number' &&
              Number.isFinite(question.correctAnswerIndex)
                ? question.correctAnswerIndex
                : undefined,
            selectedAnswerIndex:
              typeof question.selectedAnswerIndex === 'number' &&
              Number.isFinite(question.selectedAnswerIndex)
                ? question.selectedAnswerIndex
                : undefined,
            referencePageNumbers: Array.isArray(question.referencePageNumbers)
              ? question.referencePageNumbers.filter(
                  (value): value is number => typeof value === 'number' && Number.isFinite(value)
                )
              : []
          }))
        : [],
      completed: this.toNullableBoolean(response?.completed) ?? false
    };
  }

  private toLearningSlide(slide: PipelineLearningSlideRaw): RagLearnSlide {
    return {
      id: typeof slide.id === 'number' ? slide.id : undefined,
      chunkId: typeof slide.chunkId === 'number' ? slide.chunkId : undefined,
      chunkIndex: typeof slide.chunkIndex === 'number' ? slide.chunkIndex : undefined,
      chunkIndexes: Array.isArray(slide.chunkIndexes)
        ? slide.chunkIndexes.filter(
            (value): value is number => typeof value === 'number' && Number.isFinite(value)
          )
        : [],
      sourcePageNumbers: Array.isArray(slide.sourcePageNumbers)
        ? slide.sourcePageNumbers.filter(
            (value): value is number => typeof value === 'number' && Number.isFinite(value)
          )
        : [],
      imageUrl: this.toTrimmedString(slide.imageUrl),
      imageUrls: Array.isArray(slide.imageUrls)
        ? slide.imageUrls.filter(
            (value): value is string => typeof value === 'string' && value.trim().length > 0
          )
        : [],
      title: this.toTrimmedString(slide.title),
      summary: this.toTrimmedString(slide.summary),
      keyTakeaways: this.toBooleanOrStringList(
        slide.keyTakeaways ?? slide.key_takeaways ?? slide.importantTakeaways
      ),
      isKeyTakeaways:
        this.toNullableBoolean(slide.isKeyTakeaways) ??
        this.toNullableBoolean(slide.is_key_takeaways) ??
        this.toBooleanOrStringList(
          slide.keyTakeaways ?? slide.key_takeaways ?? slide.importantTakeaways
        ) === true,
      review: this.toNullableBoolean(slide['review']) ?? undefined,
      keyTakeaway: this.toNullableBoolean(slide['keyTakeaway']) ?? undefined,
      chapterIndex:
        typeof slide['chapterIndex'] === 'number' && Number.isFinite(slide['chapterIndex'])
          ? (slide['chapterIndex'] as number)
          : undefined,
      chapterTitle: this.toTrimmedString(slide['chapterTitle']),
      mainTopics: this.toStringList(slide['mainTopics']),
      coreConcepts: this.toStringList(slide['coreConcepts'])
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

  private toStringList(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((entry) => this.toTrimmedString(entry))
      .filter((entry): entry is string => Boolean(entry));
  }

  private toNullableBoolean(value: unknown): boolean | null {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
    }
    return null;
  }

  private toBooleanOrStringList(value: unknown): string[] | boolean | undefined {
    const booleanValue = this.toNullableBoolean(value);
    if (booleanValue !== null) {
      return booleanValue;
    }

    const strings = this.toStringList(value);
    return strings.length ? strings : undefined;
  }
}
