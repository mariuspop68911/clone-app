import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { EMPTY, Observable, expand, filter, map, of, switchMap, take, throwError, timeout, timer } from 'rxjs';
import { appEnvironment, buildApiUrl } from '../config/app-environment';

export interface RagIngestResponse {
  docKey?: string;
  documentId?: number;
  chunksInserted?: number;
  ingestId?: string;
  jobId?: string;
}

export interface RagIngestStatusResponse {
  ingestId?: string;
  stage?: string;
  status?: string;
  message?: string;
  [key: string]: unknown;
}

export interface AppJobCreateResponse {
  jobId: string;
  status?: string;
  message?: string;
}

export interface AppJobStatusResponse {
  jobId?: string;
  jobType?: string;
  status?: string;
  progressPercent?: number;
  stage?: string;
  message?: string;
  targetDocKey?: string;
  targetDocId?: number;
  result?: unknown;
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

export interface RagDocumentPdfPreviewResponse {
  pdfUrl?: string;
  url?: string;
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

export interface StorySourceBookResponse {
  source?: string;
  sourceId?: string;
  title?: string;
  pageCount?: number;
  firstPublishYear?: number;
  authors?: string[];
  languages?: string[];
  tags?: string[];
  coverUrl?: string;
  summary?: string;
  readerUrl?: string;
  downloadUrl?: string;
  totalPages?: number;
  pages?: number;
  [key: string]: unknown;
}

export interface StorySourceImportFileRequest {
  source: string;
  sourceId: string;
  title?: string;
  readerUrl?: string | null;
  downloadUrl?: string | null;
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
  title?: string;
  slideType?: string;
  chapterIndex?: number;
  displayOrder?: number;
  chunkIndex?: number;
  chunkIndexes?: number[];
  pipelineStage?: string;
  pipelineRunning?: boolean;
  pipelineDone?: boolean;
  pipelineFailed?: boolean;
  pipelineRevision?: number;
  pipelineMessage?: string;
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
  processAllId?: string;
  start?: number | null;
  end?: number | null;
}

export interface RagProcessSeriesRequest {
  docId: number;
  limit: number;
}

export interface RagSeriesEpisodeCharacterImage {
  characterName?: string;
  character_name?: string;
  imageUrl?: string;
  image_url?: string;
  [key: string]: unknown;
}

export interface RagSeriesEpisodeEventResponse {
  eventId?: string;
  event_id?: string;
  summary?: string;
  imageUrl?: string;
  image_url?: string;
  type?: string;
  characterImageUrls?: string[];
  character_image_urls?: string[] | null;
  characterImages?: RagSeriesEpisodeCharacterImage[];
  character_images?: RagSeriesEpisodeCharacterImage[] | null;
  has_dialogue?: boolean;
  dialogueLines?: RagSeriesEpisodeDialogueLine[];
  dialogue_lines?: RagSeriesEpisodeDialogueLine[];
  characters_in_scene?: string[] | null;
  location?: string | null;
  strongest?: boolean;
  object_tag?: string | null;
  why_selected?: string | null;
  importance_score?: number | null;
  narrative_function?: string | null;
  [key: string]: unknown;
}

export interface RagSeriesEpisodeDialogueLine {
  text?: string;
  speaker?: string;
  speakerKey?: string;
  speaker_key?: string;
  [key: string]: unknown;
}

export interface RagSeriesEpisodeResponse {
  id: number;
  episodeId?: string;
  episode_id?: string;
  episodeTitle?: string;
  episode_title?: string;
  startChunkIndex?: number;
  endChunkIndex?: number;
  createdAt?: string;
  events?: RagSeriesEpisodeEventResponse[];
  selected_events?: RagSeriesEpisodeEventResponse[];
  episode_summary?: string;
  anchor_summary?: string;
  anchor_event_id?: string;
  selected_event_ids?: string[];
  excluded_event_ids?: string[];
  [key: string]: unknown;
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
  printedStartPageNumber?: number;
  printedEndPageNumber?: number;
  keyTakeaways?: string[];
  quiz?: RagLearningChapterQuiz;
  reviewQuiz?: RagLearningChapterQuiz;
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
  review?: boolean;
  completed?: boolean;
  [key: string]: unknown;
}

export interface RagLearningPipelineContextResponse {
  docKey?: string;
  docId?: number;
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
  incorrectAnsweredQuestions: {
    question: string;
    referencePageNumbers: number[];
  }[];
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

export interface RagGenerateReviewQuizSource {
  sourceIndex: number;
  incorrectAnsweredQuestion: string;
  referencePageNumbers: number[];
}

export interface RagGenerateReviewQuizRequest {
  docKey: string;
  chapterIndex: number;
  chapterTitle: string;
  keyTakeaways: string;
  reviewSources: RagGenerateReviewQuizSource[];
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
  title?: string;
  slideType?: string;
  chapterIndex?: number;
  displayOrder?: number;
  pipelineStage?: string;
  pipelineRunning?: boolean;
  pipelineDone?: boolean;
  pipelineFailed?: boolean;
  pipelineRevision?: number;
  pipelineMessage?: string;
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
  reviewQuiz?: PipelineLearningChapterQuizRaw;
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
  private readonly baseUrl = buildApiUrl('/rag');
  private readonly pipelineBaseUrl = buildApiUrl('/pipeline');
  private readonly learningPipelineBaseUrl = buildApiUrl('/learning_pipeline');
  private readonly seriesBaseUrl = buildApiUrl('/series');
  private readonly jobsBaseUrl = buildApiUrl('/jobs');
  private readonly storySourceBooksBaseUrl = buildApiUrl('/story-source-books');
  private readonly ingestTimeoutMs = 120000;
  private readonly listDocumentsTimeoutMs = 30000;
  private readonly jobPollIntervalMs = appEnvironment.polling.jobStatusMs;

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
    return this.waitForJobResult(
      this.http.post<AppJobCreateResponse>(`${this.pipelineBaseUrl}/process_all`, req),
      (result) => this.toComicBookGenerateResponse((result ?? {}) as PipelineProcessAllResponse)
    );
  }

  generateLearningSlides(req: RagGenerateLearningSlidesRequest): Observable<AppJobCreateResponse> {
    return this.http.post<AppJobCreateResponse>(
      `${this.learningPipelineBaseUrl}/generate-learning`,
      req
    );
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
    return this.waitForJobResult(
      this.http.post<AppJobCreateResponse>(
        `${this.learningPipelineBaseUrl}/generate-chapter-quiz`,
        req
      ),
      (result) => this.toLearningChapterQuiz((result ?? {}) as PipelineLearningChapterQuizRaw)
    );
  }

  completeChapterQuiz(req: RagCompleteChapterQuizRequest): Observable<unknown> {
    return this.http.post(`${this.learningPipelineBaseUrl}/complete-chapter-quiz`, req);
  }

  answerChapterQuiz(req: RagAnswerChapterQuizRequest): Observable<unknown> {
    return this.http.post(`${this.learningPipelineBaseUrl}/answer-chapter-quiz`, req);
  }

  generateReviewQuiz(req: RagGenerateReviewQuizRequest): Observable<RagLearningChapterQuiz> {
    return this.waitForJobResult(
      this.http.post<AppJobCreateResponse>(
        `${this.learningPipelineBaseUrl}/generate-review-quiz`,
        req
      ),
      (result) => this.toLearningChapterQuiz((result ?? {}) as PipelineLearningChapterQuizRaw)
    );
  }

  generateChapterReviewSlides(
    req: RagGenerateChapterReviewSlidesRequest
  ): Observable<RagGenerateChapterReviewSlidesResponse> {
    return this.waitForJobResult(
      this.http.post<AppJobCreateResponse>(
        `${this.learningPipelineBaseUrl}/generate-chapter-review-slides`,
        req
      ),
      (result) =>
        this.toGenerateChapterReviewSlidesResponse(
          (result ?? {}) as PipelineLearningChapterReviewSlidesResponse
        )
    );
  }

  explainLearningSummary(req: RagExplainLike12Request): Observable<RagExplainLike12Response> {
    return this.http.post<RagExplainLike12Response>(
      `${this.learningPipelineBaseUrl}/explain-like-12`,
      req
    );
  }

  getDocumentPdfPreviewUrl(docId: number): Observable<string> {
    return this.http
      .get<RagDocumentPdfPreviewResponse>(
        `${this.baseUrl}/documents/${encodeURIComponent(String(docId))}/pdf-preview`
      )
      .pipe(
        map((response) => {
          const pdfUrl =
            typeof response?.pdfUrl === 'string' && response.pdfUrl.trim()
              ? response.pdfUrl.trim()
              : typeof response?.url === 'string' && response.url.trim()
                ? response.url.trim()
                : '';
          if (!pdfUrl) {
            throw new Error('No PDF preview URL returned.');
          }
          return pdfUrl;
        })
      );
  }

  getRandomStorySourceBooks(limit = 20): Observable<StorySourceBookResponse[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 20;
    const params = new HttpParams().set('limit', String(safeLimit));
    return this.http.get<StorySourceBookResponse[]>(`${this.storySourceBooksBaseUrl}/random`, { params });
  }

  importStorySourceBookFile(
    request: StorySourceImportFileRequest
  ): Observable<HttpResponse<Blob>> {
    return this.http.post(`${this.storySourceBooksBaseUrl}/import-file`, request, {
      observe: 'response',
      responseType: 'blob'
    });
  }

  deleteDocument(docId: number): Observable<void> {
    return this.http.delete<void>(
      `${this.baseUrl}/documents/${encodeURIComponent(String(docId))}`
    );
  }

  processSeries(req: RagProcessSeriesRequest): Observable<AppJobCreateResponse> {
    return this.http.post<AppJobCreateResponse>(
      `${this.seriesBaseUrl}/documents/${encodeURIComponent(String(req.docId))}/process`,
      {
        docId: req.docId,
        limit: Math.max(1, Math.floor(req.limit))
      }
    );
  }

  getSeriesEpisodes(docId: number): Observable<RagSeriesEpisodeResponse[]> {
    return this.http.get<RagSeriesEpisodeResponse[]>(
      `${this.seriesBaseUrl}/documents/${encodeURIComponent(String(docId))}/episodes`
    );
  }

  getComicSlidesWithImages(
    docKey: string,
    languageCode?: string
  ): Observable<RagComicSlidesWithImagesResponse> {
    const encodedDocKey = encodeURIComponent(docKey);

    return this.http
      .get<PipelineSlidesResponse>(`${this.pipelineBaseUrl}/${encodedDocKey}/slides`, {
        params: this.slideParams(languageCode)
      })
      .pipe(map((response) => this.toComicSlidesWithImagesResponse(response)));
  }

  getCharacterReferences(docKey: string): Observable<RagCharacterReferenceImageResponse[]> {
    return this.http.get<RagCharacterReferenceImageResponse[]>(
      `${this.pipelineBaseUrl}/${encodeURIComponent(docKey)}/character-references`
    );
  }

  normalizeComicSlidesPayload(payload: unknown): RagComicSlide[] {
    if (Array.isArray(payload)) {
      return payload
        .filter((slide): slide is PipelineSlideRaw => Boolean(slide) && typeof slide === 'object')
        .map((slide) => this.toComicSlide(slide));
    }

    if (!payload || typeof payload !== 'object') {
      return [];
    }

    const slideContainer = payload as { slides?: unknown; slide?: unknown };
    if (Array.isArray(slideContainer.slides)) {
      return slideContainer.slides
        .filter((slide): slide is PipelineSlideRaw => Boolean(slide) && typeof slide === 'object')
        .map((slide) => this.toComicSlide(slide));
    }

    if (slideContainer.slide && typeof slideContainer.slide === 'object') {
      return [this.toComicSlide(slideContainer.slide as PipelineSlideRaw)];
    }

    return [this.toComicSlide(payload as PipelineSlideRaw)];
  }

  getSlideHeads(docKey: string, slideId: number): Observable<RagSlideHeadsResponse> {
    return this.http.get<RagSlideHeadsResponse>(
      `${this.pipelineBaseUrl}/${encodeURIComponent(docKey)}/slides/${slideId}/heads`
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

  getJobStatus(jobId: string): Observable<AppJobStatusResponse> {
    return this.http.get<AppJobStatusResponse>(`${this.jobsBaseUrl}/${encodeURIComponent(jobId)}`);
  }

  normalizeLearningSlidesResponse(payload: unknown): RagLearnSlidesResponse {
    return this.toLearningSlidesResponse((payload ?? {}) as PipelineLearningSlidesResponse);
  }

  private waitForJobResult<T>(
    createJob$: Observable<AppJobCreateResponse>,
    mapResult: (result: unknown, status: AppJobStatusResponse) => T
  ): Observable<T> {
    return createJob$.pipe(
      switchMap((job) => this.pollJob(job.jobId)),
      switchMap((status) => {
        if (!this.isSuccessfulJob(status)) {
          const message =
            typeof status.message === 'string' && status.message.trim()
              ? status.message.trim()
              : 'Job failed';
          return throwError(() => new Error(message));
        }
        return of(mapResult(status.result, status));
      })
    );
  }

  private pollJob(jobId: string): Observable<AppJobStatusResponse> {
    return this.getJobStatus(jobId).pipe(
      expand((status) =>
        this.isTerminalJob(status)
          ? EMPTY
          : timer(this.jobPollIntervalMs).pipe(switchMap(() => this.getJobStatus(jobId)))
      ),
      filter((status) => this.isTerminalJob(status)),
      take(1)
    );
  }

  private isTerminalJob(status: AppJobStatusResponse | null | undefined): boolean {
    const value = typeof status?.status === 'string' ? status.status.trim().toUpperCase() : '';
    return value === 'DONE' || value === 'FAILED';
  }

  private isSuccessfulJob(status: AppJobStatusResponse | null | undefined): boolean {
    return typeof status?.status === 'string' && status.status.trim().toUpperCase() === 'DONE';
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
            printedStartPageNumber:
              typeof chapter['printedStartPageNumber'] === 'number' &&
              Number.isFinite(chapter['printedStartPageNumber'])
                ? chapter['printedStartPageNumber']
                : undefined,
            printedEndPageNumber:
              typeof chapter['printedEndPageNumber'] === 'number' &&
              Number.isFinite(chapter['printedEndPageNumber'])
                ? chapter['printedEndPageNumber']
                : undefined,
            keyTakeaways: [],
            quiz: chapter.quiz ? this.toLearningChapterQuiz(chapter.quiz) : undefined,
            reviewQuiz: chapter.reviewQuiz
              ? this.toLearningChapterQuiz(chapter.reviewQuiz)
              : undefined,
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
      review: this.toNullableBoolean(response?.['review']) ?? false,
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
      title: this.toTrimmedString(slide.title),
      slideType: this.toTrimmedString(slide.slideType),
      chapterIndex:
        typeof slide.chapterIndex === 'number' && Number.isFinite(slide.chapterIndex)
          ? slide.chapterIndex
          : undefined,
      displayOrder:
        typeof slide.displayOrder === 'number' && Number.isFinite(slide.displayOrder)
          ? slide.displayOrder
          : undefined,
      chunkIndex: typeof slide.chunkIndex === 'number' && Number.isFinite(slide.chunkIndex)
        ? slide.chunkIndex
        : undefined,
      chunkIndexes: Array.isArray(slide.chunkIndexes)
        ? slide.chunkIndexes.filter(
            (value): value is number => typeof value === 'number' && Number.isFinite(value)
          )
        : [],
      pipelineStage: this.toTrimmedString(slide.pipelineStage),
      pipelineRunning:
        typeof slide.pipelineRunning === 'boolean' ? slide.pipelineRunning : undefined,
      pipelineDone: typeof slide.pipelineDone === 'boolean' ? slide.pipelineDone : undefined,
      pipelineFailed: typeof slide.pipelineFailed === 'boolean' ? slide.pipelineFailed : undefined,
      pipelineRevision:
        typeof slide.pipelineRevision === 'number' && Number.isFinite(slide.pipelineRevision)
          ? slide.pipelineRevision
          : undefined,
      pipelineMessage: this.toTrimmedString(slide.pipelineMessage),
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
