import {
  CUSTOM_ELEMENTS_SCHEMA,
  Component,
  ElementRef,
  Input,
  ViewChild,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { DomSanitizer, SafeHtml, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { DocumentChatComponent } from '../document-chat';
import { IngestProgressService, IngestProgressStatus } from '../import/ingest-progress.service';
import {
  RagApiService,
  RagCharacterReferenceImageResponse,
  RagGenerateChapterQuizRequest,
  RagGenerateChapterReviewSlidesResponse,
  RagComicSlide,
  RagDocumentResponse,
  RagIngestMode,
  RagLearningChapterQuiz,
  RagGenerateReviewQuizRequest,
  RagLearningPipelineChapter,
  RagLearningPipelineContextResponse,
  RagLearnSlide,
  RagLearnSlidesResponse,
  RagSlideDialog,
  RagSlideDialogsResponse,
  RagSlideHeadCharacter,
  RagSlideHeadCoordinatesJson,
  RagSlideHeadsResponse
} from '../../core/api/rag-api.service';
import { TtsApiService } from '../../core/api/tts-api.service';
import { ImageViewerModalComponent } from './image-viewer-modal';
import { LearningExplainService } from './learning-explain.service';
import { SlideProgressComponent } from './slide-progress';
import { SlideSideBubbleComponent } from './slide-side-bubble';
import {
  ChapterSection,
  ChapterSectionSelection
} from './pipeline-chapters-sidebar';
import { PipelineSlideProgressItem } from './slide-progress.service';
import { LoadingOverlayService } from '../../shared/loading-overlay.service';
import { AppShellUiService } from '../../app-shell-ui.service';
import { register } from 'swiper/element/bundle';
import { Subscription, firstValueFrom } from 'rxjs';
import { Client, IMessage, StompSubscription } from '@stomp/stompjs';
import { marked } from 'marked';

register();

interface CardToken {
  text: string;
  isWord: boolean;
  wordIndex: number;
}

interface DialogueEntry {
  id: number | null;
  character: string;
  gender: string;
  line: string;
  text: string;
  context: string;
}

interface TtsSegment {
  kind: 'narration' | 'dialogue' | 'context';
  text: string;
  wordStart: number;
  wordCount: number;
  entityId?: number;
  character?: string;
  line?: string;
}

interface StoredSlideBatchState {
  start: number;
  end: number;
  hasMore: boolean;
}

interface SlideHeadMarker {
  characterName: string;
  leftPercent: number;
  topPercent: number;
}

interface SlideDialogueBubble extends SlideHeadMarker {
  line: string;
  wordStart: number;
}

interface SlideBubbleAnchor {
  leftPercent: number;
  topPercent: number;
}

interface CharacterIntroDetails {
  name: string;
  imageUrl: string | null;
  slideTitle: string;
  introText: string;
}

interface SourcePreviewPage {
  pageNumber: number;
  pdfUrl: string;
  trustedPdfUrl: SafeResourceUrl;
}

interface StoryProcessEventEnvelope {
  eventType?: string;
  type?: string;
  event?: string;
  event_name?: string;
  kind?: string;
  status?: string;
  message?: string;
  error?: string;
  payload?: unknown;
  data?: unknown;
  slides?: unknown;
  slide?: unknown;
  [key: string]: unknown;
}

type ActiveVisualMode = 'none' | 'dialogue' | 'context';
type PipelineViewMode = 'comic' | 'learning';

@Component({
  selector: 'app-pipeline',
  imports: [
    DocumentChatComponent,
    ImageViewerModalComponent,
    SlideProgressComponent,
    SlideSideBubbleComponent
  ],
  templateUrl: './pipeline.html',
  styleUrl: './pipeline.scss',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class PipelineComponent {
  private static readonly comicBatchSize = 10;
  private static readonly learningBatchStateStorageKey = 'pipeline-learning-batch-state';
  private static readonly keyTakeawaysImageAssetUrl = '/assets/key-takeaways.svg';
  private static readonly lastSlidePersistDebounceMs = 900;
  private static readonly highlightLeadSeconds = 1;
  private static readonly ttsPrefetchConcurrency = 3;
  private static readonly defaultLanguage = 'en';
  private static readonly narratorCharacterName = 'Narrator';
  private static readonly silentWavDataUrl =
    'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';
  private audio: HTMLAudioElement | null = null;
  private slidesOverlayToken: symbol | null = null;
  private generationOverlayToken: symbol | null = null;
  private currentObjectUrl: string | null = null;
  private sourcePdfLoadToken = 0;
  private loadedSourceSignature = '';
  private lastAutoLoadTriggerKey = '';
  private storyProcessRequestDocKey = '';
  private storyProcessStartedDocKey = '';
  private storyProcessClient: Client | null = null;
  private storyProcessSubscription: StompSubscription | null = null;
  private activeProcessAllId = '';
  private suppressStoryAutoProcessStart = false;
  private selectionModeLongPressTimer: ReturnType<typeof setTimeout> | null = null;
  private chapterQuizCheckTimer: ReturnType<typeof setTimeout> | null = null;
  private learningImagePointerStart: { x: number; y: number; moved: boolean } | null = null;
  private suppressLearningImageClick = false;
  private pendingLearningContinuationIndex: number | null = null;
  private desiredInitialSlideIndex: number | null = null;
  private lastPersistedSlideIndex: number | null = null;
  private pendingLastSlideIndex: number | null = null;
  private persistLastSlideTimer: ReturnType<typeof setTimeout> | null = null;
  private playbackToken = 0;
  private onSegmentEnd: (() => void) | null = null;
  private audioUnlocked = false;
  private readonly pendingTtsRequests = new Set<Subscription>();
  private autoRequestedInitialSlides = false;
  private learningRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly failedUriMap = signal<Record<string, true>>({});
  private readonly quizGeneratingChapterIndexMap = signal<Record<number, true>>({});
  private readonly learningImageActiveIndexMap = signal<Record<string, number>>({});
  private readonly onFirstInteractionBound = () => {
    void this.ensureAudioUnlocked();
  };
  private readonly onVisibilityChangeBound = () => {
    if (typeof document === 'undefined' || !document.hidden) {
      return;
    }
    this.autoPlayEnabled.set(false);
    this.stopCardTts();
  };
  private readonly learningExplainService = inject(LearningExplainService);
  private readonly appShellUi = inject(AppShellUiService);
  private readonly loadingOverlay = inject(LoadingOverlayService);
  private readonly ingestProgress = inject(IngestProgressService);
  @Input() modalMode = false;

  docKey = signal('');
  viewMode = signal<PipelineViewMode>('comic');
  loading = signal(false);
  clearing = signal(false);
  message = signal('');
  showLoadMoreSlide = signal(false);
  learningBatchStart = signal(0);
  learningBatchEnd = signal(PipelineComponent.comicBatchSize);
  showLoadMoreLearningSlide = signal(false);
  processAllRunning = signal(false);
  ttsMessage = signal('');
  ttsLoading = signal(false);
  ttsPlaying = signal(false);
  autoPlayEnabled = signal(false);
  playingCardKey = signal('');
  activeDialogueCardKey = signal('');
  activeDialogueCharacter = signal('');
  activeDialogueLine = signal('');
  activeContextLine = signal('');
  activeVisualMode = signal<ActiveVisualMode>('none');
  activeDialogueWordStart = signal(0);
  summaryHiddenCardKey = signal('');
  ttsCurrentWord = signal(-1);
  ttsTotalWords = signal(0);
  selectedLanguage = signal(PipelineComponent.defaultLanguage);
  ttsSpeed = signal(1);
  currentSlide = signal(0);
  fullscreenReader = signal(false);
  askOpen = signal(false);
  sourceOpen = signal(false);
  characterInfoOpen = signal(false);
  explainOpen = this.learningExplainService.panelOpen;
  documentMode = signal<RagIngestMode | null>(null);
  slides = signal<RagComicSlide[]>([]);
  learningSlides = signal<RagLearnSlide[]>([]);
  slidesLoading = signal(false);
  slidesMessage = signal('');
  slideDialogsById = signal<Record<number, DialogueEntry[]>>({});
  slideDialogsLoadingById = signal<Record<number, boolean>>({});
  slideDialogsErrorById = signal<Record<number, string>>({});
  slideHeadsByCardKey = signal<Record<string, SlideHeadMarker[]>>({});
  slideHeadsLoadingByCardKey = signal<Record<string, boolean>>({});
  activeHeadCardKey = signal('');
  sourcePages = signal<SourcePreviewPage[]>([]);
  sourceLoading = signal(false);
  sourceMessage = signal('');
  characterReferences = signal<RagCharacterReferenceImageResponse[]>([]);
  selectedCharacterIntro = signal<CharacterIntroDetails | null>(null);
  docId = signal<number | null>(null);
  learningContext = signal<RagLearningPipelineContextResponse | null>(null);
  learningContextLoading = signal(false);
  learningContextError = signal('');
  imageViewerOpen = signal(false);
  imageViewerUrl = signal('');
  imageViewerAlt = signal('Image preview');
  imageViewerZoom = signal(1);
  imageViewerExplainUrl = signal('');
  imageViewerExplainSummary = signal('');
  imageViewerExplainChunkId = signal<number | null>(null);
  askRequestedQuestion = signal('');
  askRequestKey = signal(0);
  explainSelectionVisible = this.learningExplainService.selectionVisible;
  selectionModeEnabled = this.learningExplainService.selectionModeEnabled;
  explainSelectionText = this.learningExplainService.selectionText;
  explainSelectionChunkId = this.learningExplainService.selectionChunkId;
  explainSelectionButtonTop = this.learningExplainService.selectionButtonTop;
  explainSelectionButtonLeft = this.learningExplainService.selectionButtonLeft;
  explainSelectionBoxes = this.learningExplainService.selectionBoxes;
  explanationLoading = this.learningExplainService.loading;
  explanationSummary = this.learningExplainService.summary;
  explanationText = this.learningExplainService.text;
  explanationChunkId = this.learningExplainService.chunkId;
  explanationMessage = this.learningExplainService.message;
  private readonly chapterItemsComputed = computed(() => {
    const chapters = this.learningContext()?.chapters ?? [];
    if (!chapters.length) {
      return [];
    }

    return chapters.map((chapter) => ({
      ...chapter,
      keyTakeaways: this.chapterKeyTakeaways(chapter),
      reviewQuiz: chapter.reviewQuiz,
      reviewSlides: this.chapterReviewSlides(chapter)
    }));
  });
  private readonly visibleLearningSlidesComputed = computed(() => {
    const baseSlides = this.learningSlides();
    const context = this.learningContext();
    if (!context?.chapters?.length) {
      return baseSlides;
    }

    const indexedBaseSlides = baseSlides.map((slide, index) => ({ slide, index }));
    const usedIndexes = new Set<number>();
    const orderedSlides: RagLearnSlide[] = [];

    for (const chapter of context.chapters) {
      const chapterBaseSlides = indexedBaseSlides.filter(({ slide, index }) => {
        if (usedIndexes.has(index)) {
          return false;
        }
        return this.slideMatchesChapter(slide, chapter);
      });

      for (const entry of chapterBaseSlides) {
        usedIndexes.add(entry.index);
        orderedSlides.push(entry.slide);
      }

      if (chapterBaseSlides.length) {
        orderedSlides.push(...this.quizLearningSlidesForChapter(chapter));
        orderedSlides.push(...this.chapterReviewSlides(chapter));
        orderedSlides.push(...this.reviewQuizLearningSlidesForChapter(chapter));
      }
    }

    for (const entry of indexedBaseSlides) {
      if (!usedIndexes.has(entry.index)) {
        orderedSlides.push(entry.slide);
      }
    }

    return orderedSlides;
  });
  private readonly currentChapterComputed = computed(() => {
    const chapters = this.chapterItemsComputed();
    if (!chapters.length) {
      return null;
    }

    const items = this.viewMode() === 'learning' ? this.visibleLearningSlidesComputed() : this.slides();
    const currentIndex = this.currentSlide();
    if (currentIndex < 0 || currentIndex >= items.length) {
      return null;
    }

    return this.viewMode() === 'learning'
      ? this.chapterForLearningSlide(items[currentIndex] as RagLearnSlide, chapters)
      : this.chapterForComicSlide(items[currentIndex] as RagComicSlide, chapters);
  });
  private readonly currentChapterSlidesForProgressComputed = computed(() => {
    const allSlides = this.visibleLearningSlidesComputed();
    const currentChapter = this.currentChapterComputed();
    if (!currentChapter) {
      return allSlides;
    }

    const chapterSlides = allSlides.filter((slide) => this.slideMatchesChapter(slide, currentChapter));
    return chapterSlides.length ? chapterSlides : allSlides;
  });
  private readonly activeChapterIndexComputed = computed(() => {
    const chapters = this.chapterItemsComputed();
    const current = this.currentChapterComputed();
    if (!chapters.length || current === null) {
      return null;
    }

    const nextIndex = chapters.findIndex((chapter) => this.sameChapter(chapter, current));
    return nextIndex >= 0 ? nextIndex : null;
  });
  private readonly availableChapterIndexesComputed = computed(() => {
    const chapters = this.chapterItemsComputed();
    if (!chapters.length) {
      return [];
    }

    return chapters.reduce<number[]>((indexes, chapter, index) => {
      const hasLoadedBaseSlide =
        this.viewMode() === 'learning'
          ? this.learningSlides().some((slide) => this.slideMatchesChapter(slide, chapter))
          : this.findSlideIndexForChapter(chapter) !== null;

      if (hasLoadedBaseSlide) {
        indexes.push(index);
      }
      return indexes;
    }, []);
  });
  private readonly currentChapterTitleComputed = computed(() => {
    if (this.viewMode() !== 'learning') {
      return '';
    }

    const chapter = this.currentChapterComputed();
    return typeof chapter?.title === 'string' ? chapter.title.trim() : '';
  });
  private readonly slideProgressItemsComputed = computed<PipelineSlideProgressItem[]>(() => {
    if (this.viewMode() === 'learning') {
      return this.currentChapterSlidesForProgressComputed().map((slide) => ({
        kind: this.slideProgressKindForLearningSlide(slide)
      }));
    }

    return this.slides().map(() => ({ kind: 'story' }));
  });
  private readonly slideProgressCurrentIndexComputed = computed(() => {
    if (this.viewMode() !== 'learning') {
      return this.currentSlide();
    }

    const currentSlide = this.currentLearningSlide();
    if (!currentSlide) {
      return 0;
    }

    const chapterSlides = this.currentChapterSlidesForProgressComputed();
    const currentKey = this.learningSlideProgressKey(currentSlide);
    const index = chapterSlides.findIndex((slide) => this.learningSlideProgressKey(slide) === currentKey);
    return index >= 0 ? index : 0;
  });
  @ViewChild('carouselEl') private carouselElement?: ElementRef<{
    swiper?: {
      activeIndex?: number;
      realIndex?: number;
      slideTo?: (index: number) => void;
      update?: () => void;
    };
  }>;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly ragApi: RagApiService,
    private readonly ttsApi: TtsApiService,
    private readonly sanitizer: DomSanitizer
  ) {
    effect(() => {
      this.appShellUi.setBrowseButtonVisible(
        !(this.askOpen() || this.sourceOpen() || this.characterInfoOpen() || this.explainOpen())
      );
    });

    effect(() => {
      const currentDocKey = this.docKey().trim();
      const tracked = this.ingestProgress.trackedStatus(currentDocKey);
      const canRefreshLearning =
        tracked?.backgroundProcessing === true &&
        (this.documentMode() === 'Learning Mode' ||
          this.documentMode() === 'Action Mode' ||
          this.documentMode() === 'Extraction Mode' ||
          (this.learningContext()?.chapters?.length ?? 0) > 0);

      if (!currentDocKey || !canRefreshLearning) {
        this.clearBackgroundLearningRefreshTimer();
        return;
      }

      this.scheduleBackgroundLearningRefresh(currentDocKey);
    });

    if (typeof window !== 'undefined') {
      this.audio = new Audio();
      window.addEventListener('pointerdown', this.onFirstInteractionBound, { passive: true });
      document.addEventListener('visibilitychange', this.onVisibilityChangeBound);
    }

    this.route.paramMap.subscribe((params) => {
      const key = params.get('docKey') ?? '';
      this.docKey.set(key);
      this.viewMode.set('comic');
      this.loading.set(false);
      this.clearing.set(false);
      this.message.set('');
      const learningBatchState = this.readBatchState(
        key,
        PipelineComponent.learningBatchStateStorageKey
      );
      this.showLoadMoreSlide.set(false);
      this.learningBatchStart.set(learningBatchState?.start ?? 0);
      this.learningBatchEnd.set(learningBatchState?.end ?? PipelineComponent.comicBatchSize);
      this.showLoadMoreLearningSlide.set(learningBatchState?.hasMore ?? false);
      this.ttsMessage.set('');
      this.ttsLoading.set(false);
      this.ttsPlaying.set(false);
      this.autoPlayEnabled.set(false);
      this.playingCardKey.set('');
      this.activeDialogueCardKey.set('');
      this.activeDialogueCharacter.set('');
      this.activeDialogueLine.set('');
      this.activeContextLine.set('');
      this.activeVisualMode.set('none');
      this.activeDialogueWordStart.set(0);
      this.summaryHiddenCardKey.set('');
      this.ttsCurrentWord.set(-1);
      this.ttsTotalWords.set(0);
      this.currentSlide.set(0);
      this.askOpen.set(false);
      this.sourceOpen.set(false);
      this.characterInfoOpen.set(false);
      this.learningExplainService.reset();
      this.clearSelectionModeLongPressTimer();
      this.clearChapterQuizCheckTimer();
      this.documentMode.set(null);
      this.slides.set([]);
      this.learningSlides.set([]);
      this.slidesLoading.set(false);
      this.slidesMessage.set('');
      this.slideDialogsById.set({});
      this.slideDialogsLoadingById.set({});
      this.slideDialogsErrorById.set({});
      this.slideHeadsByCardKey.set({});
      this.slideHeadsLoadingByCardKey.set({});
      this.activeHeadCardKey.set('');
      this.sourcePages.set([]);
      this.sourceLoading.set(false);
      this.sourceMessage.set('');
      this.closeStoryProcessStream();
      this.storyProcessStartedDocKey = '';
      this.storyProcessRequestDocKey = '';
      this.suppressStoryAutoProcessStart = false;
      this.processAllRunning.set(false);
      this.characterReferences.set([]);
      this.selectedCharacterIntro.set(null);
      this.docId.set(null);
      this.desiredInitialSlideIndex = null;
      this.lastPersistedSlideIndex = null;
      this.pendingLastSlideIndex = null;
      this.clearPersistLastSlideTimer();
      this.quizGeneratingChapterIndexMap.set({});
      this.learningImageActiveIndexMap.set({});
      this.learningContext.set(null);
      this.learningContextLoading.set(false);
      this.learningContextError.set('');
      this.imageViewerOpen.set(false);
      this.imageViewerUrl.set('');
      this.imageViewerAlt.set('Image preview');
      this.imageViewerZoom.set(1);
      this.imageViewerExplainUrl.set('');
      this.imageViewerExplainSummary.set('');
      this.imageViewerExplainChunkId.set(null);
      this.hideSlidesOverlay();
      this.hideGenerationOverlay();
      this.autoRequestedInitialSlides = false;
      this.loadedSourceSignature = '';
      this.lastAutoLoadTriggerKey = '';
      this.failedUriMap.set({});
      this.stopCardTts();
      this.clearBackgroundLearningRefreshTimer();

      if (key.trim()) {
        this.loadContextAndSlides(key);
      }
    });
  }

  ngOnDestroy(): void {
    this.appShellUi.setBrowseButtonVisible(true);
    this.hideSlidesOverlay();
    this.hideGenerationOverlay();
    this.clearPersistLastSlideTimer();
    this.clearSelectionModeLongPressTimer();
    this.clearChapterQuizCheckTimer();
    this.clearBackgroundLearningRefreshTimer();
    this.closeStoryProcessStream();
    this.suppressStoryAutoProcessStart = false;
    this.processAllRunning.set(false);
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this.onFirstInteractionBound);
      document.removeEventListener('visibilitychange', this.onVisibilityChangeBound);
    }
    this.stopCardTts();
    this.setDocumentFullscreenReader(false);
    this.clearObjectUrl();
  }

  toggleFullscreenReader(): void {
    this.setFullscreenReader(!this.fullscreenReader());
  }

  closeFullscreenReader(): void {
    this.setFullscreenReader(false);
  }

  generateAll(): void {
    const key = this.docKey().trim();
    if (!key) {
      this.message.set('Missing docKey.');
      return;
    }
    if (this.loading() || this.clearing()) {
      return;
    }

    this.viewMode.set('comic');
    console.info('[Pipeline] Generate all requested', {
      docKey: key,
      startedAt: new Date().toISOString()
    });
    this.lastAutoLoadTriggerKey = '';
    this.loadSlides(key);
  }

  generateLearning(): void {
    const key = this.docKey().trim();
    if (!key) {
      this.message.set('Missing docKey.');
      return;
    }
    if (this.loading() || this.clearing()) {
      return;
    }

    this.viewMode.set('learning');
    this.loading.set(true);
    this.message.set('');
    this.lastAutoLoadTriggerKey = '';
    this.currentSlide.set(0);
    this.learningSlides.set([]);
    this.learningBatchStart.set(0);
    this.learningBatchEnd.set(PipelineComponent.comicBatchSize);
    this.showLoadMoreLearningSlide.set(false);
    this.writeBatchState(key, PipelineComponent.learningBatchStateStorageKey, {
      start: 0,
      end: PipelineComponent.comicBatchSize,
      hasMore: false
    });
    this.generateLearningBatch(key, 0, PipelineComponent.comicBatchSize);
  }

  loadMoreSlides(): void {
    const key = this.docKey().trim();
    if (!key) {
      this.message.set('Missing docKey.');
      return;
    }
    if (this.loading() || this.clearing()) {
      return;
    }

    if (this.viewMode() === 'learning') {
      const nextStart = this.learningBatchEnd();
      const nextEnd = nextStart + PipelineComponent.comicBatchSize;
      this.generateLearningBatch(key, nextStart, nextEnd);
    }
  }

  clearSlides(): void {
    const key = this.docKey().trim();
    if (!key) {
      this.message.set('Missing docKey.');
      return;
    }
    if (this.loading() || this.clearing()) {
      return;
    }

    this.clearing.set(true);
    this.message.set('');
    this.closeStoryProcessStream();
    this.storyProcessStartedDocKey = '';
    this.storyProcessRequestDocKey = '';
    this.processAllRunning.set(false);
    this.stopCardTts();

    this.ragApi.resetComicBook(key).subscribe({
      next: () => {
        this.clearing.set(false);
        this.resetSlideState(key);
        this.message.set('Comic book data cleared.');
      },
      error: (err) => {
        const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
        const backendMessage =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
        this.clearing.set(false);
        this.message.set(`Failed to clear comic book (${status}): ${backendMessage}`);
      }
    });
  }

  private maybeAutoLoadMoreAfterSlideAdvance(nextIndex: number): void {
    const docKey = this.docKey().trim();
    if (!docKey || this.loading() || this.clearing()) {
      return;
    }

    const currentBatchStart =
      Math.floor(nextIndex / PipelineComponent.comicBatchSize) * PipelineComponent.comicBatchSize;
    const triggerIndex = currentBatchStart;
    if (nextIndex < triggerIndex) {
      return;
    }

    if (this.viewMode() === 'learning') {
      if (!this.showLoadMoreLearningSlide() || currentBatchStart === 0 || nextIndex !== currentBatchStart) {
        return;
      }

      const triggerKey = `learning:${currentBatchStart}`;
      if (this.lastAutoLoadTriggerKey === triggerKey) {
        return;
      }

      this.lastAutoLoadTriggerKey = triggerKey;
      this.loadMoreSlides();
    }
  }

  onSlideIndexChange(event: Event): void {
    const target = event.target as { swiper?: { activeIndex?: number; realIndex?: number } } | null;
    if (target !== this.carouselElement?.nativeElement) {
      return;
    }
    const rawIndex = target?.swiper?.realIndex ?? target?.swiper?.activeIndex;
    if (typeof rawIndex !== 'number' || !Number.isFinite(rawIndex)) {
      return;
    }
    const nextIndex = Math.max(0, Math.floor(rawIndex));
    this.currentSlide.set(nextIndex);
    this.persistLastSlide(nextIndex);
    this.summaryHiddenCardKey.set('');
    this.learningExplainService.hideSelectionButton();
    this.playCurrentSlideIfAutoPlayEnabled();
    this.maybeAutoLoadMoreAfterSlideAdvance(nextIndex);
    if (this.viewMode() === 'learning' && this.sourceOpen()) {
      void this.loadSourcePagesForCurrentSlide();
    }
  }

  goToSlide(index: number): void {
    const itemsLength = this.visibleSlideCount();
    if (index < 0 || index >= itemsLength) {
      return;
    }
    const swiper = this.carouselElement?.nativeElement?.swiper;
    if (swiper?.slideTo) {
      swiper.slideTo(index);
      this.currentSlide.set(index);
      this.persistLastSlide(index);
      this.summaryHiddenCardKey.set('');
      this.learningExplainService.hideSelectionButton();
      this.playCurrentSlideIfAutoPlayEnabled();
      this.maybeAutoLoadMoreAfterSlideAdvance(index);
      if (this.viewMode() === 'learning' && this.sourceOpen()) {
        void this.loadSourcePagesForCurrentSlide();
      }
    }
  }

  chapterItems(): RagLearningPipelineChapter[] {
    return this.chapterItemsComputed();
  }

  visibleLearningSlides(): RagLearnSlide[] {
    return this.visibleLearningSlidesComputed();
  }

  activeChapterIndex(): number | null {
    return this.activeChapterIndexComputed();
  }

  backgroundIngestStatus(): IngestProgressStatus | null {
    return this.ingestProgress.trackedStatus(this.docKey());
  }

  availableChapterIndexes(): number[] {
    return this.availableChapterIndexesComputed();
  }

  isBackgroundProcessingActive(): boolean {
    return this.backgroundIngestStatus()?.backgroundProcessing === true;
  }

  backgroundProcessingMessage(): string {
    return (
      this.backgroundIngestStatus()?.message ||
      'First chapter ready. Remaining chapters are still processing in the background.'
    );
  }

  quizGeneratingChapterIndexes(): number[] {
    return Object.keys(this.quizGeneratingChapterIndexMap())
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
  }

  goToChapter(chapter: RagLearningPipelineChapter): void {
    const nextIndex = this.findSlideIndexForChapterSection(chapter, 'summary');
    if (nextIndex === null) {
      return;
    }
    this.goToSlide(nextIndex);
  }

  goToChapterSection(selection: ChapterSectionSelection): void {
    const nextIndex = this.findSlideIndexForChapterSection(selection.chapter, selection.section);
    if (nextIndex === null) {
      return;
    }
    this.goToSlide(nextIndex);
  }

  setLanguage(languageCode: string): void {
    const normalized = this.normalizeLanguage(languageCode);
    if (normalized === this.selectedLanguage()) {
      return;
    }

    this.selectedLanguage.set(normalized);
    this.stopCardTts();
    this.currentSlide.set(0);
    this.summaryHiddenCardKey.set('');
    this.slideDialogsById.set({});
    this.slideDialogsLoadingById.set({});
    this.slideDialogsErrorById.set({});

    const key = this.docKey().trim();
    if (key) {
      this.loadContextAndSlides(key);
    }
  }

  openImageViewer(imageUrl: string, alt: string, learningSlide: RagLearnSlide | null = null): void {
    this.imageViewerUrl.set(this.imageSrc(imageUrl));
    this.imageViewerAlt.set(alt);
    this.imageViewerZoom.set(1);
    this.imageViewerExplainUrl.set(learningSlide ? this.imageSrc(imageUrl) : '');
    this.imageViewerExplainSummary.set(learningSlide ? this.learningSummaryPlainText(learningSlide) : '');
    this.imageViewerExplainChunkId.set(
      learningSlide ? this.toNullableFiniteNumber(learningSlide.chunkId) : null
    );
    this.imageViewerOpen.set(true);
  }

  onLearningImagePointerDown(event: PointerEvent): void {
    this.setOuterCarouselTouchEnabled(false);
    this.learningImagePointerStart = {
      x: event.clientX,
      y: event.clientY,
      moved: false
    };
  }

  onLearningImagePointerMove(event: PointerEvent): void {
    if (!this.learningImagePointerStart) {
      return;
    }

    const deltaX = Math.abs(event.clientX - this.learningImagePointerStart.x);
    const deltaY = Math.abs(event.clientY - this.learningImagePointerStart.y);
    if (deltaX > 8 || deltaY > 8) {
      this.learningImagePointerStart.moved = true;
    }
  }

  onLearningImagePointerUp(): void {
    this.suppressLearningImageClick = this.learningImagePointerStart?.moved ?? false;
    this.learningImagePointerStart = null;
    this.setOuterCarouselTouchEnabled(true);
  }

  onLearningImagePointerCancel(): void {
    this.learningImagePointerStart = null;
    this.suppressLearningImageClick = false;
    this.setOuterCarouselTouchEnabled(true);
  }

  openLearningImageViewerFromTap(
    event: Event,
    imageUrl: string,
    alt: string,
    learningSlide: RagLearnSlide | null = null
  ): void {
    if (this.suppressLearningImageClick) {
      this.suppressLearningImageClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    this.openImageViewer(imageUrl, alt, learningSlide);
  }

  onLearningImageCarouselSlideChange(event: Event, slide: RagLearnSlide | null): void {
    event.stopPropagation();
    const target = event.target as { swiper?: { activeIndex?: number; realIndex?: number } } | null;
    const rawIndex = target?.swiper?.realIndex ?? target?.swiper?.activeIndex;
    if (typeof rawIndex !== 'number' || !Number.isFinite(rawIndex)) {
      return;
    }

    const slideKey = this.learningImageCarouselKey(slide);
    this.learningImageActiveIndexMap.update((current) => ({
      ...current,
      [slideKey]: Math.max(0, Math.floor(rawIndex))
    }));
  }

  learningImageActiveIndex(slide: RagLearnSlide | null): number {
    const slideKey = this.learningImageCarouselKey(slide);
    return this.learningImageActiveIndexMap()[slideKey] ?? 0;
  }

  private setOuterCarouselTouchEnabled(enabled: boolean): void {
    const swiper = this.carouselElement?.nativeElement?.swiper as { allowTouchMove?: boolean } | undefined;
    if (swiper && 'allowTouchMove' in swiper) {
      swiper.allowTouchMove = enabled;
    }
  }

  private learningImageCarouselKey(slide: RagLearnSlide | null): string {
    const slideId = this.toNullableFiniteNumber(slide?.id);
    if (slideId !== null) {
      return `slide-${slideId}`;
    }

    const chunkId = this.toNullableFiniteNumber(slide?.chunkId);
    if (chunkId !== null) {
      return `chunk-${chunkId}`;
    }

    return `${slide?.title ?? ''}::${slide?.summary ?? ''}`;
  }

  private setFullscreenReader(enabled: boolean): void {
    this.fullscreenReader.set(enabled);
    this.setDocumentFullscreenReader(enabled);
    setTimeout(() => {
      const index = this.currentSlide();
      const swiper = this.carouselElement?.nativeElement?.swiper;
      swiper?.update?.();
      swiper?.slideTo?.(index);
    }, 0);
  }

  private setDocumentFullscreenReader(enabled: boolean): void {
    if (typeof document === 'undefined') {
      return;
    }
    document.body.classList.toggle('pipeline-reader-fullscreen-open', enabled);
    document.body.style.overflow = enabled ? 'hidden' : '';
  }

  closeImageViewer(): void {
    this.imageViewerOpen.set(false);
    this.imageViewerZoom.set(1);
    this.imageViewerExplainUrl.set('');
    this.imageViewerExplainSummary.set('');
    this.imageViewerExplainChunkId.set(null);
  }

  zoomInImageViewer(): void {
    this.imageViewerZoom.update((current) => Math.min(4, Math.round((current + 0.25) * 100) / 100));
  }

  zoomOutImageViewer(): void {
    this.imageViewerZoom.update((current) => Math.max(0.5, Math.round((current - 0.25) * 100) / 100));
  }

  resetImageViewerZoom(): void {
    this.imageViewerZoom.set(1);
  }

  canExplainImageViewer(): boolean {
    return !!(this.imageViewerExplainUrl() && this.imageViewerExplainSummary().trim() && this.docKey().trim());
  }

  slideImageUrl(slide: RagComicSlide): string | null {
    const urls = Array.isArray(slide.imageUrls) ? slide.imageUrls : [];
    const firstUrl = urls.find((value): value is string => typeof value === 'string' && value.trim().length > 0);
    return firstUrl ?? null;
  }

  mainNote(slide: RagComicSlide): string {
    const narration = typeof slide.naration === 'string' ? slide.naration.trim() : '';
    if (narration) {
      return narration;
    }
    const prompt =
      typeof slide.comicNote?.imagePrompt === 'string' ? slide.comicNote.imagePrompt.trim() : '';
    return prompt || 'No narration.';
  }

  dialogue(slide: RagComicSlide): string[] {
    return this.dialogueEntries(slide)
      .map((entry) => entry.text)
      .filter((entry) => entry.length > 0);
  }

  hasDialogue(slide: RagComicSlide): boolean {
    return this.dialogueEntries(slide).length > 0;
  }

  isSlideDialogueLoading(slide: RagComicSlide): boolean {
    const slideId = this.toNullableFiniteNumber(slide.id);
    return slideId === null ? false : !!this.slideDialogsLoadingById()[slideId];
  }

  slideDialogueError(slide: RagComicSlide): string {
    const slideId = this.toNullableFiniteNumber(slide.id);
    return slideId === null ? '' : this.slideDialogsErrorById()[slideId] ?? '';
  }

  imageSrc(uri: string): string {
    if (uri.startsWith('gs://')) {
      const noScheme = uri.substring(5);
      const slashIndex = noScheme.indexOf('/');
      if (slashIndex > 0) {
        const bucket = noScheme.slice(0, slashIndex);
        const objectPath = noScheme.slice(slashIndex + 1);
        return `https://storage.googleapis.com/${bucket}/${objectPath}`;
      }
    }
    return uri;
  }

  cardKey(item: RagComicSlide, index: number): string {
    const id = item.id ?? item.comicNote?.id;
    if (typeof id === 'number' && Number.isFinite(id)) {
      return `note-${id}`;
    }
    return `idx-${index}`;
  }

  currentSlideCardKey(): string {
    const slide = this.slides()[this.currentSlide()];
    if (!slide) {
      return '';
    }
    return this.cardKey(slide, this.currentSlide());
  }

  storySlideType(slide: RagComicSlide | null | undefined): string {
    return typeof slide?.slideType === 'string' ? slide.slideType.trim().toUpperCase() : '';
  }

  storySlideTypeLabel(slide: RagComicSlide | null | undefined): string {
    switch (this.storySlideType(slide)) {
      case 'BOOK_OVERVIEW':
        return 'Book Overview';
      case 'CHARACTER_INTRO':
        return 'Character Intro';
      case 'STORY':
        return 'Story';
      default:
        return '';
    }
  }

  storySlideTitle(slide: RagComicSlide | null | undefined): string {
    const title = typeof slide?.title === 'string' ? slide.title.trim() : '';
    return title || this.storySlideTypeLabel(slide);
  }

  isCardPlaying(item: RagComicSlide, index: number): boolean {
    const key = this.cardKey(item, index);
    return (this.ttsPlaying() || this.ttsLoading()) && this.playingCardKey() === key;
  }

  toggleCardTts(item: RagComicSlide, index: number): void {
    const key = this.cardKey(item, index);
    if ((this.ttsPlaying() || this.ttsLoading()) && this.playingCardKey() === key) {
      this.autoPlayEnabled.set(false);
      this.stopCardTts();
      return;
    }
    this.autoPlayEnabled.set(true);
    void this.playCardTts(item, index);
  }

  isLearningCardPlaying(index: number): boolean {
    const key = this.learningCardKey(index);
    return (this.ttsPlaying() || this.ttsLoading()) && this.playingCardKey() === key;
  }

  toggleLearningTts(item: RagLearnSlide, index: number): void {
    const key = this.learningCardKey(index);
    if ((this.ttsPlaying() || this.ttsLoading()) && this.playingCardKey() === key) {
      this.autoPlayEnabled.set(false);
      this.stopCardTts();
      return;
    }

    this.autoPlayEnabled.set(true);
    void this.playLearningCardTts(item, index);
  }

  stopAutoplayPlayback(): void {
    this.autoPlayEnabled.set(false);
    this.stopCardTts();
  }

  isLearningCardLoading(index: number): boolean {
    return this.ttsLoading() && this.playingCardKey() === this.learningCardKey(index);
  }

  isCardLoading(item: RagComicSlide, index: number): boolean {
    return this.ttsLoading() && this.playingCardKey() === this.cardKey(item, index);
  }

  shouldShowHeadMarkers(item: RagComicSlide, index: number): boolean {
    const key = this.cardKey(item, index);
    return (
      this.activeDialogueCardKey() === key &&
      (this.headMarkers(item, index).length > 0 || this.activeDialogueBubble(item, index) !== null)
    );
  }

  headMarkers(item: RagComicSlide, index: number): SlideHeadMarker[] {
    return this.slideHeadsByCardKey()[this.cardKey(item, index)] ?? [];
  }

  activeDialogueBubble(item: RagComicSlide, index: number): SlideDialogueBubble | null {
    const key = this.cardKey(item, index);
    if (this.activeVisualMode() !== 'dialogue' || this.activeDialogueCardKey() !== key) {
      return null;
    }

    const line = this.activeDialogueLine().trim();
    if (!line) {
      return null;
    }

    const anchor = this.dialogueBubbleAnchor(item, index, this.activeDialogueCharacter(), line);
    if (!anchor) {
      return null;
    }

    return {
      characterName: this.activeDialogueCharacter().trim(),
      leftPercent: anchor.leftPercent,
      topPercent: anchor.topPercent,
      line,
      wordStart: this.activeDialogueWordStart()
    };
  }

  mainNoteTokens(item: RagComicSlide): CardToken[] {
    return this.tokens(this.mainNote(item));
  }

  shouldShowSlideSummary(item: RagComicSlide, index: number): boolean {
    return this.summaryHiddenCardKey() !== this.cardKey(item, index);
  }

  dialogueZoomClass(item: RagComicSlide, index: number): string {
    const bubble = this.activeDialogueBubble(item, index);
    if (!bubble) {
      return '';
    }

    if (bubble.leftPercent <= 35) {
      return 'slide-image-zoom-left';
    }
    if (bubble.leftPercent >= 65) {
      return 'slide-image-zoom-right';
    }
    return 'slide-image-zoom-center';
  }

  activeDialogueBubbleTokens(item: RagComicSlide, index: number): CardToken[] {
    const bubble = this.activeDialogueBubble(item, index);
    return bubble ? this.tokens(bubble.line) : [];
  }

  activeDialogueFallbackLine(item: RagComicSlide, index: number): string {
    const key = this.cardKey(item, index);
    if (this.activeVisualMode() !== 'dialogue' || this.activeDialogueCardKey() !== key) {
      return '';
    }
    if (this.activeDialogueBubble(item, index)) {
      return '';
    }
    const line = this.activeDialogueLine().trim();
    const character = this.activeDialogueCharacter().trim();
    if (!line) {
      return '';
    }
    return character ? `${character}: ${line}` : line;
  }

  activeDialogueFallbackSpeaker(item: RagComicSlide, index: number): string {
    const key = this.cardKey(item, index);
    if (
      this.activeVisualMode() !== 'dialogue' ||
      this.activeDialogueCardKey() !== key ||
      this.activeDialogueBubble(item, index)
    ) {
      return '';
    }
    return this.activeDialogueCharacter().trim();
  }

  activeDialogueFallbackText(item: RagComicSlide, index: number): string {
    const key = this.cardKey(item, index);
    if (
      this.activeVisualMode() !== 'dialogue' ||
      this.activeDialogueCardKey() !== key ||
      this.activeDialogueBubble(item, index)
    ) {
      return '';
    }
    return this.activeDialogueLine().trim();
  }

  activeDialogueFallbackTokens(item: RagComicSlide, index: number): CardToken[] {
    return this.tokens(this.activeDialogueFallbackText(item, index));
  }

  activeContextText(item: RagComicSlide, index: number): string {
    const key = this.cardKey(item, index);
    if (this.activeVisualMode() !== 'context' || this.activeDialogueCardKey() !== key) {
      return '';
    }
    return this.activeContextLine().trim();
  }

  activeContextTokens(item: RagComicSlide, index: number): CardToken[] {
    return this.tokens(this.activeContextText(item, index));
  }

  isTokenActive(item: RagComicSlide, index: number, tokenWordIndex: number, offset: number): boolean {
    if (tokenWordIndex < 0 || !this.isCardPlaying(item, index)) {
      return false;
    }
    return this.ttsCurrentWord() === offset + tokenWordIndex;
  }

  mainWordCount(item: RagComicSlide): number {
    return this.countWords(this.mainNote(item));
  }

  isFailed(uri: string): boolean {
    return Boolean(this.failedUriMap()[uri]);
  }

  onImageError(uri: string, event: Event): void {
    const target = event.target as HTMLImageElement | null;
    if (!target) {
      return;
    }

    if (uri.startsWith('gs://') && !target.dataset['triedCloudConsole']) {
      target.dataset['triedCloudConsole'] = 'true';
      target.src = this.cloudConsoleSrc(uri);
      return;
    }

    this.failedUriMap.update((current) => ({ ...current, [uri]: true }));
  }

  currentSlideItem(): RagComicSlide | null {
    if (this.viewMode() !== 'comic') {
      return null;
    }
    return this.slides()[this.currentSlide()] ?? null;
  }

  currentLearningSlide(): RagLearnSlide | null {
    if (this.viewMode() !== 'learning') {
      return null;
    }
    return this.visibleLearningSlidesComputed()[this.currentSlide()] ?? null;
  }

  paginationIndexes(): number[] {
    return Array.from({ length: this.visibleSlideCount() }, (_, index) => index);
  }

  visibleSlideCount(): number {
    return this.viewMode() === 'learning' ? this.visibleLearningSlidesComputed().length : this.slides().length;
  }

  currentChapterTitle(): string {
    return this.currentChapterTitleComputed();
  }

  slideProgressItems(): PipelineSlideProgressItem[] {
    return this.slideProgressItemsComputed();
  }

  slideProgressCurrentIndex(): number {
    return this.slideProgressCurrentIndexComputed();
  }

  shouldShowLoadMoreSlides(): boolean {
    if (this.viewMode() === 'learning') {
      return !!this.docKey().trim();
    }

    return false;
  }

  learningSummary(slide: RagLearnSlide | null): string {
    if (this.isQuizLearningSlide(slide)) {
      return '';
    }
    if (!slide || typeof slide.summary !== 'string') {
      return 'No summary available.';
    }
    const summary = slide.summary.trim();
    return summary || 'No summary available.';
  }

  learningTitle(slide: RagLearnSlide | null): string {
    if (this.isQuizLearningSlide(slide)) {
      return this.isReviewQuizLearningSlide(slide) ? 'Review quiz' : 'Quiz';
    }
    if (this.isKeyTakeawaysLearningSlide(slide)) {
      return '';
    }
    if (!slide || typeof slide.title !== 'string') {
      return 'Learning summary';
    }
    const title = slide.title.trim();
    return title || 'Learning summary';
  }

  learningSummaryTokens(slide: RagLearnSlide | null): CardToken[] {
    return this.tokens(this.learningSummaryPlainText(slide));
  }

  learningSummaryMarkdown(slide: RagLearnSlide | null): string {
    const summary = this.learningSummary(slide);
    return this.escapeHtmlForMarkdown(this.normalizeLearningSummaryMarkdown(summary));
  }

  learningSummaryHtml(slide: RagLearnSlide | null): SafeHtml {
    const normalizedSummary = this.normalizeLearningSummaryMarkdown(this.learningSummary(slide));
    const askableExpressions: string[] = [];
    const markdownWithPlaceholders = normalizedSummary.replace(/\*\*([^*]+?)\*\*/g, (match, rawExpression: string) => {
      const expression = rawExpression.trim();
      if (!expression) {
        return match;
      }

      const placeholder = `ASKABLE_EXPRESSION_${askableExpressions.length}`;
      askableExpressions.push(expression);
      return placeholder;
    });

    const parsedHtml = marked.parse(this.escapeHtmlForMarkdown(markdownWithPlaceholders));
    let html = typeof parsedHtml === 'string' ? parsedHtml : '';

    askableExpressions.forEach((expression, index) => {
      html = html.replace(
        `ASKABLE_EXPRESSION_${index}`,
        this.askableExpressionButtonHtml(expression)
      );
    });

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  learningSummaryPlainText(slide: RagLearnSlide | null): string {
    return this.stripMarkdownForPlainText(this.learningSummary(slide));
  }

  onLearningSummaryPointerDown(event: MouseEvent | PointerEvent): void {
    const encodedExpression = this.findAskExpressionFromEvent(event);
    if (encodedExpression) {
      this.clearSelectionModeLongPressTimer();
      event.stopPropagation();
      return;
    }

    if (this.selectionModeEnabled()) {
      event.stopPropagation();
      return;
    }

    this.clearSelectionModeLongPressTimer();
    this.selectionModeLongPressTimer = setTimeout(() => {
      this.learningExplainService.enableSelectionMode();
      this.selectionModeLongPressTimer = null;
    }, 450);
  }

  onLearningSummaryPointerUp(): void {
    this.clearSelectionModeLongPressTimer();
  }

  closeLearningSummarySelectionMode(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.clearSelectionModeLongPressTimer();
    this.learningExplainService.disableSelectionMode();
  }

  onLearningSummaryClick(event: MouseEvent): void {
    const encodedExpression = this.findAskExpressionFromEvent(event);
    if (!encodedExpression) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const expression = this.decodeAskExpression(encodedExpression);
    if (expression) {
      this.askAboutExpression(expression);
    }
  }

  onLearningSummaryMouseUp(event: MouseEvent, slide: RagLearnSlide): void {
    this.clearSelectionModeLongPressTimer();
    const encodedExpression = this.findAskExpressionFromEvent(event);
    if (encodedExpression) {
      event.preventDefault();
      event.stopPropagation();
      const expression = this.decodeAskExpression(encodedExpression);
      if (expression) {
        this.askAboutExpression(expression);
      }
      return;
    }

    if (!this.selectionModeEnabled()) {
      return;
    }

    queueMicrotask(() => {
      this.learningExplainService.updateSelectionFromMouseUp(
        event,
        this.toNullableFiniteNumber(slide.chunkId)
      );
    });
  }

  triggerSelectionExplain(): void {
      this.learningExplainService.triggerSelectionExplain(this.docKey(), () => {
        this.askOpen.set(false);
        this.sourceOpen.set(false);
      });
  }

  explainFullSummary(slide: RagLearnSlide): void {
    this.learningExplainService.explainSummary(
      this.docKey(),
      this.toNullableFiniteNumber(slide.chunkId),
      this.learningSummaryPlainText(slide),
      () => {
        this.askOpen.set(false);
        this.sourceOpen.set(false);
      }
    );
  }

  explainImageViewer(): void {
    const imageUrl = this.imageViewerExplainUrl();
    const summary = this.imageViewerExplainSummary();
    const docKey = this.docKey().trim();
    if (!docKey || !imageUrl || !summary) {
      return;
    }

    this.learningExplainService.explainSummary(
      docKey,
      this.imageViewerExplainChunkId(),
      summary,
      () => {
        this.imageViewerOpen.set(false);
        this.askOpen.set(false);
        this.sourceOpen.set(false);
      },
      imageUrl
    );
  }

  private askAboutExpression(expression: string): void {
    const normalizedExpression = expression.trim().replace(/\s+/g, ' ');
    if (!normalizedExpression) {
      return;
    }

    this.learningExplainService.hideSelectionButton();
    this.sourceOpen.set(false);
    this.learningExplainService.closePanel();
    this.askOpen.set(true);
    this.askRequestedQuestion.set(`What is ${normalizedExpression}`);
    this.askRequestKey.update((current) => current + 1);
  }

  learningImageUrl(slide: RagLearnSlide | null): string | null {
    return this.learningImageUrls(slide)[0] ?? null;
  }

  learningImageUrls(slide: RagLearnSlide | null): string[] {
    if (!slide) {
      return [];
    }

    if (this.isKeyTakeawaysLearningSlide(slide)) {
      return [PipelineComponent.keyTakeawaysImageAssetUrl];
    }

    const normalizedUrls: string[] = [];
    const directCandidates = [
      slide.imageUrl,
      slide['image_url'],
      slide['imageUri'],
      slide['image_uri']
    ];

    for (const candidate of directCandidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        normalizedUrls.push(candidate.trim());
      }
    }

    const imageUrls = Array.isArray(slide.imageUrls)
      ? slide.imageUrls
      : Array.isArray(slide['imageUrls'])
        ? slide['imageUrls']
        : [];

    for (const candidate of imageUrls) {
      if (typeof candidate === 'string' && candidate.trim()) {
        normalizedUrls.push(candidate.trim());
      }
    }

    return normalizedUrls.filter((value, index, array) => array.indexOf(value) === index);
  }

  hasMultipleLearningImages(slide: RagLearnSlide | null): boolean {
    return this.learningImageUrls(slide).length > 1;
  }

  isLearningSlideImageClickable(slide: RagLearnSlide | null): boolean {
    return !this.isKeyTakeawaysLearningSlide(slide) && !this.isQuizLearningSlide(slide);
  }

  learningSourcePagesText(slide: RagLearnSlide | null): string {
    const pages = this.learningSourcePages(slide);
    return pages.join(', ');
  }

  shouldShowLearningSlideSourcePages(slide: RagLearnSlide | null): boolean {
    return (
      !this.isKeyTakeawaysLearningSlide(slide) &&
      this.learningSourcePages(slide).length > 0
    );
  }

  canExplainLearningSlide(slide: RagLearnSlide | null): boolean {
    return (
      !this.isKeyTakeawaysLearningSlide(slide) &&
      !this.isQuizLearningSlide(slide) &&
      !this.isReviewQuizLearningSlide(slide) &&
      !this.isReviewLearningSlide(slide)
    );
  }

  isQuizLearningSlide(slide: RagLearnSlide | null | undefined): boolean {
    return this.toNullableBooleanFlag(slide?.['quiz']) === true;
  }

  isReviewQuizLearningSlide(slide: RagLearnSlide | null | undefined): boolean {
    return this.toNullableBooleanFlag(slide?.['reviewQuiz']) === true;
  }

  isReviewLearningSlide(slide: RagLearnSlide | null | undefined): boolean {
    return this.toNullableBooleanFlag(slide?.['review']) === true;
  }

  private slideProgressKindForLearningSlide(
    slide: RagLearnSlide | null | undefined
  ): PipelineSlideProgressItem['kind'] {
    if (this.isReviewQuizLearningSlide(slide)) {
      return 'reviewQuiz';
    }

    if (this.isQuizLearningSlide(slide)) {
      return 'quiz';
    }

    if (this.isKeyTakeawaysLearningSlide(slide)) {
      return 'takeaway';
    }

    if (this.isReviewLearningSlide(slide)) {
      return 'review';
    }

    return 'learning';
  }

  learningSlideCardStyle(slide: RagLearnSlide | null): string {
    if (this.isReviewQuizLearningSlide(slide)) {
      return 'padding:18px;background:#eef3ff;border-color:#c2d1ef;box-shadow:0 8px 16px rgba(17,38,58,0.045), 0 1px 4px rgba(17,38,58,0.025);';
    }

    if (this.isQuizLearningSlide(slide)) {
      return 'padding:18px;background:#eef5ff;border-color:#c9d9ee;box-shadow:0 8px 16px rgba(17,38,58,0.045), 0 1px 4px rgba(17,38,58,0.025);';
    }

    if (this.isReviewLearningSlide(slide)) {
      return 'padding:18px;background:#fff8ef;border-color:#e8d7bc;box-shadow:0 8px 16px rgba(17,38,58,0.045), 0 1px 4px rgba(17,38,58,0.025);';
    }

    if (this.isKeyTakeawaysLearningSlide(slide)) {
      return 'padding:0;background:#fffdf8;border-color:#eadfce;box-shadow:0 8px 16px rgba(17,38,58,0.045), 0 1px 4px rgba(17,38,58,0.025);';
    }

    return 'padding:18px;background:#fffdf8;border-color:#eadfce;box-shadow:0 8px 16px rgba(17,38,58,0.045), 0 1px 4px rgba(17,38,58,0.025);';
  }

  quizQuestionText(slide: RagLearnSlide | null): string {
    return slide && typeof slide['quizQuestion'] === 'string' ? slide['quizQuestion'].trim() : '';
  }

  quizAnswerOptions(slide: RagLearnSlide | null): string[] {
    return Array.isArray(slide?.['quizOptions'])
      ? slide['quizOptions'].filter(
          (value): value is string => typeof value === 'string' && value.trim().length > 0
        )
      : [];
  }

  isFirstQuizSlideForChapter(slide: RagLearnSlide | null): boolean {
    return this.quizQuestionIndex(slide) === 0;
  }

  isLastQuizSlideForChapter(slide: RagLearnSlide | null): boolean {
    const quiz = this.quizForLearningSlide(slide);
    const questionIndex = this.quizQuestionIndex(slide);
    if (!quiz || questionIndex === null) {
      return false;
    }

    const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
    return questionIndex === questions.length - 1;
  }

  shouldShowQuizNextButton(slide: RagLearnSlide | null): boolean {
    if (!this.isLastQuizSlideForChapter(slide)) {
      return false;
    }

    const chapter = this.chapterForLearningSlide(slide);
    if (!chapter || this.chapterReviewSlides(chapter).length > 0) {
      return false;
    }

    const questions = Array.isArray(chapter.quiz?.questions) ? chapter.quiz.questions : [];
    const hasIncorrectAnswers = questions.some(
      (question) => question.selectedAnswerIndex !== question.correctAnswerIndex
    );

    return hasIncorrectAnswers || this.hasNextChapterToGenerate(chapter);
  }

  allQuizQuestionsAnswered(slide: RagLearnSlide | null): boolean {
    const quiz = this.quizForLearningSlide(slide);
    const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];
    return questions.length > 0 && questions.every((question) => typeof question.selectedAnswerIndex === 'number');
  }

  shouldShowNextChapterButton(slide: RagLearnSlide | null): boolean {
    const chapter = this.chapterForLearningSlide(slide);
    return !!chapter && this.hasNextChapterToGenerate(chapter);
  }

  private hasNextChapterToGenerate(chapter: RagLearningPipelineChapter): boolean {
    const chapters = this.chapterItems();
    if (!chapters.length) {
      return false;
    }

    const chapterIndex = chapters.findIndex((entry) => this.sameChapter(entry, chapter));
    if (chapterIndex < 0) {
      return false;
    }

    const nextChapter = chapters[chapterIndex + 1];
    if (!nextChapter) {
      return false;
    }

    return !this.learningSlides().some((learningSlide) =>
      this.slideMatchesChapter(learningSlide, nextChapter)
    );
  }

  isLastReviewSlideForChapter(slide: RagLearnSlide | null): boolean {
    const chapter = this.chapterForLearningSlide(slide);
    if (!chapter || !this.isReviewLearningSlide(slide)) {
      return false;
    }

    const reviewSlides = this.chapterReviewSlides(chapter);
    return reviewSlides.length > 0 && reviewSlides[reviewSlides.length - 1] === slide;
  }

  isLastReviewQuizSlideForChapter(slide: RagLearnSlide | null): boolean {
    return this.isReviewQuizLearningSlide(slide) && this.isLastQuizSlideForChapter(slide);
  }

  selectedQuizOptionIndex(slide: RagLearnSlide | null): number | null {
    const quiz = this.quizForLearningSlide(slide);
    const questionIndex = this.quizQuestionIndex(slide);
    if (!quiz || questionIndex === null) {
      return null;
    }

    const question = quiz.questions?.[questionIndex];
    return typeof question?.selectedAnswerIndex === 'number' ? question.selectedAnswerIndex : null;
  }

  quizOptionAnswered(slide: RagLearnSlide | null, optionIndex: number): boolean {
    return this.selectedQuizOptionIndex(slide) === optionIndex;
  }

  quizOptionCorrect(slide: RagLearnSlide | null, optionIndex: number): boolean {
    const quiz = this.quizForLearningSlide(slide);
    const questionIndex = this.quizQuestionIndex(slide);
    if (!quiz || questionIndex === null) {
      return false;
    }

    return quiz.questions?.[questionIndex]?.correctAnswerIndex === optionIndex;
  }

  quizQuestionAnsweredIncorrectly(slide: RagLearnSlide | null): boolean {
    const selectedOptionIndex = this.selectedQuizOptionIndex(slide);
    return selectedOptionIndex !== null && !this.quizOptionCorrect(slide, selectedOptionIndex);
  }

  learningSourcePages(slide: RagLearnSlide | null): number[] {
    if (this.isQuizLearningSlide(slide) || this.isReviewQuizLearningSlide(slide)) {
      const quiz = this.quizForLearningSlide(slide);
      const questionIndex = this.quizQuestionIndex(slide);
      const question =
        questionIndex !== null && Array.isArray(quiz?.questions)
          ? quiz.questions[questionIndex]
          : null;
      const referencePages = Array.isArray(question?.referencePageNumbers)
        ? question.referencePageNumbers
        : [];
      return referencePages.filter(
        (value, index, array) => value > 0 && array.indexOf(value) === index
      );
    }

    if (!slide || !Array.isArray(slide.sourcePageNumbers)) {
      return [];
    }
    return slide.sourcePageNumbers.filter((value, index, array) => value > 0 && array.indexOf(value) === index);
  }

  isLearningTokenActive(index: number, tokenWordIndex: number): boolean {
    if (tokenWordIndex < 0 || !this.isLearningCardPlaying(index)) {
      return false;
    }
    return this.ttsCurrentWord() === tokenWordIndex;
  }

  shouldShowLearningActions(): boolean {
    const mode = this.documentMode();
    return (
      mode === 'Learning Mode' || mode === 'Action Mode' || mode === 'Extraction Mode'
    );
  }

  shouldShowStoryActions(): boolean {
    const mode = this.documentMode();
    return !mode || mode === 'Story Mode';
  }

  canShowSourceButton(): boolean {
    return (
      this.shouldShowLearningActions() &&
      this.viewMode() === 'learning' &&
      this.learningSourcePages(this.currentLearningSlide()).length > 0
    );
  }

  shouldShowCharactersPanel(): boolean {
    return this.viewMode() === 'comic' && this.characterReferences().length > 0;
  }

  visibleSourcePageNumbers(): number[] {
    const slide = this.currentLearningSlide();
    if (!slide || !Array.isArray(slide.sourcePageNumbers)) {
      return [];
    }
    return slide.sourcePageNumbers.filter((value, index, array) => value > 0 && array.indexOf(value) === index);
  }

  toggleSourcePanel(): void {
    const nextOpen = !this.sourceOpen();
    this.learningExplainService.hideSelectionButton();
    this.askOpen.set(false);
    this.characterInfoOpen.set(false);
    this.explainOpen.set(false);
    this.sourceOpen.set(nextOpen);
    if (nextOpen) {
      void this.loadSourcePagesForCurrentSlide();
    }
  }

  toggleAskPanel(): void {
    const nextOpen = !this.askOpen();
    this.learningExplainService.hideSelectionButton();
    this.sourceOpen.set(false);
    this.characterInfoOpen.set(false);
    this.learningExplainService.closePanel();
    this.askOpen.set(nextOpen);
  }

  closeAllSidePanels(): void {
    this.askOpen.set(false);
    this.sourceOpen.set(false);
    this.characterInfoOpen.set(false);
    this.learningExplainService.closePanel();
    this.learningExplainService.hideSelectionButton();
  }

  characterName(character: RagCharacterReferenceImageResponse): string {
    const name = typeof character.characterName === 'string' ? character.characterName.trim() : '';
    return name || 'Character';
  }

  onTtsSpeedInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const value = target ? Number(target.value) : NaN;
    if (!Number.isFinite(value)) {
      return;
    }
    this.ttsSpeed.set(Math.max(0.5, Math.min(2, Math.round(value * 100) / 100)));
  }

  ttsSpeedLabel(): string {
    return this.ttsSpeed().toFixed(2).replace(/\.00$/, '');
  }

  openCharacterInfo(character: RagCharacterReferenceImageResponse): void {
    const details = this.characterIntroDetails(character);
    this.learningExplainService.hideSelectionButton();
    this.askOpen.set(false);
    this.sourceOpen.set(false);
    this.learningExplainService.closePanel();
    this.selectedCharacterIntro.set(details);
    this.characterInfoOpen.set(true);
  }

  characterIntroTitle(): string {
    return this.selectedCharacterIntro()?.name || 'Character';
  }

  characterIntroSlideTitle(): string {
    return this.selectedCharacterIntro()?.slideTitle || '';
  }

  characterIntroText(): string {
    return this.selectedCharacterIntro()?.introText || 'No introduction available.';
  }

  characterIntroImageUrl(): string | null {
    return this.selectedCharacterIntro()?.imageUrl || null;
  }

  private showSlidesOverlay(message = 'Loading slides...'): void {
    if (this.slidesOverlayToken) {
      return;
    }
    this.slidesOverlayToken = this.loadingOverlay.show(message);
  }

  private hideSlidesOverlay(): void {
    this.loadingOverlay.hide(this.slidesOverlayToken);
    this.slidesOverlayToken = null;
  }

  private showGenerationOverlay(message = 'Generating...'): void {
    if (this.generationOverlayToken) {
      return;
    }
    this.generationOverlayToken = this.loadingOverlay.show(message);
  }

  private hideGenerationOverlay(): void {
    this.loadingOverlay.hide(this.generationOverlayToken);
    this.generationOverlayToken = null;
  }

  private clearSelectionModeLongPressTimer(): void {
    if (this.selectionModeLongPressTimer !== null) {
      clearTimeout(this.selectionModeLongPressTimer);
      this.selectionModeLongPressTimer = null;
    }
  }

  private clearChapterQuizCheckTimer(): void {
    if (this.chapterQuizCheckTimer !== null) {
      clearTimeout(this.chapterQuizCheckTimer);
      this.chapterQuizCheckTimer = null;
    }
  }

  private async loadContextAndSlides(docKey: string): Promise<void> {
    const normalizedDocKey = docKey.trim();
    if (!normalizedDocKey) {
      return;
    }

    await this.loadDocumentMode(normalizedDocKey);
    if (this.docKey().trim() !== normalizedDocKey) {
      return;
    }

    this.slidesLoading.set(true);
    this.showSlidesOverlay('Loading slides...');
    this.loadLearningContext(normalizedDocKey);
    if (this.shouldUseLearningFlow()) {
      this.closeStoryProcessStream();
      this.storyProcessStartedDocKey = '';
      this.storyProcessRequestDocKey = '';
      this.suppressStoryAutoProcessStart = false;
      this.processAllRunning.set(false);
      this.loadLearningSlidesFallback(normalizedDocKey, typeof performance !== 'undefined' ? performance.now() : Date.now());
      return;
    }

    this.closeStoryProcessStream();
    this.storyProcessStartedDocKey = '';
    this.storyProcessRequestDocKey = '';
    this.suppressStoryAutoProcessStart = false;
    this.processAllRunning.set(false);
    this.loadSlides(normalizedDocKey);
  }

  private loadLearningContext(docKey: string): void {
    this.learningContextLoading.set(true);
    this.learningContextError.set('');
    this.learningContext.set(null);

    this.ragApi.getLearningPipelineContext(docKey).subscribe({
      next: (response) => {
        this.learningContext.set(response);
        this.docId.set(this.toNullableFiniteNumber(response.docId));
        this.learningContextLoading.set(false);
      },
      error: (err) => {
        this.learningContext.set(null);
        this.learningContextError.set(`Failed to load chapters: ${this.readApiError(err)}`);
        this.learningContextLoading.set(false);
      }
    });
  }

  private loadSlides(docKey: string): void {
    const loadStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const shouldStartStoryAfterLoad = !this.shouldUseLearningFlow();
    this.suppressStoryAutoProcessStart = shouldStartStoryAfterLoad;
    this.slidesLoading.set(true);
    this.slidesMessage.set('');
    this.lastAutoLoadTriggerKey = '';
    this.failedUriMap.set({});
    console.info('[Pipeline] Slide reload started', {
      docKey,
      languageCode: this.selectedLanguage(),
      startedAt: new Date().toISOString()
    });

    this.ragApi.getComicSlidesWithImages(docKey, this.selectedLanguage()).subscribe({
      next: (response) => {
        const nextSlides = Array.isArray(response.slides) ? response.slides : [];
        const shouldStartInitialStoryProcessing = this.shouldStartInitialStoryProcessing(nextSlides);
        if (!nextSlides.length && this.shouldUseLearningFlow()) {
          this.loadLearningSlidesFallback(docKey, loadStartedAt);
          return;
        }
        if (shouldStartInitialStoryProcessing) {
          this.suppressStoryAutoProcessStart = false;
          this.applyFetchedComicSlides(response, nextSlides);
          this.startStoryProcessAll(docKey, false, true);
          return;
        }
        if (nextSlides.length && !this.shouldUseLearningFlow()) {
          this.ensureStoryAutoTriggerSession(docKey);
        }

        const totalCount = typeof response.count === 'number' ? response.count : nextSlides.length;
        const returnedCount =
          typeof response.returnedCount === 'number' ? response.returnedCount : nextSlides.length;
        const backendLastLimit =
          typeof response.lastLimit === 'number' && Number.isFinite(response.lastLimit)
            ? response.lastLimit
            : null;
        const nextCursor = backendLastLimit !== null ? backendLastLimit : returnedCount;
        const elapsedMs =
          (typeof performance !== 'undefined' ? performance.now() : Date.now()) - loadStartedAt;
        if (this.shouldUseLearningFlow()) {
          this.applyFetchedComicSlides(response, nextSlides);
        } else {
          this.applyFetchedComicSlides(response, nextSlides);
        }
        console.info('[Pipeline] Slide reload finished', {
          docKey,
          languageCode: this.selectedLanguage(),
          slideCount: nextSlides.length,
          totalCount,
          returnedCount,
          lastLimit: backendLastLimit,
          nextCursor,
          elapsedMs: Math.round(elapsedMs)
        });
      },
      complete: () => {
        this.hideSlidesOverlay();
        if (!shouldStartStoryAfterLoad) {
          this.suppressStoryAutoProcessStart = false;
        }
      },
      error: (err) => {
        this.suppressStoryAutoProcessStart = false;
        const elapsedMs =
          (typeof performance !== 'undefined' ? performance.now() : Date.now()) - loadStartedAt;
        const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
        const backendMessage =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
        this.slides.set([]);
        this.slidesLoading.set(false);
        this.slidesMessage.set(`Failed to get slides (${status}): ${backendMessage}`);
        this.hideSlidesOverlay();
        console.warn('[Pipeline] Slide reload failed', {
          docKey,
          languageCode: this.selectedLanguage(),
          elapsedMs: Math.round(elapsedMs),
          status,
          backendMessage
        });
      }
    });
  }

  private shouldStartInitialStoryProcessing(slides: RagComicSlide[]): boolean {
    if (this.shouldUseLearningFlow()) {
      return false;
    }
    if (!slides.length) {
      return true;
    }

    return !slides.some((slide) => this.storySlideType(slide) === 'STORY');
  }

  private currentChapterSignal(): RagLearningPipelineChapter | null {
    return this.currentChapterComputed();
  }

  private scheduleBackgroundLearningRefresh(docKey: string): void {
    if (this.learningRefreshTimer !== null) {
      return;
    }

    this.learningRefreshTimer = setTimeout(() => {
      this.learningRefreshTimer = null;

      if (
        this.docKey().trim() !== docKey ||
        this.ingestProgress.trackedStatus(docKey)?.backgroundProcessing !== true
      ) {
        return;
      }

      this.refreshBackgroundLearningState(docKey);
      this.scheduleBackgroundLearningRefresh(docKey);
    }, 4000);
  }

  private clearBackgroundLearningRefreshTimer(): void {
    if (this.learningRefreshTimer === null) {
      return;
    }

    clearTimeout(this.learningRefreshTimer);
    this.learningRefreshTimer = null;
  }

  private refreshBackgroundLearningState(docKey: string): void {
    if (this.loading() || this.clearing()) {
      return;
    }

    this.ragApi.getLearningSlides(docKey).subscribe({
      next: (response) => {
        this.docId.set(this.toNullableFiniteNumber(response.docId) ?? this.docId());
        this.appendFetchedLearningSlides(Array.isArray(response.slides) ? response.slides : []);
        const totalCount = this.toNullableFiniteNumber(response.count);
        const returnedCount = Array.isArray(response.slides) ? response.slides.length : 0;
        const backendLastLimit = this.toNullableFiniteNumber(response.lastLimit);
        const hasMore =
          totalCount !== null && backendLastLimit !== null
            ? totalCount > backendLastLimit
            : returnedCount >= PipelineComponent.comicBatchSize;
        this.showLoadMoreLearningSlide.set(hasMore);

        if (this.sourceOpen()) {
          void this.loadSourcePagesForCurrentSlide();
        }
      },
      error: (err) => {
        const statusCode =
          typeof err?.status === 'number' && Number.isFinite(err.status) ? err.status : 0;
        if (statusCode === 404) {
          this.ingestProgress.stopTrackingDoc(docKey);
          this.clearBackgroundLearningRefreshTimer();
          if (this.docKey().trim() === docKey) {
            this.learningSlides.set([]);
            this.learningContext.set(null);
            this.slidesMessage.set('This document was removed while background processing was running.');
          }
        }
      }
    });
  }

  private shouldUseLearningFlow(): boolean {
    return this.shouldShowLearningActions();
  }

  private applyFetchedComicSlides(
    response: { docId?: number; count?: number; returnedCount?: number },
    nextSlides: RagComicSlide[]
  ): void {
    this.docId.set(this.toNullableFiniteNumber(response.docId) ?? this.docId());
    this.slides.set(nextSlides);
    this.syncCharacterReferencesFromSlides(nextSlides);
    void this.loadCharacterReferences(this.docKey().trim(), nextSlides);
    this.learningSlides.set([]);
    this.viewMode.set('comic');
    this.slidesLoading.set(false);
    this.showLoadMoreSlide.set(false);
    this.autoRequestedInitialSlides = false;
    const nextIndex = this.initialSlideIndex(nextSlides.length);
    this.currentSlide.set(nextIndex);
    this.syncSwiperSlide(nextIndex);
    void this.loadCurrentSlideDialogs();
    this.maybeAutoLoadMoreAfterSlideAdvance(nextIndex);
  }

  private startStoryProcessAll(docKey: string, manual: boolean, onlyOnce = false): void {
    if (!docKey.trim()) {
      console.info('[Pipeline] startStoryProcessAll skipped', {
        docKey,
        reason: 'missing-doc-key'
      });
      return;
    }

    if (this.shouldUseLearningFlow()) {
      console.info('[Pipeline] startStoryProcessAll skipped', {
        docKey,
        reason: 'learning-flow'
      });
      return;
    }

    if (onlyOnce && this.storyProcessStartedDocKey === docKey) {
      console.info('[Pipeline] startStoryProcessAll skipped', {
        docKey,
        reason: 'already-started-once'
      });
      return;
    }

    if (this.loading() && this.storyProcessRequestDocKey === docKey) {
      console.info('[Pipeline] startStoryProcessAll skipped', {
        docKey,
        reason: 'request-already-in-flight'
      });
      return;
    }

    this.suppressStoryAutoProcessStart = false;
    this.storyProcessStartedDocKey = docKey;
    this.storyProcessRequestDocKey = docKey;
    this.processAllRunning.set(true);
    this.loading.set(true);
    this.showLoadMoreSlide.set(false);
    this.message.set(manual ? 'Processing next chapters...' : 'Starting story processing...');
    const processAllId = this.createProcessAllId();
    console.info('[Pipeline] startStoryProcessAll starting process_all', {
      docKey,
      manual,
      onlyOnce,
      processAllId
    });
    void this.startStoryProcessRun(docKey, processAllId);
  }

  private ensureStoryAutoTriggerSession(docKey: string): void {
    const normalizedDocKey = docKey.trim();
    if (!normalizedDocKey || this.shouldUseLearningFlow()) {
      return;
    }
    if (this.storyProcessStartedDocKey === normalizedDocKey || this.storyProcessClient) {
      return;
    }

    const processAllId = this.createProcessAllId();
    this.storyProcessStartedDocKey = normalizedDocKey;
    this.storyProcessRequestDocKey = normalizedDocKey;
    void this.openStoryProcessStream(normalizedDocKey, processAllId)
      .then(() => firstValueFrom(this.ragApi.bindPipelineLiveSession(normalizedDocKey, processAllId)))
      .then(() => {
        this.storyProcessRequestDocKey = '';
      })
      .catch((err) => {
        this.storyProcessStartedDocKey = '';
        this.storyProcessRequestDocKey = '';
        this.closeStoryProcessStream();
        console.warn('[Pipeline] Failed to bind story auto-trigger session', {
          docKey: normalizedDocKey,
          processAllId,
          error: this.readApiError(err)
        });
      });
  }

  private async startStoryProcessRun(docKey: string, processAllId: string): Promise<void> {
    const requestStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const streamPromise = this.openStoryProcessStream(docKey, processAllId);

    void streamPromise.catch((err) => {
      const backendMessage = this.readApiError(err);
      if (this.storyProcessRequestDocKey !== docKey || !this.processAllRunning()) {
        return;
      }

      this.finishStoryProcessRun(`Story processing stream failed: ${backendMessage}`);
      console.warn('[Pipeline] Story process stream failed', {
        docKey,
        processAllId,
        backendMessage
      });
    });

    try {
      await firstValueFrom(
        this.ragApi.generateComicBookAll({
          docKey,
          processAllId,
          start: null,
          end: null
        })
      );

      console.info('[Pipeline] process_all request acknowledged', {
        docKey,
        processAllId,
        requestElapsedMs: Math.round(
          (typeof performance !== 'undefined' ? performance.now() : Date.now()) - requestStartedAt
        )
      });
    } catch (err) {
      const status = err instanceof HttpErrorResponse && err.status ? `HTTP ${err.status}` : 'Request failed';
      const backendMessage =
        err instanceof HttpErrorResponse
          ? typeof err.error === 'string'
            ? err.error
            : err.error?.message ?? err.error?.error ?? err.message ?? 'unknown error'
          : this.readApiError(err);

      this.finishStoryProcessRun(`Failed to generate all (${status}): ${backendMessage}`);
      console.warn('[Pipeline] Generate all failed', {
        docKey,
        processAllId,
        status,
        backendMessage
      });
    }
  }

  private openStoryProcessStream(docKey: string, processAllId: string): Promise<void> {
    this.closeStoryProcessStream();

    return new Promise((resolve, reject) => {
      const client = new Client({
        brokerURL: this.storyProcessBrokerUrl(),
        reconnectDelay: 0,
        heartbeatIncoming: 0,
        heartbeatOutgoing: 0,
        debug: (message: string) => {
          console.info('[Pipeline][WS]', message);
        }
      });

      let settled = false;

      client.onConnect = () => {
        if (settled) {
          return;
        }

        this.storyProcessClient = client;
        this.activeProcessAllId = processAllId;
        console.info('[Pipeline] WebSocket connected', {
          docKey,
          processAllId,
          brokerURL: this.storyProcessBrokerUrl()
        });
        this.storyProcessSubscription = client.subscribe(
          `/topic/pipeline/${processAllId}`,
          (message) => this.handleStoryProcessMessage(docKey, processAllId, message)
        );
        console.info('[Pipeline] WebSocket subscribed', {
          docKey,
          processAllId,
          destination: `/topic/pipeline/${processAllId}`
        });
        settled = true;
        resolve();
      };

      client.onStompError = (frame) => {
        const details = frame.headers['message'] || frame.body || 'STOMP error';
        if (!settled) {
          settled = true;
          reject(new Error(details));
          return;
        }

        this.finishStoryProcessRun(`Story processing failed: ${details}`);
      };

      client.onWebSocketError = () => {
        console.warn('[Pipeline] WebSocket low-level error', {
          docKey,
          processAllId,
          brokerURL: this.storyProcessBrokerUrl()
        });
        if (!settled) {
          settled = true;
          reject(new Error('WebSocket connection failed.'));
        }
      };

      client.onWebSocketClose = (event) => {
        console.warn('[Pipeline] WebSocket closed', {
          docKey,
          processAllId,
          brokerURL: this.storyProcessBrokerUrl(),
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean
        });
        if (this.storyProcessClient !== client) {
          return;
        }

        const isCurrentRun =
          this.activeProcessAllId === processAllId || this.storyProcessRequestDocKey === docKey;
        if (!settled) {
          settled = true;
          reject(new Error('WebSocket connection closed before subscribing.'));
          return;
        }

        if (isCurrentRun && this.processAllRunning()) {
          this.finishStoryProcessRun('Story processing connection closed unexpectedly.');
        }
      };

      client.activate();
    });
  }

  private handleStoryProcessMessage(docKey: string, processAllId: string, message: IMessage): void {
    if (
      this.docKey().trim() !== docKey ||
      this.activeProcessAllId !== processAllId
    ) {
      return;
    }

    let payload: StoryProcessEventEnvelope;
    try {
      payload = JSON.parse(message.body) as StoryProcessEventEnvelope;
    } catch (err) {
      console.warn('[Pipeline] Failed to parse story process event', err);
      return;
    }

    const eventType = this.storyProcessEventType(payload);
    if (!eventType) {
      console.warn('[Pipeline] Received story process event without type', payload);
      return;
    }

    console.info('[Pipeline] Received event', { eventType, payload });

    switch (eventType) {
      case 'process_started':
        this.loading.set(true);
        this.processAllRunning.set(true);
        this.message.set(payload.message || 'Processing story slides...');
        break;
      case 'character_slide_ready': {
        const slides = this.storyProcessEventSlides(payload);
        this.appendStorySlidesFromEvent(slides);
        this.mergeCharacterReferencesFromSlides(slides);
        break;
      }
      case 'story_slides_ready': {
        const slides = this.storyProcessEventSlides(payload);
        this.appendStorySlidesFromEvent(slides);
        break;
      }
      case 'process_completed':
        this.finishStoryProcessRun('');
        void this.loadCurrentSlideDialogs();
        break;
      case 'process_failed':
        this.finishStoryProcessRun(payload.message || payload.error || 'Story processing failed.');
        break;
      default:
        console.info('[Pipeline] Ignored story process event', { eventType, payload });
    }
  }

  private storyProcessEventType(payload: StoryProcessEventEnvelope): string {
    const rawType =
      payload.eventType ?? payload.type ?? payload.event ?? payload.event_name ?? payload.kind ?? payload.status;
    return typeof rawType === 'string' ? rawType.trim().toLowerCase() : '';
  }

  private storyProcessEventSlides(payload: StoryProcessEventEnvelope): RagComicSlide[] {
    return this.ragApi.normalizeComicSlidesPayload(
      payload.payload ?? payload.data ?? payload.slides ?? payload.slide ?? payload
    );
  }

  private appendStorySlidesFromEvent(incomingSlides: RagComicSlide[]): void {
    if (!incomingSlides.length) {
      return;
    }

    const currentSlides = this.slides();
    const combinedSlides = this.mergeComicSlidesById(currentSlides, incomingSlides);
    const nextIndex = this.preserveCurrentComicSlideIndex(currentSlides, combinedSlides);
    this.slides.set(combinedSlides);
    this.currentSlide.set(nextIndex);
    this.syncSwiperSlide(nextIndex);
    this.viewMode.set('comic');
    this.message.set('');
    void this.loadCurrentSlideDialogs();
    this.maybeAutoLoadMoreAfterSlideAdvance(nextIndex);
  }

  private finishStoryProcessRun(message: string): void {
    this.loading.set(false);
    this.processAllRunning.set(false);
    this.storyProcessRequestDocKey = '';
    this.message.set(message);
  }

  private closeStoryProcessStream(): void {
    const client = this.storyProcessClient;

    try {
      this.storyProcessSubscription?.unsubscribe();
    } catch {}

    this.storyProcessSubscription = null;
    this.storyProcessClient = null;
    this.activeProcessAllId = '';

    if (client) {
      void client.deactivate();
    }
  }

  private storyProcessBrokerUrl(): string {
    if (typeof window === 'undefined') {
      return 'ws://127.0.0.1:8081/ws/pipeline';
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const isLocalDevHost =
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isLocalDevPort = window.location.port === '4200' || window.location.port === '4201';
    if (isLocalDevHost && isLocalDevPort) {
      return `${protocol}//127.0.0.1:8081/ws/pipeline`;
    }
    return `${protocol}//${window.location.host}/ws/pipeline`;
  }

  private createProcessAllId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    return `process-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private mergeComicSlidesById(currentSlides: RagComicSlide[], incomingSlides: RagComicSlide[]): RagComicSlide[] {
    if (!currentSlides.length) {
      return incomingSlides.slice().sort((left, right) => this.compareComicSlides(left, right));
    }

    const merged = new Map<string, RagComicSlide>();
    const orderedKeys: string[] = [];
    const seenKeys = new Set<string>();

    const pushKey = (key: string): void => {
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        orderedKeys.push(key);
      }
    };

    currentSlides.forEach((slide, index) => {
      const key = this.comicSlideMergeKey(slide, index);
      merged.set(key, slide);
      pushKey(key);
    });

    incomingSlides.forEach((slide, index) => {
      const key = this.comicSlideMergeKey(slide, index);
      merged.set(key, slide);
      pushKey(key);
    });

    return orderedKeys
      .map((key) => merged.get(key))
      .filter((slide): slide is RagComicSlide => slide !== undefined)
      .sort((left, right) => this.compareComicSlides(left, right));
  }

  private preserveCurrentComicSlideIndex(
    currentSlides: RagComicSlide[],
    combinedSlides: RagComicSlide[]
  ): number {
    const currentIndex = this.currentSlide();
    const currentSlide = currentSlides[currentIndex];
    if (!currentSlide) {
      return this.clampSlideIndex(currentIndex, combinedSlides.length);
    }

    const currentKey = this.comicSlideIdentityKey(currentSlide, currentIndex);
    const preservedIndex = combinedSlides.findIndex((slide, index) =>
      this.comicSlideIdentityKey(slide, index) === currentKey
    );
    if (preservedIndex >= 0) {
      return preservedIndex;
    }

    return this.clampSlideIndex(currentIndex, combinedSlides.length);
  }

  private compareComicSlides(left: RagComicSlide, right: RagComicSlide): number {
    const leftChapter = this.toNullableFiniteNumber(left.chapterIndex) ?? 0;
    const rightChapter = this.toNullableFiniteNumber(right.chapterIndex) ?? 0;
    if (leftChapter !== rightChapter) {
      return leftChapter - rightChapter;
    }

    const leftDisplayOrder = this.toNullableFiniteNumber(left.displayOrder);
    const rightDisplayOrder = this.toNullableFiniteNumber(right.displayOrder);
    if (leftDisplayOrder !== null && rightDisplayOrder !== null && leftDisplayOrder !== rightDisplayOrder) {
      return leftDisplayOrder - rightDisplayOrder;
    }
    if (leftDisplayOrder !== null && rightDisplayOrder === null) {
      return -1;
    }
    if (leftDisplayOrder === null && rightDisplayOrder !== null) {
      return 1;
    }

    const leftChunk = this.comicSlideChunkIndex(left);
    const rightChunk = this.comicSlideChunkIndex(right);
    if (leftChunk !== rightChunk) {
      return leftChunk - rightChunk;
    }

    const leftPriority = this.comicSlideTypePriority(left);
    const rightPriority = this.comicSlideTypePriority(right);
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    const leftId = this.toNullableFiniteNumber(left.id) ?? 0;
    const rightId = this.toNullableFiniteNumber(right.id) ?? 0;
    return leftId - rightId;
  }

  private comicSlideChunkIndex(slide: RagComicSlide): number {
    const directChunkIndex = this.toNullableFiniteNumber(slide.chunkIndex);
    if (directChunkIndex !== null) {
      return directChunkIndex;
    }

    const noteChunkIndex = this.toNullableFiniteNumber(slide.comicNote?.chunkIndex);
    if (noteChunkIndex !== null) {
      return noteChunkIndex;
    }

    return 0;
  }

  private comicSlideTypePriority(slide: RagComicSlide): number {
    switch (this.storySlideType(slide)) {
      case 'BOOK_OVERVIEW':
        return 0;
      case 'CHARACTER_INTRO':
        return 1;
      case 'STORY':
        return 2;
      default:
        return 3;
    }
  }

  private comicSlideMergeKey(slide: RagComicSlide, index: number): string {
    const id = this.toNullableFiniteNumber(slide.id);
    if (id !== null) {
      return `id:${id}`;
    }

    const noteId = this.toNullableFiniteNumber(slide.comicNoteId);
    if (noteId !== null) {
      return `note:${noteId}`;
    }

    return `idx:${index}:${slide.title ?? ''}:${slide.slideType ?? ''}`;
  }

  private comicSlideIdentityKey(slide: RagComicSlide, index: number): string {
    return this.comicSlideMergeKey(slide, index);
  }

  private findSlideIndexForChapter(chapter: RagLearningPipelineChapter): number | null {
    const items = this.viewMode() === 'learning' ? this.visibleLearningSlides() : this.slides();
    if (!items.length) {
      return null;
    }

    const matchIndex =
      this.viewMode() === 'learning'
        ? (items as RagLearnSlide[]).findIndex((slide) => this.slideMatchesChapter(slide, chapter))
        : (items as RagComicSlide[]).findIndex((slide) => this.slideMatchesChapter(slide, chapter));

    return matchIndex >= 0 ? matchIndex : null;
  }

  private currentChapterSlidesForProgress(): RagLearnSlide[] {
    return this.currentChapterSlidesForProgressComputed();
  }

  private learningSlideProgressKey(slide: RagLearnSlide | null | undefined): string {
    if (!slide) {
      return '';
    }

    const id = this.toNullableFiniteNumber(slide.id);
    if (id !== null) {
      return `id:${id}`;
    }

    const chapterIndex = this.toNullableFiniteNumber(slide['chapterIndex']);
    const questionIndex = this.toNullableFiniteNumber(slide['quizQuestionIndex']);
    const reviewQuiz = this.isReviewQuizLearningSlide(slide);
    const quiz = this.isQuizLearningSlide(slide);
    const review = this.isReviewLearningSlide(slide);
    const takeaway = this.isKeyTakeawaysLearningSlide(slide);
    const title = typeof slide.title === 'string' ? slide.title.trim() : '';
    const summary = typeof slide.summary === 'string' ? slide.summary.trim() : '';

    return [
      `chapter:${chapterIndex ?? 'na'}`,
      `quiz:${quiz}`,
      `reviewQuiz:${reviewQuiz}`,
      `review:${review}`,
      `takeaway:${takeaway}`,
      `question:${questionIndex ?? 'na'}`,
      `title:${title}`,
      `summary:${summary}`
    ].join('|');
  }

  private findSlideIndexForChapterSection(
    chapter: RagLearningPipelineChapter,
    section: ChapterSection
  ): number | null {
    if (this.viewMode() !== 'learning') {
      return this.findSlideIndexForChapter(chapter);
    }

    const items = this.visibleLearningSlides();
    const matchIndex = items.findIndex((slide) => {
      if (!this.slideMatchesChapter(slide, chapter)) {
        return false;
      }

      switch (section) {
        case 'summary':
          return (
            !this.isKeyTakeawaysLearningSlide(slide) &&
            !this.isQuizLearningSlide(slide) &&
            !this.isReviewLearningSlide(slide)
          );
        case 'takeaways':
          return this.isKeyTakeawaysLearningSlide(slide);
        case 'quiz':
          return this.isQuizLearningSlide(slide);
        case 'review':
          return this.isReviewLearningSlide(slide) || this.isReviewQuizLearningSlide(slide);
      }
    });

    return matchIndex >= 0 ? matchIndex : null;
  }

  private findSlideIndexForChapterReviewQuiz(chapter: RagLearningPipelineChapter): number | null {
    const items = this.visibleLearningSlides();
    const matchIndex = items.findIndex(
      (slide) => this.slideMatchesChapter(slide, chapter) && this.isReviewQuizLearningSlide(slide)
    );
    return matchIndex >= 0 ? matchIndex : null;
  }

  private chapterForLearningSlide(
    slide: RagLearnSlide | null | undefined,
    chapters: RagLearningPipelineChapter[] = this.chapterItems()
  ): RagLearningPipelineChapter | null {
    if (!slide) {
      return null;
    }
    return chapters.find((chapter) => this.slideMatchesChapter(slide, chapter)) ?? null;
  }

  private chapterForComicSlide(
    slide: RagComicSlide | null | undefined,
    chapters: RagLearningPipelineChapter[]
  ): RagLearningPipelineChapter | null {
    if (!slide) {
      return null;
    }
    return chapters.find((chapter) => this.slideMatchesChapter(slide, chapter)) ?? null;
  }

  generateOrOpenChapterQuizFromTakeaways(slide: RagLearnSlide): void {
    if (!this.isKeyTakeawaysLearningSlide(slide)) {
      return;
    }

    const chapter = this.chapterForLearningSlide(slide);
    const chapterIndex = this.toNullableFiniteNumber(chapter?.chapterIndex);
    if (!chapter || chapterIndex === null) {
      return;
    }

    const existingQuizIndex = this.findSlideIndexForChapterSection(chapter, 'quiz');
    if (existingQuizIndex !== null) {
      this.goToSlide(existingQuizIndex);
      return;
    }

    if (this.quizGeneratingChapterIndexMap()[chapterIndex]) {
      return;
    }

    const request = this.buildGenerateChapterQuizRequest(chapter, chapterIndex);
    if (!request) {
      return;
    }

    this.quizGeneratingChapterIndexMap.update((current) => ({ ...current, [chapterIndex]: true }));
    this.showGenerationOverlay('Generating quiz...');
    this.ragApi.generateChapterQuiz(request).subscribe({
      next: (quiz) => {
        this.updateChapterQuiz(chapterIndex, {
          ...quiz,
          completed: quiz.completed === true
        });
        this.quizGeneratingChapterIndexMap.update((current) => {
          const next = { ...current };
          delete next[chapterIndex];
          return next;
        });
        this.hideGenerationOverlay();

        const updatedChapter = this.chapterItems().find((entry) => this.sameChapter(entry, chapter));
        const quizIndex = updatedChapter
          ? this.findSlideIndexForChapterSection(updatedChapter, 'quiz')
          : this.findSlideIndexForChapterSection(chapter, 'quiz');
        if (quizIndex !== null) {
          this.goToSlide(quizIndex);
        }
      },
      error: (err) => {
        this.quizGeneratingChapterIndexMap.update((current) => {
          const next = { ...current };
          delete next[chapterIndex];
          return next;
        });
        this.hideGenerationOverlay();
        console.warn('[Pipeline] Failed to generate chapter quiz', {
          docKey: this.docKey(),
          chapterIndex,
          error: this.readApiError(err)
        });
      }
    });
  }

  goToNextChapterFromTakeaways(slide: RagLearnSlide): void {
    if (!this.isKeyTakeawaysLearningSlide(slide)) {
      return;
    }

    this.requestLearningContinuation();
  }

  completeChapterQuiz(chapter: RagLearningPipelineChapter): void {
    const chapterIndex = this.toNullableFiniteNumber(chapter.chapterIndex);
    const docKey = this.docKey().trim();
    if (!docKey || chapterIndex === null || chapter.quiz?.completed === true) {
      return;
    }

    this.ragApi.completeChapterQuiz({
      docKey,
      chapterIndex,
      chapterTitle: typeof chapter.title === 'string' ? chapter.title.trim() : undefined
    }).subscribe({
      next: () => {
        this.updateChapterQuiz(chapterIndex, {
          ...(chapter.quiz ?? {}),
          docKey,
          chapterIndex,
          chapterTitle: typeof chapter.title === 'string' ? chapter.title.trim() : undefined,
          questions: Array.isArray(chapter.quiz?.questions) ? chapter.quiz?.questions : [],
          completed: true
        });
      },
      error: (err) => {
        console.warn('[Pipeline] Failed to complete chapter quiz', {
          docKey,
          chapterIndex,
          error: this.readApiError(err)
        });
      }
    });
  }

  private slideMatchesChapter(
    slide: RagLearnSlide | RagComicSlide,
    chapter: RagLearningPipelineChapter
  ): boolean {
    const slideChapterIndex =
      'chapterIndex' in slide ? this.toNullableFiniteNumber(slide['chapterIndex']) : null;
    const chapterIndex = this.toNullableFiniteNumber(chapter.chapterIndex);
    if (slideChapterIndex !== null && chapterIndex !== null) {
      return slideChapterIndex === chapterIndex;
    }

    const chunkValues = this.slideChunkIndexes(slide);
    const pageValues = this.slidePageNumbers(slide);
    return (
      this.matchesChapterRange(chunkValues, chapter.startChunkIndex, chapter.endChunkIndex) ||
      this.matchesChapterRange(pageValues, chapter.startPageNumber, chapter.endPageNumber)
    );
  }

  private slideChunkIndexes(slide: RagLearnSlide | RagComicSlide): number[] {
    if ('sourcePageNumbers' in slide) {
      const values = [
        ...(Array.isArray(slide.chunkIndexes) ? slide.chunkIndexes : []),
        typeof slide.chunkIndex === 'number' ? slide.chunkIndex : null
      ];
      return values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    }

    const comicNote = slide.comicNote as { chunkIndex?: number } | undefined;
    const chunkIndex = comicNote?.chunkIndex;
    return typeof chunkIndex === 'number' && Number.isFinite(chunkIndex) ? [chunkIndex] : [];
  }

  private slidePageNumbers(slide: RagLearnSlide | RagComicSlide): number[] {
    if ('sourcePageNumbers' in slide && Array.isArray(slide.sourcePageNumbers)) {
      return slide.sourcePageNumbers.filter(
        (value): value is number => typeof value === 'number' && Number.isFinite(value)
      );
    }
    return [];
  }

  private matchesChapterRange(values: number[], start?: number, end?: number): boolean {
    if (!values.length) {
      return false;
    }

    const normalizedStart = typeof start === 'number' && Number.isFinite(start) ? start : null;
    const normalizedEnd = typeof end === 'number' && Number.isFinite(end) ? end : null;
    if (normalizedStart === null && normalizedEnd === null) {
      return false;
    }

    return values.some((value) => {
      if (normalizedStart !== null && value < normalizedStart) {
        return false;
      }
      if (normalizedEnd !== null && value > normalizedEnd) {
        return false;
      }
      return true;
    });
  }

  private sameChapter(
    left: RagLearningPipelineChapter | null | undefined,
    right: RagLearningPipelineChapter | null | undefined
  ): boolean {
    if (!left || !right) {
      return false;
    }

    return (
      this.toNullableFiniteNumber(left.chapterIndex) === this.toNullableFiniteNumber(right.chapterIndex) &&
      (left.title ?? '') === (right.title ?? '') &&
      this.toNullableFiniteNumber(left.startChunkIndex) === this.toNullableFiniteNumber(right.startChunkIndex) &&
      this.toNullableFiniteNumber(left.endChunkIndex) === this.toNullableFiniteNumber(right.endChunkIndex) &&
      this.toNullableFiniteNumber(left.startPageNumber) === this.toNullableFiniteNumber(right.startPageNumber) &&
      this.toNullableFiniteNumber(left.endPageNumber) === this.toNullableFiniteNumber(right.endPageNumber)
    );
  }

  private initialSlideIndex(slideCount: number): number {
    if (slideCount <= 0) {
      return 0;
    }

    const desiredIndex = this.desiredInitialSlideIndex;
    if (desiredIndex === null || !Number.isFinite(desiredIndex)) {
      return this.clampSlideIndex(this.currentSlide(), slideCount);
    }

    return this.clampSlideIndex(Math.max(0, Math.floor(desiredIndex)), slideCount);
  }

  private consumePendingLearningContinuationIndex(): number {
    const pendingIndex = this.pendingLearningContinuationIndex;
    this.pendingLearningContinuationIndex = null;
    const slideCount = this.visibleLearningSlides().length;
    if (pendingIndex === null || !Number.isFinite(pendingIndex)) {
      return this.clampSlideIndex(this.currentSlide(), slideCount);
    }

    return this.clampSlideIndex(Math.max(0, Math.floor(pendingIndex)), slideCount);
  }

  private persistLastSlide(index: number): void {
    const normalizedIndex = Math.max(0, Math.floor(index));
    if (this.lastPersistedSlideIndex === normalizedIndex || this.pendingLastSlideIndex === normalizedIndex) {
      return;
    }

    this.pendingLastSlideIndex = normalizedIndex;
    this.clearPersistLastSlideTimer();
    this.persistLastSlideTimer = setTimeout(() => {
      this.flushPersistLastSlide();
    }, PipelineComponent.lastSlidePersistDebounceMs);
  }

  private flushPersistLastSlide(): void {
    const docId = this.docId();
    const normalizedIndex = this.pendingLastSlideIndex;
    this.clearPersistLastSlideTimer();
    if (docId === null || normalizedIndex === null || this.lastPersistedSlideIndex === normalizedIndex) {
      return;
    }

    this.pendingLastSlideIndex = null;
    this.lastPersistedSlideIndex = normalizedIndex;
    this.ragApi.saveDocumentLastSlide(docId, normalizedIndex).subscribe({
      error: (err) => {
        this.lastPersistedSlideIndex = null;
        console.warn('[Pipeline] Failed to persist last slide', {
          docId,
          lastSlide: normalizedIndex,
          error: this.readApiError(err)
        });
      }
    });
  }

  private clearPersistLastSlideTimer(): void {
    if (this.persistLastSlideTimer !== null) {
      clearTimeout(this.persistLastSlideTimer);
      this.persistLastSlideTimer = null;
    }
  }

  private async loadDocumentMode(docKey: string): Promise<void> {
    try {
      const docs = await firstValueFrom(this.ragApi.listDocuments());
      const normalizedDocKey = docKey.trim();
      const match = (docs ?? []).find((doc: RagDocumentResponse) => {
        const candidate = typeof doc.docKey === 'string' ? doc.docKey.trim() : '';
        return candidate === normalizedDocKey;
      });
      const mode = typeof match?.['mode'] === 'string' ? match['mode'].trim() : '';
      this.documentMode.set(this.toDocumentMode(mode));
      this.docId.set(this.toNullableFiniteNumber(match?.documentId ?? match?.id) ?? this.docId());
      this.desiredInitialSlideIndex = this.toNullableFiniteNumber(match?.lastSlide);
      this.lastPersistedSlideIndex = this.desiredInitialSlideIndex;
    } catch {
      this.documentMode.set(null);
    }
  }

  private async loadSourcePagesForCurrentSlide(): Promise<void> {
    const docId = this.docId();
    const sourcePageNumbers = this.visibleSourcePageNumbers();
    if (docId === null || !sourcePageNumbers.length) {
      this.sourcePages.set([]);
      this.sourceMessage.set('No source pages for this slide.');
      this.sourceLoading.set(false);
      this.loadedSourceSignature = '';
      return;
    }

    const signature = `${docId}|${sourcePageNumbers.join(',')}`;
    if (signature === this.loadedSourceSignature && this.sourcePages().length) {
      this.sourceLoading.set(false);
      this.sourceMessage.set('');
      return;
    }

    const token = ++this.sourcePdfLoadToken;
    this.sourceLoading.set(true);
    this.sourceMessage.set('');

    try {
      const baseUrl = this.ragApi.getDocumentPdfUrl(docId);
      const renderedPages: SourcePreviewPage[] = sourcePageNumbers.map((pageNumber) => ({
        pageNumber,
        pdfUrl: `${baseUrl}#page=${pageNumber}&view=FitH&navpanes=0&pagemode=none`,
        trustedPdfUrl: this.sanitizer.bypassSecurityTrustResourceUrl(
          `${baseUrl}#page=${pageNumber}&view=FitH&navpanes=0&pagemode=none`
        )
      }));

      if (token !== this.sourcePdfLoadToken) {
        return;
      }

      this.sourcePages.set(renderedPages);
      this.loadedSourceSignature = signature;
      this.sourceMessage.set(renderedPages.length ? '' : 'No source pages available.');
    } catch (err) {
      console.error('[Pipeline] Failed to load source pages', err);
      this.sourcePages.set([]);
      this.loadedSourceSignature = '';
      this.sourceMessage.set(`Failed to load source pages: ${this.readApiError(err)}`);
    } finally {
      if (token === this.sourcePdfLoadToken) {
        this.sourceLoading.set(false);
      }
    }
  }

  private loadLearningSlidesFallback(docKey: string, loadStartedAt: number): void {
    this.ragApi.getLearningSlides(docKey).subscribe({
      next: (response) => {
        const nextSlides = Array.isArray(response.slides) ? response.slides : [];
        const totalCount = typeof response.count === 'number' ? response.count : nextSlides.length;
        const returnedCount =
          typeof response.returnedCount === 'number' ? response.returnedCount : nextSlides.length;
        const backendLastLimit =
          typeof response.lastLimit === 'number' && Number.isFinite(response.lastLimit)
            ? response.lastLimit
            : null;
        const nextCursor = backendLastLimit !== null ? backendLastLimit : returnedCount;
        const elapsedMs =
          (typeof performance !== 'undefined' ? performance.now() : Date.now()) - loadStartedAt;

        this.docId.set(this.toNullableFiniteNumber(response.docId) ?? this.docId());
        this.slides.set([]);
        this.learningSlides.set(nextSlides);
        this.viewMode.set('learning');
        this.slideDialogsById.set({});
        this.slideDialogsLoadingById.set({});
        this.slideDialogsErrorById.set({});
        this.learningBatchStart.set(Math.max(0, nextCursor - PipelineComponent.comicBatchSize));
        this.learningBatchEnd.set(nextCursor);
        this.showLoadMoreLearningSlide.set(totalCount > returnedCount);
        this.writeBatchState(docKey, PipelineComponent.learningBatchStateStorageKey, {
          start: Math.max(0, nextCursor - PipelineComponent.comicBatchSize),
          end: nextCursor,
          hasMore: totalCount > returnedCount
        });
        const nextIndex = this.initialSlideIndex(nextSlides.length);
        this.currentSlide.set(nextIndex);
        this.syncSwiperSlide(nextIndex);
        this.slidesLoading.set(false);
        this.slidesMessage.set('');
        if (nextSlides.length) {
          this.autoRequestedInitialSlides = false;
          if (this.sourceOpen()) {
            void this.loadSourcePagesForCurrentSlide();
          }
        } else if (this.autoGenerateSlidesIfEmpty(docKey)) {
          return;
        }
        console.info('[Pipeline] Learning slide fallback finished', {
          docKey,
          slideCount: nextSlides.length,
          totalCount,
          returnedCount,
          lastLimit: backendLastLimit,
          nextCursor,
          elapsedMs: Math.round(elapsedMs)
        });
        this.hideSlidesOverlay();
      },
      error: (err) => {
        const elapsedMs =
          (typeof performance !== 'undefined' ? performance.now() : Date.now()) - loadStartedAt;
        const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
        const backendMessage =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
        this.slides.set([]);
        this.learningSlides.set([]);
        this.viewMode.set('comic');
        this.slidesLoading.set(false);
        this.slidesMessage.set(`Failed to get slides (${status}): ${backendMessage}`);
        this.hideSlidesOverlay();
        console.warn('[Pipeline] Learning slide fallback failed', {
          docKey,
          elapsedMs: Math.round(elapsedMs),
          status,
          backendMessage
        });
      }
    });
  }


  private async loadCurrentSlideDialogs(): Promise<void> {
    const slide = this.currentSlideItem();
    if (!slide) {
      return;
    }
    await this.ensureSlideDialogsLoaded(slide);
  }

  private generateLearningBatch(docKey: string, start: number, end: number): void {
    const requestStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.loading.set(true);
    this.message.set('');
    this.showGenerationOverlay('Generating slides...');

    this.ragApi.generateLearningSlides({ docKey }).subscribe({
      next: (response) => {
        const finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const requestElapsedMs = finishedAt - requestStartedAt;
        const hasMore = this.shouldShowLoadMoreForLearning(response);
        const returnedCount = Array.isArray(response.slides) ? response.slides.length : 0;
        const backendLastLimit = this.toNullableFiniteNumber(response.lastLimit);
        this.docId.set(this.toNullableFiniteNumber(response.docId) ?? this.docId());
        const nextCursor =
          backendLastLimit !== null && backendLastLimit >= start
            ? backendLastLimit
            : start + returnedCount;
        this.loading.set(false);
        this.viewMode.set('learning');
        this.learningBatchStart.set(start);
        this.learningBatchEnd.set(nextCursor);
        this.showLoadMoreLearningSlide.set(hasMore);
        this.writeBatchState(docKey, PipelineComponent.learningBatchStateStorageKey, {
          start,
          end: nextCursor,
          hasMore
        });
        this.message.set('');
        this.appendLearningSlides(response);
        if (Array.isArray(response.slides) && response.slides.length && this.sourceOpen()) {
          void this.loadSourcePagesForCurrentSlide();
        }
        console.info('[Pipeline] Generate learning response received', {
          docKey,
          nextCursor,
          requestElapsedMs: Math.round(requestElapsedMs),
          returnedCount,
          totalCount: response.count ?? null,
          lastLimit: response.lastLimit ?? null
        });
        this.hideSlidesOverlay();
        this.hideGenerationOverlay();
      },
      error: (err) => {
        const elapsedMs =
          (typeof performance !== 'undefined' ? performance.now() : Date.now()) - requestStartedAt;
        const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
        const backendMessage =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
        this.loading.set(false);
        this.pendingLearningContinuationIndex = null;
        this.message.set(`Failed to generate learning (${status}): ${backendMessage}`);
        this.hideSlidesOverlay();
        this.hideGenerationOverlay();
        console.warn('[Pipeline] Generate learning failed', {
          docKey,
          elapsedMs: Math.round(elapsedMs),
          status,
          backendMessage
        });
      }
    });
  }

  private shouldShowLoadMoreForLearning(response: RagLearnSlidesResponse): boolean {
    const returnedCount = Array.isArray(response.slides) ? response.slides.length : 0;

    if (returnedCount === 0) {
      return false;
    }

    const totalCount = this.toNullableFiniteNumber(response.count);
    const lastLimit = this.toNullableFiniteNumber(response.lastLimit);
    if (totalCount !== null && lastLimit !== null) {
      return totalCount > lastLimit;
    }

    return returnedCount >= PipelineComponent.comicBatchSize;
  }

  private clampSlideIndex(index: number, slideCount: number): number {
    const maxIndex = Math.max(0, slideCount - 1);
    return Math.max(0, Math.min(index, maxIndex));
  }

  private syncCharacterReferencesFromSlides(slides: RagComicSlide[]): void {
    this.characterReferences.set(this.characterReferencesFromSlides(slides));
  }

  private mergeCharacterReferencesFromSlides(slides: RagComicSlide[]): void {
    if (!slides.length) {
      return;
    }

    const nextByKey = new Map<string, RagCharacterReferenceImageResponse>();
    for (const character of this.characterReferences()) {
      this.upsertCharacterReference(nextByKey, character);
    }

    for (const character of this.characterReferencesFromSlides(slides)) {
      this.upsertCharacterReference(nextByKey, character);
    }

    this.characterReferences.set(Array.from(nextByKey.values()));
  }

  private characterReferencesFromSlides(slides: RagComicSlide[]): RagCharacterReferenceImageResponse[] {
    const nextByKey = new Map<string, RagCharacterReferenceImageResponse>();

    for (const slide of slides) {
      if (this.storySlideType(slide) !== 'CHARACTER_INTRO') {
        continue;
      }

      const imageUrl = Array.isArray(slide.imageUrls)
        ? slide.imageUrls.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim()
        : '';
      const names = Array.isArray(slide.charactersInSlide)
        ? slide.charactersInSlide
            .map((character) => (typeof character.name === 'string' ? character.name.trim() : ''))
            .filter((value) => value.length > 0)
        : [];

      for (const name of names) {
        const character = {
          characterName: name,
          imageUrl: imageUrl || undefined
        } satisfies RagCharacterReferenceImageResponse;
        this.upsertCharacterReference(nextByKey, character);
      }
    }

    return Array.from(nextByKey.values());
  }

  private characterReferenceKey(character: RagCharacterReferenceImageResponse): string {
    const name = this.normalizedCharacterReferenceName(character.characterName);
    const imageUrl = typeof character.imageUrl === 'string' ? character.imageUrl.trim() : '';
    return name || imageUrl;
  }

  private upsertCharacterReference(
    nextByKey: Map<string, RagCharacterReferenceImageResponse>,
    character: RagCharacterReferenceImageResponse
  ): void {
    const key = this.characterReferenceKey(character);
    if (!key) {
      return;
    }

    const existing = nextByKey.get(key);
    if (!existing) {
      nextByKey.set(key, character);
      return;
    }

    const existingName =
      typeof existing.characterName === 'string' ? existing.characterName.trim() : '';
    const nextName =
      typeof character.characterName === 'string' ? character.characterName.trim() : '';
    const existingImageUrl =
      typeof existing.imageUrl === 'string' ? existing.imageUrl.trim() : '';
    const nextImageUrl =
      typeof character.imageUrl === 'string' ? character.imageUrl.trim() : '';

    nextByKey.set(key, {
      characterName: this.preferredCharacterReferenceName(existingName, nextName) || undefined,
      imageUrl: nextImageUrl || existingImageUrl || undefined
    });
  }

  private normalizedCharacterReferenceName(value: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }

    return value
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private preferredCharacterReferenceName(existingName: string, nextName: string): string {
    if (!existingName) {
      return nextName;
    }
    if (!nextName) {
      return existingName;
    }

    return this.characterReferenceNameScore(nextName) > this.characterReferenceNameScore(existingName)
      ? nextName
      : existingName;
  }

  private characterReferenceNameScore(name: string): number {
    const trimmed = name.trim();
    if (!trimmed) {
      return 0;
    }

    let score = trimmed.length;
    if (/[A-Z]/.test(trimmed)) {
      score += 20;
    }
    if (trimmed.includes(' ')) {
      score += 10;
    }
    if (/[-_]/.test(trimmed)) {
      score -= 10;
    }
    if (trimmed === trimmed.toLowerCase()) {
      score -= 5;
    }

    return score;
  }

  private characterIntroDetails(character: RagCharacterReferenceImageResponse): CharacterIntroDetails {
    const fallbackName = this.characterName(character);
    const normalizedName = this.normalizedCharacterReferenceName(character.characterName);
    const fallbackImageUrl =
      typeof character.imageUrl === 'string' && character.imageUrl.trim() ? character.imageUrl.trim() : null;
    const introSlide = this.slides().find((slide) => {
      if (this.storySlideType(slide) !== 'CHARACTER_INTRO') {
        return false;
      }

      const names = Array.isArray(slide.charactersInSlide)
        ? slide.charactersInSlide
            .map((entry) => this.normalizedCharacterReferenceName(entry.name))
            .filter((value) => value.length > 0)
        : [];
      return names.includes(normalizedName);
    });

    if (!introSlide) {
      return {
        name: fallbackName,
        imageUrl: fallbackImageUrl,
        slideTitle: '',
        introText: 'No introduction available.'
      };
    }

    const slideImageUrl = this.slideImageUrl(introSlide);
    const narration = this.mainNote(introSlide);
    const dialogue = this.dialogue(introSlide).join('\n\n').trim();
    return {
      name: fallbackName,
      imageUrl: slideImageUrl || fallbackImageUrl,
      slideTitle: this.storySlideTitle(introSlide),
      introText: dialogue || narration || 'No introduction available.'
    };
  }

  private async loadCharacterReferences(docKey: string, slides: RagComicSlide[]): Promise<void> {
    const normalizedDocKey = docKey.trim();
    if (!normalizedDocKey) {
      return;
    }

    try {
      const references = await firstValueFrom(this.ragApi.getCharacterReferences(normalizedDocKey));
      if (this.docKey().trim() !== normalizedDocKey) {
        return;
      }

      const nextByKey = new Map<string, RagCharacterReferenceImageResponse>();
      for (const character of this.characterReferencesFromSlides(slides)) {
        this.upsertCharacterReference(nextByKey, character);
      }

      for (const character of Array.isArray(references) ? references : []) {
        this.upsertCharacterReference(nextByKey, character);
      }

      this.characterReferences.set(Array.from(nextByKey.values()));
    } catch {
      // Keep the slide-derived references when the character reference list is unavailable.
    }
  }


  private appendLearningSlides(response: RagLearnSlidesResponse): void {
    const generatedSlides = Array.isArray(response.slides) ? response.slides : [];
    if (!generatedSlides.length) {
      this.pendingLearningContinuationIndex = null;
      return;
    }

    const combinedSlides = [...this.learningSlides(), ...generatedSlides];
    this.learningSlides.set(combinedSlides);
    const nextIndex = this.consumePendingLearningContinuationIndex();
    this.currentSlide.set(nextIndex);
    this.syncSwiperSlide(nextIndex);
    this.maybeAutoLoadMoreAfterSlideAdvance(nextIndex);
    console.info('[Pipeline] Learning slides appended', {
      appendedCount: generatedSlides.length,
      totalCount: combinedSlides.length,
      currentSlide: nextIndex
    });
  }

  private appendFetchedLearningSlides(fetchedSlides: RagLearnSlide[]): void {
    if (!fetchedSlides.length) {
      return;
    }

    const existingKeys = new Set(
      this.learningSlides().map((slide, index) => {
        const id = this.toNullableFiniteNumber(slide.id);
        return id !== null ? `id-${id}` : `idx-${index}-${slide.title ?? ''}-${slide.summary ?? ''}`;
      })
    );

    const dedupedSlides = fetchedSlides.filter((slide, index) => {
      const id = this.toNullableFiniteNumber(slide.id);
      const key =
        id !== null ? `id-${id}` : `idx-${index}-${slide.title ?? ''}-${slide.summary ?? ''}`;
      if (existingKeys.has(key)) {
        return false;
      }
      existingKeys.add(key);
      return true;
    });

    if (!dedupedSlides.length) {
      return;
    }

    const combinedSlides = [...this.learningSlides(), ...dedupedSlides];
    const nextIndex = this.clampSlideIndex(this.currentSlide(), combinedSlides.length);
    this.learningSlides.set(combinedSlides);
    this.currentSlide.set(nextIndex);
    this.syncSwiperSlide(nextIndex);
  }

  private chapterKeyTakeaways(chapter: RagLearningPipelineChapter): string[] {
    const collected = new Set<string>();

    for (const slide of this.learningSlides()) {
      if (!this.slideMatchesChapter(slide, chapter)) {
        continue;
      }

      for (const takeaway of this.learningSlideKeyTakeaways(slide)) {
        collected.add(takeaway);
      }
    }

    return [...collected];
  }

  private chapterReviewSlides(chapter: RagLearningPipelineChapter): RagLearnSlide[] {
    const contextReviewSlides = Array.isArray(chapter.reviewSlides) ? chapter.reviewSlides : [];
    if (!contextReviewSlides.length) {
      return [];
    }

    const chapterIndex = this.toNullableFiniteNumber(chapter.chapterIndex);
    return contextReviewSlides.filter((slide) => {
      if (chapterIndex === null) {
        return true;
      }

      const slideChapterIndex = this.toNullableFiniteNumber(slide['chapterIndex']);
      return slideChapterIndex === null || slideChapterIndex === chapterIndex;
    });
  }

  private reviewQuizLearningSlidesForChapter(chapter: RagLearningPipelineChapter): RagLearnSlide[] {
    const questions = Array.isArray(chapter.reviewQuiz?.questions) ? chapter.reviewQuiz.questions : [];
    const chapterIndex = this.toNullableFiniteNumber(chapter.chapterIndex);
    const chapterTitle = typeof chapter.title === 'string' ? chapter.title.trim() : '';

    return questions.map((question, questionIndex) => ({
      title: 'Review quiz',
      summary: '',
      sourcePageNumbers: [],
      quiz: true,
      reviewQuiz: true,
      review: true,
      chapterIndex: chapterIndex ?? undefined,
      chapterTitle,
      quizQuestionIndex: questionIndex,
      quizQuestion: typeof question.question === 'string' ? question.question.trim() : '',
      quizOptions: Array.isArray(question.options) ? question.options : []
    }));
  }

  private quizLearningSlidesForChapter(chapter: RagLearningPipelineChapter): RagLearnSlide[] {
    const questions = Array.isArray(chapter.quiz?.questions) ? chapter.quiz.questions : [];
    const chapterIndex = this.toNullableFiniteNumber(chapter.chapterIndex);
    const chapterTitle = typeof chapter.title === 'string' ? chapter.title.trim() : '';

    return questions.map((question, questionIndex) => ({
      title: 'Quiz',
      summary: '',
      sourcePageNumbers: [],
      quiz: true,
      chapterIndex: chapterIndex ?? undefined,
      chapterTitle,
      quizQuestionIndex: questionIndex,
      quizQuestion: typeof question.question === 'string' ? question.question.trim() : '',
      quizOptions: Array.isArray(question.options) ? question.options : []
    }));
  }

  private quizForLearningSlide(slide: RagLearnSlide | null | undefined): RagLearningChapterQuiz | null {
    const chapter = this.chapterForLearningSlide(slide);
    if (!chapter) {
      return null;
    }

    if (this.isReviewQuizLearningSlide(slide)) {
      return chapter.reviewQuiz ?? null;
    }

    if (this.isQuizLearningSlide(slide)) {
      return chapter.quiz ?? null;
    }

    return null;
  }

  private quizQuestionIndex(slide: RagLearnSlide | null | undefined): number | null {
    const questionIndex = slide?.['quizQuestionIndex'];
    return typeof questionIndex === 'number' && Number.isFinite(questionIndex) ? questionIndex : null;
  }

  private updateChapterQuizAnswer(
    chapterIndex: number,
    questionIndex: number,
    selectedAnswerIndex: number,
    review = false
  ): void {
    this.learningContext.update((current) => {
      if (!current || !Array.isArray(current.chapters)) {
        return current;
      }

      return {
        ...current,
        chapters: current.chapters.map((chapter) => {
          const currentChapterIndex = this.toNullableFiniteNumber(chapter.chapterIndex);
          if (currentChapterIndex !== chapterIndex || !Array.isArray(chapter.quiz?.questions)) {
            return chapter;
          }

          return {
            ...chapter,
            ...(review
              ? {
                  reviewQuiz: {
                    ...chapter.reviewQuiz,
                    questions: (chapter.reviewQuiz?.questions ?? []).map((question, index) =>
                      index === questionIndex ? { ...question, selectedAnswerIndex } : question
                    )
                  }
                }
              : {
                  quiz: {
                    ...chapter.quiz,
                    questions: chapter.quiz.questions.map((question, index) =>
                      index === questionIndex ? { ...question, selectedAnswerIndex } : question
                    )
                  }
                })
          };
        })
      };
    });
  }

  selectQuizAnswerOnSlide(slide: RagLearnSlide, optionIndex: number, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();

    const chapter = this.chapterForLearningSlide(slide);
    const chapterIndex = this.toNullableFiniteNumber(chapter?.chapterIndex);
    const questionIndex = this.quizQuestionIndex(slide);
    const docKey = this.docKey().trim();
    if (!chapter || chapterIndex === null || questionIndex === null || !docKey) {
      return;
    }

    if (this.selectedQuizOptionIndex(slide) !== null) {
      return;
    }

    this.updateChapterQuizAnswer(chapterIndex, questionIndex, optionIndex, this.isReviewQuizLearningSlide(slide));
    this.ragApi.answerChapterQuiz({
      docKey,
      chapterIndex,
      questionIndex,
      selectedAnswerIndex: optionIndex
    }).subscribe({
      error: () => {
        // Keep local answer state even if save fails.
      }
    });

    if (this.isReviewQuizLearningSlide(slide)) {
      return;
    }

    const updatedChapter = this.chapterItems().find((entry) => this.sameChapter(entry, chapter));
    if (
      updatedChapter &&
      Array.isArray(updatedChapter.quiz?.questions) &&
      updatedChapter.quiz.questions.every(
        (question) => typeof question.selectedAnswerIndex === 'number'
      ) &&
      updatedChapter.quiz.completed !== true
    ) {
      this.completeChapterQuiz(updatedChapter);
    }
  }

  advanceAfterQuiz(slide: RagLearnSlide): void {
    const chapter = this.chapterForLearningSlide(slide);
    const chapterIndex = this.toNullableFiniteNumber(chapter?.chapterIndex);
    const docKey = this.docKey().trim();
    if (!chapter || chapterIndex === null || !docKey) {
      return;
    }

    const questions = Array.isArray(chapter.quiz?.questions) ? chapter.quiz.questions : [];
    const allAnswered = questions.every((question) => typeof question.selectedAnswerIndex === 'number');
    if (!allAnswered) {
      return;
    }

    if (questions.some((question) => question.selectedAnswerIndex !== question.correctAnswerIndex)) {
      if (this.chapterReviewSlides(chapter).length) {
        const reviewIndex = this.findSlideIndexForChapterSection(chapter, 'review');
        if (reviewIndex !== null) {
          this.goToSlide(reviewIndex);
        }
        return;
      }

      this.generateChapterReviewSlides(chapter, chapterIndex, docKey, true);
      return;
    }

    this.requestLearningContinuation();
  }

  advanceAfterReview(slide: RagLearnSlide): void {
    if (!this.isLastReviewSlideForChapter(slide)) {
      return;
    }
    const chapter = this.chapterForLearningSlide(slide);
    const chapterIndex = this.toNullableFiniteNumber(chapter?.chapterIndex);
    const docKey = this.docKey().trim();
    if (!chapter || chapterIndex === null || !docKey) {
      return;
    }

    if (Array.isArray(chapter.reviewQuiz?.questions) && chapter.reviewQuiz.questions.length > 0) {
      const reviewQuizIndex = this.findSlideIndexForChapterReviewQuiz(chapter);
      if (reviewQuizIndex !== null) {
        this.goToSlide(reviewQuizIndex);
      }
      return;
    }

    const request = this.buildGenerateReviewQuizRequest(chapter, chapterIndex, docKey);
    if (!request) {
      this.requestLearningContinuation();
      return;
    }

    this.showGenerationOverlay('Generating quiz...');
    this.ragApi.generateReviewQuiz(request).subscribe({
      next: (reviewQuiz) => {
        this.updateChapterReviewQuiz(chapterIndex, {
          ...reviewQuiz,
          review: true,
          completed: reviewQuiz.completed === true
        });
        this.hideGenerationOverlay();

        const updatedChapter = this.chapterItems().find((entry) => this.sameChapter(entry, chapter));
        const reviewQuizIndex = updatedChapter
          ? this.findSlideIndexForChapterReviewQuiz(updatedChapter)
          : this.findSlideIndexForChapterReviewQuiz(chapter);
        if (reviewQuizIndex !== null) {
          this.goToSlide(reviewQuizIndex);
        }
      },
      error: (err) => {
        this.hideGenerationOverlay();
        console.warn('[Pipeline] Failed to generate review quiz', {
          docKey,
          chapterIndex,
          error: this.readApiError(err)
        });
      }
    });
  }

  advanceToNextChapterAfterReviewQuiz(slide: RagLearnSlide): void {
    if (!this.isLastReviewQuizSlideForChapter(slide)) {
      return;
    }

    this.requestLearningContinuation();
  }

  private requestLearningContinuation(): void {
    this.pendingLearningContinuationIndex = this.visibleLearningSlides().length;
    this.loadMoreSlides();
  }

  private autoGenerateSlidesIfEmpty(docKey: string): boolean {
    const normalizedDocKey = docKey.trim();
    if (!normalizedDocKey || this.autoRequestedInitialSlides || this.loading() || this.clearing()) {
      return false;
    }

    this.autoRequestedInitialSlides = true;
    this.hideSlidesOverlay();
    this.showSlidesOverlay('Generating slides...');
    this.slidesMessage.set('');

    const mode = this.documentMode();
    const shouldGenerateLearning =
      mode === 'Learning Mode' ||
      mode === 'Action Mode' ||
      mode === 'Extraction Mode' ||
      (mode === null && (this.learningContext()?.chapters?.length ?? 0) > 0);

    if (shouldGenerateLearning) {
      this.viewMode.set('learning');
      this.generateLearningBatch(normalizedDocKey, 0, PipelineComponent.comicBatchSize);
      return true;
    }

    this.viewMode.set('comic');
    return false;
  }

  private buildGenerateReviewQuizRequest(
    chapter: RagLearningPipelineChapter,
    chapterIndex: number,
    docKey: string
  ): RagGenerateReviewQuizRequest | null {
    const chapterTitle = typeof chapter.title === 'string' ? chapter.title.trim() : '';
    const keyTakeaways = this.chapterKeyTakeaways(chapter);
    const questions = Array.isArray(chapter.quiz?.questions) ? chapter.quiz.questions : [];
    const incorrectQuestions = questions
      .map((question, questionIndex) => ({ question, questionIndex }))
      .filter(
        ({ question }) =>
          typeof question.selectedAnswerIndex === 'number' &&
          question.selectedAnswerIndex !== question.correctAnswerIndex
      )
      .map(({ question, questionIndex }) => ({
        sourceIndex: questionIndex,
        incorrectAnsweredQuestion:
          typeof question.question === 'string' ? question.question.trim() : '',
        referencePageNumbers: Array.isArray(question.referencePageNumbers)
          ? question.referencePageNumbers.filter(
              (value): value is number => typeof value === 'number' && Number.isFinite(value)
            )
          : []
      }))
      .filter((source) => source.incorrectAnsweredQuestion.length > 0);

    if (!chapterTitle || !keyTakeaways.length || !incorrectQuestions.length) {
      return null;
    }

    return {
      docKey,
      chapterIndex,
      chapterTitle,
      keyTakeaways: keyTakeaways.map((takeaway) => `- ${this.stripMarkdownForPlainText(takeaway)}`).join('\n'),
      reviewSources: incorrectQuestions
    };
  }

  private chapterHasQuiz(chapter: RagLearningPipelineChapter | null | undefined): boolean {
    return Array.isArray(chapter?.quiz?.questions) && chapter.quiz.questions.length > 0;
  }

  private buildGenerateChapterQuizRequest(
    chapter: RagLearningPipelineChapter,
    chapterIndex: number
  ): RagGenerateChapterQuizRequest | null {
    const docKey = this.docKey().trim();
    const chapterTitle = typeof chapter.title === 'string' ? chapter.title.trim() : '';
    const keyTakeaways = this.chapterKeyTakeaways(chapter);
    const slides = this.learningSlides()
      .map((slide, slideIndex) => ({ slide, slideIndex }))
      .filter(({ slide }) => this.slideMatchesChapter(slide, chapter))
      .map(({ slide, slideIndex }) => ({
        slideIndex,
        title: this.learningTitle(slide),
        summary: this.learningSummaryPlainText(slide),
        sourcePageNumbers: this.slidePageNumbers(slide)
      }))
      .filter((slide) => slide.summary.trim().length > 0);

    if (!docKey || !chapterTitle || !keyTakeaways.length || !slides.length) {
      return null;
    }

    return {
      docKey,
      chapterIndex,
      chapterTitle,
      keyTakeaways: keyTakeaways.map((takeaway) => `- ${this.stripMarkdownForPlainText(takeaway)}`).join('\n'),
      slides
    };
  }

  private updateChapterQuiz(chapterIndex: number, quiz: RagLearningChapterQuiz): void {
    this.learningContext.update((current) => {
      if (!current || !Array.isArray(current.chapters)) {
        return current;
      }

      return {
        ...current,
        chapters: current.chapters.map((chapter) => {
          const currentChapterIndex = this.toNullableFiniteNumber(chapter.chapterIndex);
          if (currentChapterIndex !== chapterIndex) {
            return chapter;
          }

          return {
            ...chapter,
            quiz: {
              ...chapter.quiz,
              ...quiz,
              chapterIndex,
              chapterTitle:
                quiz.chapterTitle ??
                (typeof chapter.title === 'string' ? chapter.title.trim() : undefined)
            }
          };
        })
      };
    });
  }

  private updateChapterReviewQuiz(chapterIndex: number, reviewQuiz: RagLearningChapterQuiz): void {
    this.learningContext.update((current) => {
      if (!current || !Array.isArray(current.chapters)) {
        return current;
      }

      return {
        ...current,
        chapters: current.chapters.map((chapter) => {
          const currentChapterIndex = this.toNullableFiniteNumber(chapter.chapterIndex);
          if (currentChapterIndex !== chapterIndex) {
            return chapter;
          }

          return {
            ...chapter,
            reviewQuiz: {
              ...chapter.reviewQuiz,
              ...reviewQuiz,
              chapterIndex,
              chapterTitle:
                reviewQuiz.chapterTitle ??
                (typeof chapter.title === 'string' ? chapter.title.trim() : undefined)
            }
          };
        })
      };
    });
  }

  private updateChapterReviewSlides(chapterIndex: number, reviewSlides: RagLearnSlide[]): void {
    this.learningContext.update((current) => {
      if (!current || !Array.isArray(current.chapters)) {
        return current;
      }

      return {
        ...current,
        chapters: current.chapters.map((chapter) => {
          const currentChapterIndex = this.toNullableFiniteNumber(chapter.chapterIndex);
          if (currentChapterIndex !== chapterIndex) {
            return chapter;
          }

          return {
            ...chapter,
            reviewSlides
          };
        })
      };
    });
  }

  private generateChapterReviewSlides(
    chapter: RagLearningPipelineChapter,
    chapterIndex: number,
    docKey: string,
    navigateToReview = false
  ): void {
    const incorrectAnsweredQuestions = this.incorrectAnsweredQuestionsForChapterQuiz(chapter);
    if (!incorrectAnsweredQuestions.length) {
      return;
    }

    this.showGenerationOverlay('Generating slides...');
    this.ragApi.generateChapterReviewSlides({
      docKey,
      chapterIndex,
      incorrectAnsweredQuestions
    }).subscribe({
      next: (response) => {
        this.hideGenerationOverlay();
        this.applyGeneratedChapterReviewSlides(chapter, chapterIndex, response, navigateToReview);
      },
      error: (err) => {
        this.hideGenerationOverlay();
        console.warn('[Pipeline] Failed to generate chapter review slides', {
          docKey,
          chapterIndex,
          error: this.readApiError(err)
        });
      }
    });
  }

  private incorrectAnsweredQuestionsForChapterQuiz(
    chapter: RagLearningPipelineChapter
  ): { question: string; referencePageNumbers: number[] }[] {
    const questions = Array.isArray(chapter.quiz?.questions) ? chapter.quiz.questions : [];

    return questions
      .filter(
        (question) =>
          typeof question.selectedAnswerIndex === 'number' &&
          question.selectedAnswerIndex !== question.correctAnswerIndex
      )
      .map((question) => ({
        question: typeof question.question === 'string' ? question.question.trim() : '',
        referencePageNumbers: Array.isArray(question.referencePageNumbers)
          ? question.referencePageNumbers.filter(
              (value): value is number => typeof value === 'number' && Number.isFinite(value)
            )
          : []
      }))
      .filter((question) => question.question.length > 0);
  }

  private applyGeneratedChapterReviewSlides(
    chapter: RagLearningPipelineChapter,
    chapterIndex: number,
    response: RagGenerateChapterReviewSlidesResponse,
    navigateToReview = false
  ): void {
    const reviewSlides = Array.isArray(response.slides) ? response.slides : [];
    if (!reviewSlides.length) {
      return;
    }

    const chapterTitle = typeof chapter.title === 'string' ? chapter.title.trim() : '';
    const normalizedReviewSlides = reviewSlides.map((slide) => ({
      ...slide,
      review: true,
      chapterIndex:
        this.toNullableFiniteNumber(slide['chapterIndex']) ?? chapterIndex,
      chapterTitle: (typeof slide['chapterTitle'] === 'string' && slide['chapterTitle'].trim()) || chapterTitle
    }));

    this.updateChapterReviewSlides(chapterIndex, normalizedReviewSlides);
    if (navigateToReview) {
      const updatedChapter = this.chapterItems().find((entry) => this.sameChapter(entry, chapter));
      const reviewIndex = updatedChapter
        ? this.findSlideIndexForChapterSection(updatedChapter, 'review')
        : this.findSlideIndexForChapterSection(chapter, 'review');
      if (reviewIndex !== null) {
        this.goToSlide(reviewIndex);
      }
    }
  }

  private learningSlideKeyTakeaways(slide: RagLearnSlide | null | undefined): string[] {
    if (!slide) {
      return [];
    }

    const listCandidates = [
      slide.keyTakeaways,
      slide['key_takeaways'],
      slide['importantTakeaways'],
      slide['important_takeaways']
    ];

    for (const candidate of listCandidates) {
      if (Array.isArray(candidate)) {
        const normalized = candidate
          .filter((value): value is string => typeof value === 'string')
          .map((value) => this.normalizeTakeawayText(value))
          .filter((value, index, array) => value.length > 0 && array.indexOf(value) === index);
        if (normalized.length) {
          return normalized;
        }
      }

      if (typeof candidate === 'string') {
        const normalized = this.normalizeTakeawayText(candidate);
        if (normalized) {
          return [normalized];
        }
      }
    }

    if (this.isKeyTakeawaysLearningSlide(slide)) {
      return this.takeawayRowsFromSummary(this.learningSummary(slide));
    }

    return [];
  }

  private normalizeTakeawayText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  private takeawayRowsFromSummary(summary: string): string[] {
    const normalized = this.normalizeLearningSummaryMarkdown(summary);
    const rows = normalized
      .split('\n')
      .map((row) => row.trim())
      .filter(Boolean)
      .map((row) => row.replace(/^([-*+]|\d+\.)\s+/, ''))
      .map((row) => this.normalizeTakeawayText(row))
      .filter((row, index, array) => row.length > 0 && array.indexOf(row) === index);

    return rows.length ? rows : [this.normalizeTakeawayText(summary)].filter(Boolean);
  }

  isKeyTakeawaysLearningSlide(slide: RagLearnSlide | null | undefined): boolean {
    if (!slide) {
      return false;
    }

    const booleanCandidates = [
      slide.isKeyTakeaways,
      slide['is_key_takeaways'],
      slide['keyTakeaways'],
      slide['key_takeaways']
    ];

    for (const candidate of booleanCandidates) {
      if (candidate === true) {
        return true;
      }
      if (typeof candidate === 'string' && candidate.trim().toLowerCase() === 'true') {
        return true;
      }
    }

    const title = typeof slide.title === 'string' ? slide.title.trim().toLowerCase() : '';
    return title.includes('key takeaway') || title.includes('key takeaways');
  }

  private toNullableBooleanFlag(value: unknown): boolean | null {
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

  private syncSwiperSlide(index: number): void {
    setTimeout(() => {
      const swiper = this.carouselElement?.nativeElement?.swiper;
      swiper?.update?.();
      swiper?.slideTo?.(index);
    });
  }

  private playCurrentSlideIfAutoPlayEnabled(): void {
    if (!this.autoPlayEnabled()) {
      return;
    }

    if (this.viewMode() === 'learning') {
      const index = this.currentSlide();
      const slide = this.visibleLearningSlides()[index];
      if (!slide) {
        return;
      }

      const key = this.learningCardKey(index);
      if ((this.ttsPlaying() || this.ttsLoading()) && this.playingCardKey() === key) {
        return;
      }

      void this.playLearningCardTts(slide, index);
      return;
    }

    const index = this.currentSlide();
    const slide = this.slides()[index];
    if (!slide) {
      return;
    }

    const key = this.cardKey(slide, index);
    if ((this.ttsPlaying() || this.ttsLoading()) && this.playingCardKey() === key) {
      return;
    }

    void this.playCardTts(slide, index);
  }

  private readBatchState(docKey: string, storageKey: string): StoredSlideBatchState | null {
    if (!docKey || typeof window === 'undefined') {
      return null;
    }

    try {
      const rawValue = window.localStorage.getItem(storageKey);
      if (!rawValue) {
        return null;
      }

      const entries = JSON.parse(rawValue) as Record<string, StoredSlideBatchState | undefined>;
      const state = entries[docKey];
      if (!state) {
        return null;
      }

      return {
        start: this.toNonNegativeInteger(state.start),
        end: this.toNonNegativeInteger(state.end),
        hasMore: state.hasMore === true
      };
    } catch {
      return null;
    }
  }

  private writeBatchState(docKey: string, storageKey: string, state: StoredSlideBatchState): void {
    if (!docKey || typeof window === 'undefined') {
      return;
    }

    try {
      const rawValue = window.localStorage.getItem(storageKey);
      const entries = rawValue ? (JSON.parse(rawValue) as Record<string, StoredSlideBatchState>) : {};
      entries[docKey] = state;
      window.localStorage.setItem(storageKey, JSON.stringify(entries));
    } catch {
      // Ignore persistence failures and keep runtime state only.
    }
  }

  private resetSlideState(docKey: string): void {
    this.setFullscreenReader(false);
    this.closeStoryProcessStream();
    this.storyProcessStartedDocKey = '';
    this.storyProcessRequestDocKey = '';
    this.processAllRunning.set(false);
    this.suppressStoryAutoProcessStart = false;
    this.showLoadMoreSlide.set(false);
    this.learningBatchStart.set(0);
    this.learningBatchEnd.set(PipelineComponent.comicBatchSize);
    this.showLoadMoreLearningSlide.set(false);
    this.slides.set([]);
    this.learningSlides.set([]);
    this.slidesLoading.set(false);
    this.slidesMessage.set('');
    this.slideDialogsById.set({});
    this.slideDialogsLoadingById.set({});
    this.slideDialogsErrorById.set({});
    this.slideHeadsByCardKey.set({});
    this.slideHeadsLoadingByCardKey.set({});
    this.activeHeadCardKey.set('');
    this.currentSlide.set(0);
    this.viewMode.set('comic');
    this.summaryHiddenCardKey.set('');
    this.characterReferences.set([]);
    this.failedUriMap.set({});
    this.stopCardTts();
    this.writeBatchState(docKey, PipelineComponent.learningBatchStateStorageKey, {
      start: 0,
      end: PipelineComponent.comicBatchSize,
      hasMore: false
    });
  }

  private resetLearningSlideState(docKey: string): void {
    this.setFullscreenReader(false);
    this.learningBatchStart.set(0);
    this.learningBatchEnd.set(PipelineComponent.comicBatchSize);
    this.showLoadMoreLearningSlide.set(false);
    this.learningSlides.set([]);
    this.currentSlide.set(0);
    this.viewMode.set('comic');
    this.stopCardTts();
    this.writeBatchState(docKey, PipelineComponent.learningBatchStateStorageKey, {
      start: 0,
      end: PipelineComponent.comicBatchSize,
      hasMore: false
    });
  }

  private dialogueEntries(item: RagComicSlide): DialogueEntry[] {
    const slideId = this.toNullableFiniteNumber(item.id);
    if (slideId === null) {
      return [];
    }
    return this.slideDialogsById()[slideId] ?? [];
  }

  private dialogueBubbleAnchor(
    item: RagComicSlide,
    index: number,
    characterName: string,
    line: string
  ): SlideBubbleAnchor | null {
    const marker = this.findMarkerForCharacter(this.headMarkers(item, index), characterName);
    if (marker) {
      return {
        leftPercent: marker.leftPercent,
        topPercent: marker.topPercent
      };
    }

    const orderedCharacters = this.orderedSlideCharacters(item);
    if (!orderedCharacters.length) {
      return null;
    }

    const normalizedCharacter = this.normalizeCharacterName(characterName);
    const speakerIndex = orderedCharacters.findIndex((entry) => {
      const normalizedEntry = this.normalizeCharacterName(entry.name ?? '');
      return (
        normalizedEntry.length > 0 &&
        (normalizedEntry === normalizedCharacter ||
          normalizedEntry.includes(normalizedCharacter) ||
          normalizedCharacter.includes(normalizedEntry))
      );
    });

    const resolvedIndex = speakerIndex >= 0 ? speakerIndex : 0;
    return this.anchorForCharacterCount(orderedCharacters.length, resolvedIndex, line);
  }

  private orderedSlideCharacters(item: RagComicSlide): Array<{
    name?: string;
    characterKey?: string;
    characterIndex?: number;
  }> {
    const characters = Array.isArray(item.charactersInSlide) ? item.charactersInSlide.slice() : [];
    return characters.sort(
      (a, b) =>
        this.toNonNegativeInteger(a.characterIndex) - this.toNonNegativeInteger(b.characterIndex)
    );
  }

  private anchorForCharacterCount(count: number, index: number, seedText: string): SlideBubbleAnchor {
    const jitter = this.dialogueVerticalJitter(seedText);
    if (count <= 1) {
      return { leftPercent: 50, topPercent: 44 + jitter };
    }
    if (count === 2) {
      return index <= 0
        ? { leftPercent: 35, topPercent: 44 + jitter }
        : { leftPercent: 65, topPercent: 44 + jitter };
    }

    const slots: SlideBubbleAnchor[] = [
      { leftPercent: 31, topPercent: 45 + jitter },
      { leftPercent: 50, topPercent: 42 + jitter },
      { leftPercent: 69, topPercent: 45 + jitter }
    ];
    return slots[Math.max(0, Math.min(index, slots.length - 1))];
  }

  private dialogueVerticalJitter(seedText: string): number {
    const normalized = seedText.trim().toLowerCase();
    if (!normalized) {
      return 0;
    }

    let hash = 0;
    for (let i = 0; i < normalized.length; i += 1) {
      hash = (hash * 31 + normalized.charCodeAt(i)) % 1000;
    }

    return (hash / 1000) * 4 - 2;
  }

  private dialogueLine(entry: RagSlideDialog): DialogueEntry {
    const id = this.toNullableFiniteNumber(entry.id);
    const character =
      typeof entry.speakerCharacterName === 'string' ? entry.speakerCharacterName.trim() : '';
    const gender = typeof entry.speakerGender === 'string' ? entry.speakerGender.trim().toLowerCase() : '';
    const line = typeof entry.dialogLine === 'string' ? entry.dialogLine.trim() : '';
    const context = typeof entry.context === 'string' ? entry.context.trim() : '';
    if (character && line) {
      return { id, character, gender, line, text: `${character}: ${line}`, context };
    }
    return { id, character: '', gender, line, text: line, context };
  }

  private toDialogueEntries(response: RagSlideDialogsResponse): DialogueEntry[] {
    const dialogs = Array.isArray(response.dialogs) ? response.dialogs : [];
    return dialogs
      .slice()
      .sort((a, b) => this.toNonNegativeInteger(a.dialogOrder) - this.toNonNegativeInteger(b.dialogOrder))
      .map((entry) => this.dialogueLine(entry))
      .filter((entry) => entry.text.length > 0);
  }

  private cardTextForTts(item: RagComicSlide): string {
    const main = this.mainNote(item).trim();
    const lines = this.dialogueEntries(item)
      .map((entry) => entry.text)
      .filter((entry) => entry.length > 0);
    const prompt = (item.comicNote?.imagePrompt ?? '').trim();

    if (!main && !lines.length) {
      return prompt;
    }
    if (!lines.length) {
      return main;
    }
    return [main, ...lines].join('\n').trim() || prompt;
  }

  private cardSegmentsForTts(item: RagComicSlide): TtsSegment[] {
    const segments: TtsSegment[] = [];
    let wordStart = 0;

    const main = this.mainNote(item).trim();
    const slideEntityId = this.toNullableFiniteNumber(item.id) ?? this.toNullableFiniteNumber(item.comicNote?.id);
    if (main) {
      wordStart = this.pushSentenceSegments(segments, {
        kind: 'narration',
        text: main,
        wordStart,
        entityId: slideEntityId ?? undefined
      });
    }

    for (const entry of this.dialogueEntries(item)) {
      if (!entry.text) {
        continue;
      }
      wordStart = this.pushSentenceSegments(segments, {
        kind: 'dialogue',
        text: entry.line || entry.text,
        wordStart,
        entityId: entry.id ?? undefined,
        character: entry.character,
        line: entry.line || entry.text
      });
      if (entry.context) {
        wordStart = this.pushSentenceSegments(segments, {
          kind: 'context',
          text: entry.context,
          wordStart
        });
      }
    }

    if (!segments.length) {
      const fallback = this.cardTextForTts(item);
      if (fallback) {
        this.pushSentenceSegments(segments, {
          kind: 'narration',
          text: fallback,
          wordStart: 0
        });
      }
    }

    return segments;
  }

  private pushSentenceSegments(
    target: TtsSegment[],
    base: Omit<TtsSegment, 'wordCount'>
  ): number {
    let nextWordStart = base.wordStart;
    const sentences = this.splitTextIntoSentences(base.text);

    for (const sentence of sentences) {
      const wordCount = this.countWords(sentence);
      if (!wordCount) {
        continue;
      }
      target.push({
        ...base,
        text: sentence,
        line: base.kind === 'dialogue' ? sentence : base.line,
        wordStart: nextWordStart,
        wordCount
      });
      nextWordStart += wordCount;
    }

    return nextWordStart;
  }

  private splitTextIntoSentences(text: string): string[] {
    const trimmed = text.trim();
    if (!trimmed) {
      return [];
    }

    if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
      const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });
      return Array.from(segmenter.segment(trimmed), (segment) => segment.segment.trim()).filter(Boolean);
    }

    const matches = trimmed.match(/[^.!?]+(?:[.!?]+|$)/g);
    return (matches ?? [trimmed]).map((part) => part.trim()).filter(Boolean);
  }

  private learningCardKey(index: number): string {
    return `learning-${index}`;
  }

  private learningTextForTts(item: RagLearnSlide): string {
    return this.learningSummaryPlainText(item);
  }

  private learningSegmentsForTts(item: RagLearnSlide): TtsSegment[] {
    const segments: TtsSegment[] = [];
    const summary = this.learningTextForTts(item);

    if (summary) {
      this.pushSentenceSegments(segments, {
        kind: 'narration',
        text: summary,
        wordStart: 0
      });
    }

    return segments;
  }

  private async playCardTts(item: RagComicSlide, index: number): Promise<void> {
    const key = this.cardKey(item, index);
    this.playingCardKey.set(key);
    this.ttsMessage.set('');
    this.activeHeadCardKey.set('');
    this.activeDialogueCardKey.set('');
    this.activeDialogueCharacter.set('');
    this.activeDialogueLine.set('');
    this.activeContextLine.set('');
    this.activeVisualMode.set('none');

    if (!this.audio) {
      this.ttsMessage.set('Audio playback is only available in the browser.');
      return;
    }
    await this.ensureAudioUnlocked();
    await this.ensureSlideDialogsLoaded(item);

    const segments = this.cardSegmentsForTts(item);
    if (!segments.length) {
      this.ttsMessage.set('No text available for TTS on this card.');
      return;
    }

    this.stopCardTts();
    const token = ++this.playbackToken;
    this.playingCardKey.set(key);
    this.ttsLoading.set(true);
    this.ttsPlaying.set(true);
    this.ttsCurrentWord.set(-1);
    this.ttsTotalWords.set(segments.reduce((sum, segment) => sum + segment.wordCount, 0));
    const segmentAudioPromises = new Map<number, Promise<Blob>>();
    let nextSegmentToRequest = 0;

    const queueSegmentAudio = (segmentIndex: number): Promise<Blob> | null => {
      if (segmentIndex < 0 || segmentIndex >= segments.length) {
        return null;
      }
      const existing = segmentAudioPromises.get(segmentIndex);
      if (existing) {
        return existing;
      }
      const promise = this.requestTtsSegmentAudio(segments[segmentIndex]);
      segmentAudioPromises.set(segmentIndex, promise);
      return promise;
    };

    const fillSegmentAudioQueue = (): void => {
      while (
        token === this.playbackToken &&
        nextSegmentToRequest < segments.length &&
        segmentAudioPromises.size < PipelineComponent.ttsPrefetchConcurrency
      ) {
        queueSegmentAudio(nextSegmentToRequest);
        nextSegmentToRequest += 1;
      }
    };

    try {
      fillSegmentAudioQueue();

      for (let i = 0; i < segments.length; i += 1) {
        if (token !== this.playbackToken) {
          return;
        }
        fillSegmentAudioQueue();
        const segment = segments[i];
        if (segment.kind === 'dialogue') {
          this.activeDialogueCardKey.set(key);
          this.activeDialogueCharacter.set(segment.character ?? '');
          this.activeDialogueLine.set(segment.line ?? segment.text);
          this.activeDialogueWordStart.set(segment.wordStart);
          this.activeVisualMode.set('dialogue');
          this.activeHeadCardKey.set('');
          this.activeContextLine.set('');
          this.summaryHiddenCardKey.set(key);
        } else if (segment.kind === 'context') {
          this.activeDialogueCardKey.set(key);
          this.activeDialogueCharacter.set('');
          this.activeDialogueLine.set('');
          this.activeDialogueWordStart.set(segment.wordStart);
          this.activeHeadCardKey.set('');
          this.activeContextLine.set(segment.text);
          this.activeVisualMode.set('context');
        } else {
          this.activeDialogueCardKey.set('');
          this.activeDialogueCharacter.set('');
          this.activeDialogueLine.set('');
          this.activeContextLine.set('');
          this.activeDialogueWordStart.set(0);
          this.activeVisualMode.set('none');
        }
        const queuedBlobPromise = queueSegmentAudio(i);
        if (!queuedBlobPromise) {
          throw new Error('Missing audio queue entry.');
        }
        const blob = await queuedBlobPromise;
        if (!blob.size) {
          throw new Error('API returned empty audio content.');
        }
        if (token !== this.playbackToken) {
          return;
        }
        segmentAudioPromises.delete(i);
        fillSegmentAudioQueue();

        this.clearObjectUrl();
        this.currentObjectUrl = URL.createObjectURL(blob);
        this.audio.src = this.currentObjectUrl;
        this.ttsCurrentWord.set(segment.wordStart);
        this.audio.ontimeupdate = () => {
          if (!this.audio) {
            return;
          }
          const duration =
            Number.isFinite(this.audio.duration) && this.audio.duration > 0 ? this.audio.duration : 0;
          if (duration <= 0 || segment.wordCount <= 0) {
            return;
          }
          const adjustedTime = this.audio.currentTime + PipelineComponent.highlightLeadSeconds;
          const ratio = Math.min(1, Math.max(0, adjustedTime / duration));
          const localWordIndex = Math.min(segment.wordCount - 1, Math.floor(ratio * segment.wordCount));
          this.ttsCurrentWord.set(segment.wordStart + localWordIndex);
        };

        this.ttsLoading.set(false);
        await this.audio.play();
        await this.waitForSegmentEnd(token);
      }

      if (token === this.playbackToken) {
        this.ttsPlaying.set(false);
        this.activeDialogueCardKey.set('');
        this.activeDialogueCharacter.set('');
        this.activeDialogueLine.set('');
        this.activeContextLine.set('');
        this.activeVisualMode.set('none');
        this.activeDialogueWordStart.set(0);
        this.activeHeadCardKey.set('');
        this.ttsCurrentWord.set(-1);
        this.ttsTotalWords.set(0);

        if (this.autoPlayEnabled()) {
          const nextIndex = index + 1;
          if (nextIndex < this.slides().length) {
            this.goToSlide(nextIndex);
          }
        }
      }
    } catch (err) {
      console.error('[Pipeline TTS] Playback failed', err);
      this.ttsMessage.set(`TTS playback failed: ${this.readApiError(err)}`);
      this.ttsLoading.set(false);
      this.ttsPlaying.set(false);
      this.activeDialogueCardKey.set('');
      this.activeDialogueCharacter.set('');
      this.activeDialogueLine.set('');
      this.activeContextLine.set('');
      this.activeVisualMode.set('none');
      this.activeDialogueWordStart.set(0);
      this.activeHeadCardKey.set('');
      this.ttsCurrentWord.set(-1);
      this.ttsTotalWords.set(0);
    }
  }

  private async playLearningCardTts(item: RagLearnSlide, index: number): Promise<void> {
    const key = this.learningCardKey(index);
    this.playingCardKey.set(key);
    this.ttsMessage.set('');
    this.activeHeadCardKey.set('');
    this.activeDialogueCardKey.set('');
    this.activeDialogueCharacter.set('');
    this.activeDialogueLine.set('');
    this.activeContextLine.set('');
    this.activeVisualMode.set('none');

    if (!this.audio) {
      this.ttsMessage.set('Audio playback is only available in the browser.');
      return;
    }

    await this.ensureAudioUnlocked();
    const segments = this.learningSegmentsForTts(item);
    if (!segments.length) {
      this.ttsMessage.set('No text available for TTS on this card.');
      return;
    }

    this.stopCardTts();
    const token = ++this.playbackToken;
    this.playingCardKey.set(key);
    this.ttsLoading.set(true);
    this.ttsPlaying.set(true);
    this.ttsCurrentWord.set(-1);
    this.ttsTotalWords.set(segments.reduce((sum, segment) => sum + segment.wordCount, 0));
    const segmentAudioPromises = new Map<number, Promise<Blob>>();
    let nextSegmentToRequest = 0;

    const queueSegmentAudio = (segmentIndex: number): Promise<Blob> | null => {
      if (segmentIndex < 0 || segmentIndex >= segments.length) {
        return null;
      }
      const existing = segmentAudioPromises.get(segmentIndex);
      if (existing) {
        return existing;
      }
      const promise = this.requestTtsSegmentAudio(segments[segmentIndex]);
      segmentAudioPromises.set(segmentIndex, promise);
      return promise;
    };

    const fillSegmentAudioQueue = (): void => {
      while (
        token === this.playbackToken &&
        nextSegmentToRequest < segments.length &&
        segmentAudioPromises.size < PipelineComponent.ttsPrefetchConcurrency
      ) {
        queueSegmentAudio(nextSegmentToRequest);
        nextSegmentToRequest += 1;
      }
    };

    try {
      fillSegmentAudioQueue();

      for (let i = 0; i < segments.length; i += 1) {
        if (token !== this.playbackToken) {
          return;
        }

        fillSegmentAudioQueue();
        const segment = segments[i];
        const queuedBlobPromise = queueSegmentAudio(i);
        if (!queuedBlobPromise) {
          throw new Error('Missing audio queue entry.');
        }
        const blob = await queuedBlobPromise;
        if (!blob.size) {
          throw new Error('API returned empty audio content.');
        }
        if (token !== this.playbackToken) {
          return;
        }
        segmentAudioPromises.delete(i);
        fillSegmentAudioQueue();

        this.clearObjectUrl();
        this.currentObjectUrl = URL.createObjectURL(blob);
        this.audio.src = this.currentObjectUrl;
        this.ttsCurrentWord.set(segment.wordStart);
        this.audio.ontimeupdate = () => {
          if (!this.audio) {
            return;
          }
          const duration =
            Number.isFinite(this.audio.duration) && this.audio.duration > 0 ? this.audio.duration : 0;
          if (duration <= 0 || segment.wordCount <= 0) {
            return;
          }
          const adjustedTime = this.audio.currentTime + PipelineComponent.highlightLeadSeconds;
          const ratio = Math.min(1, Math.max(0, adjustedTime / duration));
          const localWordIndex = Math.min(segment.wordCount - 1, Math.floor(ratio * segment.wordCount));
          this.ttsCurrentWord.set(segment.wordStart + localWordIndex);
        };

        this.ttsLoading.set(false);
        await this.audio.play();
        await this.waitForSegmentEnd(token);
      }

      if (token === this.playbackToken) {
        this.ttsPlaying.set(false);
        this.ttsCurrentWord.set(-1);
        this.ttsTotalWords.set(0);

        if (this.autoPlayEnabled()) {
          const nextIndex = index + 1;
          if (nextIndex < this.learningSlides().length) {
            this.goToSlide(nextIndex);
          }
        }
      }
    } catch (err) {
      console.error('[Pipeline TTS] Learning playback failed', err);
      this.ttsMessage.set(`TTS playback failed: ${this.readApiError(err)}`);
      this.ttsLoading.set(false);
      this.ttsPlaying.set(false);
      this.ttsCurrentWord.set(-1);
      this.ttsTotalWords.set(0);
    }
  }

  private stopCardTts(): void {
    this.playbackToken += 1;
    this.cancelPendingTtsRequests();
    if (this.onSegmentEnd) {
      this.onSegmentEnd();
      this.onSegmentEnd = null;
    }
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio.src = '';
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.ontimeupdate = null;
    }
    this.playingCardKey.set('');
    this.ttsPlaying.set(false);
    this.ttsLoading.set(false);
    this.activeDialogueCardKey.set('');
    this.activeDialogueCharacter.set('');
    this.activeDialogueLine.set('');
    this.activeContextLine.set('');
    this.activeVisualMode.set('none');
    this.activeDialogueWordStart.set(0);
    this.activeHeadCardKey.set('');
    this.ttsCurrentWord.set(-1);
    this.ttsTotalWords.set(0);
  }

  private cancelPendingTtsRequests(): void {
    for (const subscription of this.pendingTtsRequests) {
      subscription.unsubscribe();
    }
    this.pendingTtsRequests.clear();
  }

  private async ensureSlideHeadsLoaded(item: RagComicSlide, index: number): Promise<void> {
    const key = this.cardKey(item, index);
    if (this.slideHeadsByCardKey()[key] || this.slideHeadsLoadingByCardKey()[key]) {
      return;
    }

    const docKey = this.docKey().trim();
    const slideId = this.toNullableFiniteNumber(item.id);
    if (!docKey || slideId === null) {
      return;
    }

    this.slideHeadsLoadingByCardKey.update((current) => ({ ...current, [key]: true }));

    try {
      const response = await firstValueFrom(this.ragApi.getSlideHeads(docKey, slideId));
      const markers = this.toSlideHeadMarkers(response);
      this.logSlideHeadMarkers(docKey, slideId, markers);
      this.slideHeadsByCardKey.update((current) => ({
        ...current,
        [key]: markers
      }));
    } catch (err) {
      console.warn('[Pipeline] Backend slide-head fetch failed', err);
      this.slideHeadsByCardKey.update((current) => ({ ...current, [key]: [] }));
    } finally {
      this.slideHeadsLoadingByCardKey.update((current) => ({ ...current, [key]: false }));
    }
  }

  private async ensureSlideDialogsLoaded(item: RagComicSlide): Promise<void> {
    const docKey = this.docKey().trim();
    const slideId = this.toNullableFiniteNumber(item.id);
    if (!docKey || slideId === null) {
      return;
    }

    if (this.slideDialogsById()[slideId] || this.slideDialogsLoadingById()[slideId]) {
      return;
    }

    this.slideDialogsLoadingById.update((current) => ({ ...current, [slideId]: true }));
    this.slideDialogsErrorById.update((current) => ({ ...current, [slideId]: '' }));

    try {
      const response = await firstValueFrom(
        this.ragApi.getSlideDialogs(docKey, slideId, this.selectedLanguage())
      );
      const entries = this.toDialogueEntries(response);
      this.slideDialogsById.update((current) => ({ ...current, [slideId]: entries }));
    } catch (err) {
      this.slideDialogsById.update((current) => ({ ...current, [slideId]: [] }));
      this.slideDialogsErrorById.update((current) => ({
        ...current,
        [slideId]: `Failed to load dialogs: ${this.readApiError(err)}`
      }));
    } finally {
      this.slideDialogsLoadingById.update((current) => ({ ...current, [slideId]: false }));
    }
  }

  private toSlideHeadMarkers(response: RagSlideHeadsResponse): SlideHeadMarker[] {
    const payload = this.parseSlideHeadsJson(response.json);
    if (!payload) {
      return [];
    }

    const imageWidth = this.toNullableFiniteNumber(payload.imageWidth);
    const imageHeight = this.toNullableFiniteNumber(payload.imageHeight);
    const characters = Array.isArray(payload.characters) ? payload.characters : [];

    return characters
      .map((entry) => this.toSlideHeadMarker(entry))
      .filter((entry): entry is SlideHeadMarker => entry !== null);
  }

  private parseSlideHeadsJson(rawJson: unknown): RagSlideHeadCoordinatesJson | null {
    if (typeof rawJson !== 'string' || !rawJson.trim()) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawJson) as unknown;
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      return parsed as RagSlideHeadCoordinatesJson;
    } catch (err) {
      console.warn('[Pipeline] Failed to parse slide-head JSON', err);
      return null;
    }
  }

  private toSlideHeadMarker(character: RagSlideHeadCharacter): SlideHeadMarker | null {
    const normalizedX =
      this.toUnitInterval(character.mouthNormalizedX) ?? this.toUnitInterval(character.normalizedX);
    const normalizedY =
      this.toUnitInterval(character.mouthNormalizedY) ?? this.toUnitInterval(character.normalizedY);

    const leftPercent =
      normalizedX !== null
        ? normalizedX * 100
        : null;
    const topPercent =
      normalizedY !== null
        ? normalizedY * 100
        : null;

    if (leftPercent === null || topPercent === null) {
      return null;
    }

    return {
      characterName: typeof character.characterName === 'string' ? character.characterName.trim() : '',
      leftPercent: Math.max(0, Math.min(100, leftPercent)),
      topPercent: Math.max(0, Math.min(100, topPercent))
    };
  }

  private logSlideHeadMarkers(docKey: string, slideId: number, markers: SlideHeadMarker[]): void {
    if (!markers.length) {
      console.info(`[Pipeline] No mouth positions found for doc "${docKey}" slide ${slideId}.`);
      return;
    }

    for (const marker of markers) {
      const name = marker.characterName || 'Unknown character';
      console.info(
        `[Pipeline] Mouth position found for ${name} on doc "${docKey}" slide ${slideId}: left=${marker.leftPercent.toFixed(2)}%, top=${marker.topPercent.toFixed(2)}%`
      );
    }
  }

  private findMarkerForCharacter(
    markers: SlideHeadMarker[],
    characterName: string
  ): SlideHeadMarker | null {
    if (!markers.length) {
      return null;
    }

    const normalizedCharacter = this.normalizeCharacterName(characterName);
    if (!normalizedCharacter) {
      return markers[0];
    }

    const exactMatch =
      markers.find((marker) => this.normalizeCharacterName(marker.characterName) === normalizedCharacter) ??
      null;
    if (exactMatch) {
      return exactMatch;
    }

    const partialMatch =
      markers.find((marker) => {
        const normalizedMarker = this.normalizeCharacterName(marker.characterName);
        return (
          normalizedMarker.length > 0 &&
          (normalizedMarker.includes(normalizedCharacter) ||
            normalizedCharacter.includes(normalizedMarker))
        );
      }) ?? null;
    if (partialMatch) {
      return partialMatch;
    }

    return markers.length === 1 ? markers[0] : null;
  }

  private normalizeCharacterName(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  private cloudConsoleSrc(uri: string): string {
    if (uri.startsWith('gs://')) {
      const noScheme = uri.substring(5);
      const slashIndex = noScheme.indexOf('/');
      if (slashIndex > 0) {
        const bucket = noScheme.slice(0, slashIndex);
        const objectPath = noScheme.slice(slashIndex + 1);
        return `https://storage.cloud.google.com/${bucket}/${objectPath}`;
      }
    }
    return uri;
  }

  private waitForSegmentEnd(expectedToken: number): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.audio) {
        resolve();
        return;
      }

      const finalize = () => {
        if (!this.audio) {
          resolve();
          return;
        }
        this.audio.onended = null;
        this.audio.onerror = null;
        this.onSegmentEnd = null;
        resolve();
      };

      this.onSegmentEnd = finalize;
      this.audio.onended = () => {
        if (expectedToken === this.playbackToken) {
          finalize();
          return;
        }
        finalize();
      };
      this.audio.onerror = () => finalize();
    });
  }

  private async requestTtsSegmentAudio(segment: TtsSegment): Promise<Blob> {
    const docKey = this.docKey().trim();
    return new Promise<Blob>((resolve, reject) => {
      const subscription = this.ttsApi
        .generateOpenAiTts({
          text: segment.text,
          characterName:
            segment.kind === 'dialogue'
              ? segment.character || PipelineComponent.narratorCharacterName
              : PipelineComponent.narratorCharacterName,
          languageCode: this.selectedLanguage() === 'ro' ? 'ro' : undefined,
          docKey: docKey || undefined,
          entityType: segment.kind === 'dialogue' ? 'dialog' : 'slide_summary',
          entityId: segment.entityId,
          speed: this.ttsSpeed(),
          expressiveness: segment.kind === 'dialogue' ? 'high' : undefined,
          format: 'mp3'
        })
        .subscribe({
          next: (blob) => {
            this.pendingTtsRequests.delete(subscription);
            resolve(blob);
          },
          error: (err) => {
            this.pendingTtsRequests.delete(subscription);
            reject(err);
          },
          complete: () => {
            this.pendingTtsRequests.delete(subscription);
          }
        });

      this.pendingTtsRequests.add(subscription);
    });
  }

  private async ensureAudioUnlocked(): Promise<void> {
    if (this.audioUnlocked || !this.audio) {
      return;
    }
    const previousSrc = this.audio.src;
    const previousMuted = this.audio.muted;
    try {
      this.audio.muted = true;
      this.audio.src = PipelineComponent.silentWavDataUrl;
      await this.audio.play();
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audioUnlocked = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('pointerdown', this.onFirstInteractionBound);
      }
    } catch {
      this.audioUnlocked = false;
    } finally {
      if (this.audio) {
        this.audio.pause();
        this.audio.currentTime = 0;
        this.audio.src = previousSrc;
        this.audio.muted = previousMuted;
      }
    }
  }

  private tokens(text: string): CardToken[] {
    const parts = text.split(/(\s+)/);
    const tokens: CardToken[] = [];
    let wordIndex = -1;

    for (const part of parts) {
      const isWord = part.trim().length > 0;
      if (isWord) {
        wordIndex += 1;
      }
      tokens.push({
        text: part,
        isWord,
        wordIndex
      });
    }
    return tokens;
  }

  private clearObjectUrl(): void {
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
  }

  private normalizeLearningSummaryMarkdown(summary: string): string {
    return summary
      .replace(/\r\n/g, '\n')
      .replace(/([:.;])\s+-\s+(?=(\*\*|[A-Z0-9]))/g, '$1\n- ')
      .replace(/\s+\n/g, '\n')
      .trim();
  }

  private askableExpressionButtonHtml(expression: string): string {
    const escapedExpression = this.escapeHtml(expression);
    const encodedExpression = encodeURIComponent(expression);
    return `<span class="askable-expression" data-ask-expression="${encodedExpression}" style="position:relative;display:inline-block;padding-right:3.25rem;margin-right:-3.25rem;"><strong class="askable-expression-label" style="font-weight:800;color:#0f3552;transition:background-color .14s ease;border-radius:.35rem;">${escapedExpression}</strong><button type="button" class="askable-expression-trigger" data-ask-expression="${encodedExpression}" aria-label="Ask what ${escapedExpression} means" style="position:absolute;right:0;top:50%;transform:translateY(-50%);border:0;border-radius:999px;padding:.18rem .5rem;background:#0f5fa8;color:#fff;font:700 .72rem/1 inherit;white-space:nowrap;cursor:pointer;box-shadow:0 .35rem .8rem rgba(15,95,168,.24);">Ask</button></span>`;
  }

  private escapeHtmlForMarkdown(summary: string): string {
    return summary.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private decodeAskExpression(value: string): string {
    try {
      return decodeURIComponent(value);
    } catch {
      return '';
    }
  }

  private findAskExpressionFromEvent(event: Event): string {
    const trigger = event
      .composedPath()
      .find(
        (entry): entry is HTMLElement =>
          entry instanceof HTMLElement &&
          entry.classList.contains('askable-expression-trigger') &&
          !!entry.dataset['askExpression']
      );

    return trigger?.dataset['askExpression'] ?? '';
  }

  private stripMarkdownForPlainText(summary: string): string {
    return summary
      .replace(/\r\n/g, '\n')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^\s{0,3}(?:[-*+]|\d+\.)\s+/gm, '')
      .replace(/^>\s?/gm, '')
      .replace(/[`*_~#]/g, '')
      .replace(/\n{2,}/g, ' ')
      .replace(/\s*\n\s*/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private readApiError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const payload = err.error;
      if (typeof payload === 'string' && payload.trim()) {
        return `${payload.trim()} (HTTP ${err.status})`;
      }
      if (payload && typeof payload === 'object') {
        const data = payload as Record<string, unknown>;
        const message = data['message'] ?? data['error'] ?? data['detail'];
        if (typeof message === 'string' && message.trim()) {
          return `${message.trim()} (HTTP ${err.status})`;
        }
      }
      return `HTTP ${err.status}`;
    }
    if (err instanceof Error && err.message) {
      return err.message;
    }
    return 'unknown error';
  }

  private countWords(text: string): number {
    const matches = text.trim().match(/\S+/g);
    return matches ? matches.length : 0;
  }

  private toNonNegativeInteger(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return Math.floor(value);
    }
    return 0;
  }

  private toNullableFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    return null;
  }

  private toUnitInterval(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1) {
      return value;
    }
    return null;
  }

  private toDocumentMode(value: string): RagIngestMode | null {
    switch (value) {
      case 'Story Mode':
      case 'Learning Mode':
      case 'Action Mode':
      case 'Extraction Mode':
        return value;
      default:
        return null;
    }
  }

  private normalizeLanguage(value: string): string {
    return value.trim().toLowerCase() === 'ro' ? 'ro' : PipelineComponent.defaultLanguage;
  }
}
