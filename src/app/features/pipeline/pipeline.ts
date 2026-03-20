import {
  CUSTOM_ELEMENTS_SCHEMA,
  Component,
  ElementRef,
  ViewChild,
  signal
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { DocumentChatComponent } from '../document-chat';
import {
  RagApiService,
  RagComicBookGenerateResponse,
  RagComicSlide,
  RagSlideDialog,
  RagSlideDialogsResponse,
  RagSlideHeadCharacter,
  RagSlideHeadCoordinatesJson,
  RagSlideHeadsResponse
} from '../../core/api/rag-api.service';
import { TtsApiService } from '../../core/api/tts-api.service';
import { register } from 'swiper/element/bundle';
import { firstValueFrom } from 'rxjs';

register();

interface CardToken {
  text: string;
  isWord: boolean;
  wordIndex: number;
}

interface DialogueEntry {
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
  character?: string;
  line?: string;
}

interface ComicBatchState {
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

type ActiveVisualMode = 'none' | 'dialogue' | 'context';

@Component({
  selector: 'app-pipeline',
  imports: [DocumentChatComponent],
  templateUrl: './pipeline.html',
  styleUrl: './pipeline.scss',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class PipelineComponent {
  private static readonly charactersRefreshEvent = 'codex:characters-refresh';
  private static readonly comicBatchSize = 10;
  private static readonly comicBatchStateStorageKey = 'pipeline-comic-batch-state';
  private static readonly highlightLeadSeconds = 1;
  private static readonly dialogueSpeed = 1;
  private static readonly narratorCharacterName = 'Narrator';
  private static readonly silentWavDataUrl =
    'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';
  private audio: HTMLAudioElement | null = null;
  private currentObjectUrl: string | null = null;
  private playbackToken = 0;
  private onSegmentEnd: (() => void) | null = null;
  private audioUnlocked = false;
  private readonly failedUriMap = signal<Record<string, true>>({});
  private readonly onFirstInteractionBound = () => {
    void this.ensureAudioUnlocked();
  };

  docKey = signal('');
  loading = signal(false);
  clearing = signal(false);
  message = signal('');
  comicBatchStart = signal(0);
  comicBatchEnd = signal(PipelineComponent.comicBatchSize);
  showLoadMoreSlide = signal(false);
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
  currentSlide = signal(0);
  askOpen = signal(false);
  slides = signal<RagComicSlide[]>([]);
  slidesLoading = signal(false);
  slidesMessage = signal('');
  slidePromptById = signal<Record<number, string>>({});
  slidePromptLoadingById = signal<Record<number, boolean>>({});
  slidePromptErrorById = signal<Record<number, string>>({});
  slideDialogsById = signal<Record<number, DialogueEntry[]>>({});
  slideDialogsLoadingById = signal<Record<number, boolean>>({});
  slideDialogsErrorById = signal<Record<number, string>>({});
  slideHeadsByCardKey = signal<Record<string, SlideHeadMarker[]>>({});
  slideHeadsLoadingByCardKey = signal<Record<string, boolean>>({});
  activeHeadCardKey = signal('');
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
    private readonly ttsApi: TtsApiService
  ) {
    if (typeof window !== 'undefined') {
      this.audio = new Audio();
      window.addEventListener('pointerdown', this.onFirstInteractionBound, { passive: true });
    }

    this.route.paramMap.subscribe((params) => {
      const key = params.get('docKey') ?? '';
      this.docKey.set(key);
      this.loading.set(false);
      this.clearing.set(false);
      this.message.set('');
      const batchState = this.readComicBatchState(key);
      this.comicBatchStart.set(batchState?.start ?? 0);
      this.comicBatchEnd.set(batchState?.end ?? PipelineComponent.comicBatchSize);
      this.showLoadMoreSlide.set(batchState?.hasMore ?? false);
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
      this.slides.set([]);
      this.slidesLoading.set(false);
      this.slidesMessage.set('');
      this.slidePromptById.set({});
      this.slidePromptLoadingById.set({});
      this.slidePromptErrorById.set({});
      this.slideDialogsById.set({});
      this.slideDialogsLoadingById.set({});
      this.slideDialogsErrorById.set({});
      this.slideHeadsByCardKey.set({});
      this.slideHeadsLoadingByCardKey.set({});
      this.activeHeadCardKey.set('');
      this.failedUriMap.set({});
      this.stopCardTts();

      if (key.trim()) {
        this.loadSlides(key);
      }
    });
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this.onFirstInteractionBound);
    }
    this.stopCardTts();
    this.clearObjectUrl();
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

    this.loading.set(true);
    this.message.set('');
    this.comicBatchStart.set(0);
    this.comicBatchEnd.set(PipelineComponent.comicBatchSize);
    this.showLoadMoreSlide.set(false);
    this.writeComicBatchState(key, {
      start: 0,
      end: PipelineComponent.comicBatchSize,
      hasMore: false
    });
    this.generateAllBatch(key, 0, PipelineComponent.comicBatchSize);
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

    const nextStart = this.comicBatchEnd();
    const nextEnd = nextStart + PipelineComponent.comicBatchSize;
    this.generateAllBatch(key, nextStart, nextEnd);
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

  onSlideIndexChange(event: Event): void {
    const target = event.target as { swiper?: { activeIndex?: number; realIndex?: number } } | null;
    const rawIndex = target?.swiper?.realIndex ?? target?.swiper?.activeIndex;
    if (typeof rawIndex !== 'number' || !Number.isFinite(rawIndex)) {
      return;
    }
    const nextIndex = Math.max(0, Math.floor(rawIndex));
    this.currentSlide.set(nextIndex);
    this.summaryHiddenCardKey.set('');
    this.loadCurrentSlidePrompt();
    this.playCurrentSlideIfAutoPlayEnabled();
  }

  goToSlide(index: number): void {
    const items = this.slides();
    if (index < 0 || index >= items.length) {
      return;
    }
    const swiper = this.carouselElement?.nativeElement?.swiper;
    if (swiper?.slideTo) {
      swiper.slideTo(index);
      this.currentSlide.set(index);
      this.summaryHiddenCardKey.set('');
      this.loadCurrentSlidePrompt();
      this.playCurrentSlideIfAutoPlayEnabled();
    }
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

  isCardPlaying(item: RagComicSlide, index: number): boolean {
    const key = this.cardKey(item, index);
    return (
      (this.ttsPlaying() && this.playingCardKey() === key) ||
      (this.autoPlayEnabled() && this.currentSlideCardKey() === key)
    );
  }

  toggleCardTts(item: RagComicSlide, index: number): void {
    const key = this.cardKey(item, index);
    if (this.autoPlayEnabled() && this.currentSlideCardKey() === key) {
      this.autoPlayEnabled.set(false);
      this.stopCardTts();
      return;
    }
    this.autoPlayEnabled.set(true);
    void this.playCardTts(item, index);
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

    const anchor = this.dialogueBubbleAnchor(item, this.activeDialogueCharacter(), line);
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

  slidePromptText(slideId: number | null): string {
    if (slideId === null) {
      return '';
    }
    return this.slidePromptById()[slideId] ?? this.promptTextForSlideId(slideId);
  }

  slidePromptError(slideId: number | null): string {
    if (slideId === null) {
      return '';
    }
    return this.slidePromptErrorById()[slideId] ?? '';
  }

  isSlidePromptLoading(slideId: number | null): boolean {
    if (slideId === null) {
      return false;
    }
    return !!this.slidePromptLoadingById()[slideId];
  }

  currentSlidePromptId(): number | null {
    const slide = this.slides()[this.currentSlide()];
    return this.toNullableFiniteNumber(slide?.id);
  }

  currentSlideItem(): RagComicSlide | null {
    return this.slides()[this.currentSlide()] ?? null;
  }

  paginationIndexes(): number[] {
    return Array.from({ length: this.slides().length }, (_, index) => index);
  }

  private loadSlides(docKey: string): void {
    const preservedSlide = this.currentSlide();
    this.slidesLoading.set(true);
    this.slidesMessage.set('');
    this.failedUriMap.set({});

    this.ragApi.getComicSlidesWithImages(docKey).subscribe({
      next: (response) => {
        const nextSlides = Array.isArray(response.slides) ? response.slides : [];
        this.slides.set(nextSlides);
        this.syncSlidePrompts(nextSlides);
        this.slidesLoading.set(false);
        const nextIndex = this.clampSlideIndex(preservedSlide, nextSlides.length);
        this.currentSlide.set(nextIndex);
        this.syncSwiperSlide(nextIndex);
        this.loadCurrentSlidePrompt();
        void this.loadCurrentSlideDialogs();
      },
      error: (err) => {
        const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
        const backendMessage =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
        this.slides.set([]);
        this.slidesLoading.set(false);
        this.slidesMessage.set(`Failed to get slides (${status}): ${backendMessage}`);
      }
    });
  }

  private loadCurrentSlidePrompt(): void {
    const slideId = this.currentSlidePromptId();
    if (slideId === null) {
      return;
    }
    const promptText = this.promptTextForSlideId(slideId);
    this.slidePromptById.update((current) =>
      promptText ? { ...current, [slideId]: promptText } : current
    );
  }

  private async loadCurrentSlideDialogs(): Promise<void> {
    const slide = this.currentSlideItem();
    if (!slide) {
      return;
    }
    await this.ensureSlideDialogsLoaded(slide);
  }

  private generateAllBatch(docKey: string, start: number, end: number): void {
    this.loading.set(true);
    this.message.set('');

    this.ragApi.generateComicBookAll({ docKey, start, end }).subscribe({
      next: (response) => {
        const hasMore = this.shouldShowLoadMore(response, start, end);
        this.loading.set(false);
        this.comicBatchStart.set(start);
        this.comicBatchEnd.set(end);
        this.showLoadMoreSlide.set(hasMore);
        this.writeComicBatchState(docKey, { start, end, hasMore });
        this.message.set(`Generated slides for range ${start}-${end}.`);
        this.loadSlides(docKey);
        this.dispatchCharactersRefresh(docKey);
      },
      error: (err) => {
        const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
        const backendMessage =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
        this.loading.set(false);
        this.message.set(`Failed to generate all (${status}): ${backendMessage}`);
      }
    });
  }

  private shouldShowLoadMore(
    response: RagComicBookGenerateResponse,
    start: number,
    end: number
  ): boolean {
    if (response.isLastBatch === true) {
      return false;
    }

    const requestedChunks = Math.max(0, end - start);
    const processedChunks = this.toNonNegativeInteger(response.processedChunks);

    if (processedChunks === 0) {
      return false;
    }

    return processedChunks >= requestedChunks;
  }

  private clampSlideIndex(index: number, slideCount: number): number {
    const maxIndex = Math.max(0, slideCount - 1);
    return Math.max(0, Math.min(index, maxIndex));
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

  private dispatchCharactersRefresh(docKey: string): void {
    if (typeof window === 'undefined') {
      return;
    }
    window.dispatchEvent(new CustomEvent(PipelineComponent.charactersRefreshEvent, { detail: docKey }));
  }

  private readComicBatchState(docKey: string): ComicBatchState | null {
    if (!docKey || typeof window === 'undefined') {
      return null;
    }

    try {
      const rawValue = window.localStorage.getItem(PipelineComponent.comicBatchStateStorageKey);
      if (!rawValue) {
        return null;
      }

      const entries = JSON.parse(rawValue) as Record<string, ComicBatchState | undefined>;
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

  private writeComicBatchState(docKey: string, state: ComicBatchState): void {
    if (!docKey || typeof window === 'undefined') {
      return;
    }

    try {
      const rawValue = window.localStorage.getItem(PipelineComponent.comicBatchStateStorageKey);
      const entries = rawValue ? (JSON.parse(rawValue) as Record<string, ComicBatchState>) : {};
      entries[docKey] = state;
      window.localStorage.setItem(
        PipelineComponent.comicBatchStateStorageKey,
        JSON.stringify(entries)
      );
    } catch {
      // Ignore persistence failures and keep runtime state only.
    }
  }

  private resetSlideState(docKey: string): void {
    this.comicBatchStart.set(0);
    this.comicBatchEnd.set(PipelineComponent.comicBatchSize);
    this.showLoadMoreSlide.set(false);
    this.slides.set([]);
    this.slidesLoading.set(false);
    this.slidesMessage.set('');
    this.slidePromptById.set({});
    this.slidePromptLoadingById.set({});
    this.slidePromptErrorById.set({});
    this.slideDialogsById.set({});
    this.slideDialogsLoadingById.set({});
    this.slideDialogsErrorById.set({});
    this.slideHeadsByCardKey.set({});
    this.slideHeadsLoadingByCardKey.set({});
    this.activeHeadCardKey.set('');
    this.currentSlide.set(0);
    this.summaryHiddenCardKey.set('');
    this.failedUriMap.set({});
    this.stopCardTts();
    this.writeComicBatchState(docKey, {
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

  private syncSlidePrompts(slides: RagComicSlide[]): void {
    const nextPrompts = slides.reduce<Record<number, string>>((acc, slide) => {
      const slideId = this.toNullableFiniteNumber(slide.id);
      const promptText = this.promptTextForSlide(slide);
      if (slideId !== null && promptText) {
        acc[slideId] = promptText;
      }
      return acc;
    }, {});

    this.slidePromptById.set(nextPrompts);
    this.slidePromptLoadingById.set({});
    this.slidePromptErrorById.set({});
  }

  private promptTextForSlideId(slideId: number): string {
    const slide = this.slides().find((entry) => this.toNullableFiniteNumber(entry.id) === slideId);
    return slide ? this.promptTextForSlide(slide) : '';
  }

  private promptTextForSlide(slide: RagComicSlide): string {
    const directPrompt = typeof slide.promptTxt === 'string' ? slide.promptTxt.trim() : '';
    if (directPrompt) {
      return directPrompt;
    }

    const notePrompt = typeof slide.comicNote?.promptTxt === 'string' ? slide.comicNote.promptTxt.trim() : '';
    if (notePrompt) {
      return notePrompt;
    }

    return '';
  }

  private dialogueBubbleAnchor(
    item: RagComicSlide,
    characterName: string,
    line: string
  ): SlideBubbleAnchor | null {
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
    const character =
      typeof entry.speakerCharacterName === 'string' ? entry.speakerCharacterName.trim() : '';
    const gender = typeof entry.speakerGender === 'string' ? entry.speakerGender.trim().toLowerCase() : '';
    const line = typeof entry.dialogLine === 'string' ? entry.dialogLine.trim() : '';
    const context = typeof entry.context === 'string' ? entry.context.trim() : '';
    if (character && line) {
      return { character, gender, line, text: `${character}: ${line}`, context };
    }
    return { character: '', gender, line, text: line, context };
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
    if (main) {
      wordStart = this.pushSentenceSegments(segments, {
        kind: 'narration',
        text: main,
        wordStart
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
    this.ttsLoading.set(true);
    this.ttsPlaying.set(true);
    this.ttsCurrentWord.set(-1);
    this.ttsTotalWords.set(segments.reduce((sum, segment) => sum + segment.wordCount, 0));

    try {
      for (let i = 0; i < segments.length; i += 1) {
        if (token !== this.playbackToken) {
          return;
        }
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
        const blob = await firstValueFrom(
          this.ttsApi.generateOpenAiTts({
            text: segment.text,
            characterName:
              segment.kind === 'dialogue'
                ? segment.character || PipelineComponent.narratorCharacterName
                : PipelineComponent.narratorCharacterName,
            speed: segment.kind === 'dialogue' ? PipelineComponent.dialogueSpeed : undefined,
            expressiveness: segment.kind === 'dialogue' ? 'high' : undefined,
            format: 'wav'
          })
        );
        if (!blob.size) {
          throw new Error('API returned empty audio content.');
        }
        if (token !== this.playbackToken) {
          return;
        }

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

  private stopCardTts(): void {
    this.playbackToken += 1;
    if (this.onSegmentEnd) {
      this.onSegmentEnd();
      this.onSegmentEnd = null;
    }
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.ontimeupdate = null;
    }
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
      const response = await firstValueFrom(this.ragApi.getSlideDialogs(docKey, slideId));
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

  private async ensureAudioUnlocked(): Promise<void> {
    if (this.audioUnlocked || !this.audio) {
      return;
    }
    try {
      const previousSrc = this.audio.src;
      const previousMuted = this.audio.muted;
      this.audio.muted = true;
      this.audio.src = PipelineComponent.silentWavDataUrl;
      await this.audio.play();
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio.src = previousSrc;
      this.audio.muted = previousMuted;
      this.audioUnlocked = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('pointerdown', this.onFirstInteractionBound);
      }
    } catch {
      this.audioUnlocked = false;
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
}
