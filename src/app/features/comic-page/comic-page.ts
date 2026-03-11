import {
  CUSTOM_ELEMENTS_SCHEMA,
  Component,
  ElementRef,
  ViewChild,
  signal
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DocumentChatComponent } from '../document-chat';
import {
  RagApiService,
  RagComicSlide,
  RagComicSlidesWithImagesResponse
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
  line: string;
  text: string;
}

interface TtsSegment {
  kind: 'narration' | 'dialogue';
  text: string;
  voice: string;
  wordStart: number;
  wordCount: number;
  character?: string;
  line?: string;
}

interface VoiceOption {
  voice: string;
  gender: string;
}

@Component({
  selector: 'app-comic-page',
  imports: [RouterLink, DocumentChatComponent],
  templateUrl: './comic-page.html',
  styleUrl: './comic-page.scss',
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class ComicPageComponent {
  private static readonly fallbackVoices = ['alloy', 'echo', 'shimmer', 'sage', 'ash', 'coral'];
  private static readonly fallbackMasculineVoices = ['ash', 'echo', 'sage', 'onyx'];
  private static readonly highlightLeadSeconds = 1;
  private static readonly silentWavDataUrl =
    'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';
  docKey = signal('');
  loading = signal(false);
  message = signal('');
  ttsMessage = signal('');
  ttsLoading = signal(false);
  ttsPlaying = signal(false);
  playingCardKey = signal('');
  subtitleCardKey = signal('');
  subtitleCharacter = signal('');
  subtitleLine = signal('');
  ttsCurrentWord = signal(-1);
  ttsTotalWords = signal(0);
  currentSlide = signal(0);
  askOpen = signal(false);
  availableVoices = signal<string[]>([]);
  masculineVoices = signal<string[]>([]);
  pages = signal<RagComicSlidesWithImagesResponse | null>(null);
  private readonly dialogueVisibleMap = signal<Record<string, true>>({});
  private readonly failedUriMap = signal<Record<string, true>>({});
  @ViewChild('carouselEl') private carouselElement?: ElementRef<{
    swiper?: { activeIndex?: number; realIndex?: number; slideTo?: (index: number) => void };
  }>;

  private audio: HTMLAudioElement | null = null;
  private currentObjectUrl: string | null = null;
  private playbackToken = 0;
  private onSegmentEnd: (() => void) | null = null;
  private readonly characterVoiceMap = new Map<string, string>();
  private characterVoiceCursor = 0;
  private audioUnlocked = false;
  private readonly onFirstInteractionBound = () => {
    void this.ensureAudioUnlocked();
  };

  constructor(
    private readonly route: ActivatedRoute,
    private readonly ragApi: RagApiService,
    private readonly ttsApi: TtsApiService
  ) {
    if (typeof window !== 'undefined') {
      this.audio = new Audio();
      window.addEventListener('pointerdown', this.onFirstInteractionBound, { passive: true });
    }
    void this.loadVoices();

    this.route.paramMap.subscribe((params) => {
      this.docKey.set(params.get('docKey') ?? '');
      this.loading.set(false);
      this.message.set('');
      this.ttsMessage.set('');
      this.ttsLoading.set(false);
      this.ttsPlaying.set(false);
      this.playingCardKey.set('');
      this.subtitleCardKey.set('');
      this.subtitleCharacter.set('');
      this.subtitleLine.set('');
      this.ttsCurrentWord.set(-1);
      this.ttsTotalWords.set(0);
      this.currentSlide.set(0);
      this.askOpen.set(false);
      this.dialogueVisibleMap.set({});
      this.characterVoiceMap.clear();
      this.characterVoiceCursor = 0;
      this.pages.set(null);
      this.failedUriMap.set({});
      this.stopCardTts();
      this.loadComicPages();
    });
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this.onFirstInteractionBound);
    }
    this.stopCardTts();
    this.clearObjectUrl();
  }

  items(): RagComicSlide[] {
    const all = this.pages()?.slides;
    return Array.isArray(all) ? all : [];
  }

  firstImageUri(item: RagComicSlide): string {
    const uris = this.imageUris(item);
    return uris[0] ?? '';
  }

  imageUris(item: RagComicSlide): string[] {
    const uris = item.imageUrls;
    return Array.isArray(uris) ? uris : [];
  }

  mainNote(item: RagComicSlide): string {
    const narration = typeof item.naration === 'string' ? item.naration.trim() : '';
    if (narration) {
      return narration;
    }
    const prompt = typeof item.comicNote?.imagePrompt === 'string' ? item.comicNote.imagePrompt.trim() : '';
    return prompt || 'No narration.';
  }

  dialogue(item: RagComicSlide): string[] {
    return this.dialogueEntries(item).map((entry) => entry.text).filter((entry) => entry.length > 0);
  }

  private dialogueEntries(item: RagComicSlide): DialogueEntry[] {
    const segments = Array.isArray(item.comicNote?.segments) ? item.comicNote.segments : [];
    return segments
      .flatMap((segment) => (Array.isArray(segment.dialogue) ? segment.dialogue : []))
      .map((entry) => this.dialogueLine(entry))
      .filter((entry) => entry.text.length > 0);
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

  isCardPlaying(item: RagComicSlide, index: number): boolean {
    return this.ttsPlaying() && this.playingCardKey() === this.cardKey(item, index);
  }

  toggleCardTts(item: RagComicSlide, index: number): void {
    if (this.isCardPlaying(item, index)) {
      this.stopCardTts();
      return;
    }
    void this.playCardTts(item, index);
  }

  isCardLoading(item: RagComicSlide, index: number): boolean {
    return this.ttsLoading() && this.playingCardKey() === this.cardKey(item, index);
  }

  onSlideIndexChange(event: Event): void {
    const target = event.target as { swiper?: { activeIndex?: number; realIndex?: number } } | null;
    const rawIndex = target?.swiper?.realIndex ?? target?.swiper?.activeIndex;
    if (typeof rawIndex !== 'number' || !Number.isFinite(rawIndex)) {
      return;
    }
    this.currentSlide.set(Math.max(0, Math.floor(rawIndex)));
  }

  goToSlide(index: number): void {
    const items = this.items();
    if (index < 0 || index >= items.length) {
      return;
    }
    const swiper = this.carouselElement?.nativeElement?.swiper;
    if (swiper?.slideTo) {
      swiper.slideTo(index);
      this.currentSlide.set(index);
    }
  }

  isSubtitleVisible(item: RagComicSlide, index: number): boolean {
    return this.subtitleLine().length > 0 && this.subtitleCardKey() === this.cardKey(item, index);
  }

  shouldShowDialogue(item: RagComicSlide, index: number): boolean {
    return Boolean(this.dialogueVisibleMap()[this.cardKey(item, index)]);
  }

  async playCardTts(item: RagComicSlide, index: number): Promise<void> {
    const key = this.cardKey(item, index);
    this.playingCardKey.set(key);
    this.ttsMessage.set('');
    this.dialogueVisibleMap.update((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });

    const segments = this.cardSegmentsForTts(item);
    if (!segments.length) {
      this.ttsMessage.set('No text available for TTS on this card.');
      return;
    }

    if (!this.audio) {
      this.ttsMessage.set('Audio playback is only available in the browser.');
      return;
    }
    await this.ensureAudioUnlocked();

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
          this.subtitleCardKey.set(key);
          this.subtitleCharacter.set(segment.character ?? '');
          this.subtitleLine.set(segment.line ?? segment.text);
        } else {
          this.subtitleCardKey.set('');
          this.subtitleCharacter.set('');
          this.subtitleLine.set('');
        }
        const blob = await firstValueFrom(this.ttsApi.openAiVoice(segment.text, segment.voice));
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
          const adjustedTime = this.audio.currentTime + ComicPageComponent.highlightLeadSeconds;
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
        this.subtitleCardKey.set('');
        this.subtitleCharacter.set('');
        this.subtitleLine.set('');
        this.dialogueVisibleMap.update((current) => ({ ...current, [key]: true }));
        this.ttsCurrentWord.set(-1);
        this.ttsTotalWords.set(0);
      }
    } catch (err) {
      console.error('[Comic TTS] Playback failed', err);
      this.ttsMessage.set(`TTS playback failed: ${this.readApiError(err)}`);
      this.ttsLoading.set(false);
      this.ttsPlaying.set(false);
      this.subtitleCardKey.set('');
      this.subtitleCharacter.set('');
      this.subtitleLine.set('');
      this.ttsCurrentWord.set(-1);
      this.ttsTotalWords.set(0);
    }
  }

  stopCardTts(): void {
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
    this.subtitleCardKey.set('');
    this.subtitleCharacter.set('');
    this.subtitleLine.set('');
    this.ttsCurrentWord.set(-1);
    this.ttsTotalWords.set(0);
  }

  mainNoteTokens(item: RagComicSlide): CardToken[] {
    return this.tokens(this.mainNote(item));
  }

  dialogueTokens(line: string): CardToken[] {
    return this.tokens(line);
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

  dialogueWordOffset(item: RagComicSlide, lineIndex: number): number {
    const lines = this.dialogue(item);
    const priorDialogueWords = lines
      .slice(0, lineIndex)
      .reduce((sum, line) => sum + this.countWords(line), 0);
    return this.mainWordCount(item) + priorDialogueWords;
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

  private loadComicPages(): void {
    const key = this.docKey().trim();
    if (!key) {
      this.message.set('Missing docKey.');
      this.pages.set(null);
      return;
    }

    this.loading.set(true);
    this.message.set('');
    this.pages.set(null);
    this.failedUriMap.set({});

    this.ragApi.getComicSlidesWithImages(key).subscribe({
      next: (response) => {
        this.pages.set(response);
        const items = this.items();
        if (!items.length) {
          this.message.set('No comic slides were returned.');
        }
        this.loading.set(false);
      },
      error: (err) => {
        const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
        const backendMessage =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
        this.message.set(`Failed to load comic slides (${status}): ${backendMessage}`);
        this.loading.set(false);
      }
    });
  }

  private dialogueLine(entry: unknown): DialogueEntry {
    if (!entry || typeof entry !== 'object') {
      return { character: '', line: '', text: '' };
    }
    const asRecord = entry as Record<string, unknown>;
    const character = typeof asRecord['character'] === 'string' ? asRecord['character'].trim() : '';
    const line = typeof asRecord['line'] === 'string' ? asRecord['line'].trim() : '';
    if (character && line) {
      return { character, line, text: `${character}: ${line}` };
    }
    return { character: '', line, text: line };
  }

  private cardTextForTts(item: RagComicSlide): string {
    const main = this.mainNote(item).trim();
    const lines = this.dialogue(item);
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
      const wordCount = this.countWords(main);
      segments.push({
        kind: 'narration',
        text: main,
        voice: this.narratorVoice(),
        wordStart,
        wordCount
      });
      wordStart += wordCount;
    }

    for (const entry of this.dialogueEntries(item)) {
      if (!entry.text) {
        continue;
      }
      const wordCount = this.countWords(entry.text);
      segments.push({
        kind: 'dialogue',
        text: entry.text,
        voice: this.voiceForCharacter(entry.character),
        wordStart,
        wordCount,
        character: entry.character,
        line: entry.line || entry.text
      });
      wordStart += wordCount;
    }

    if (!segments.length) {
      const fallback = this.cardTextForTts(item);
      if (fallback) {
        segments.push({
          kind: 'narration',
          text: fallback,
          voice: this.narratorVoice(),
          wordStart: 0,
          wordCount: this.countWords(fallback)
        });
      }
    }

    return segments;
  }

  private narratorVoice(): string {
    const voices = this.availableVoices();
    return voices[0] ?? ComicPageComponent.fallbackVoices[0];
  }

  private voiceForCharacter(character: string): string {
    const normalized = character.trim().toLowerCase();
    if (!normalized) {
      return this.narratorVoice();
    }

    const existing = this.characterVoiceMap.get(normalized);
    if (existing) {
      return existing;
    }

    const narrator = this.narratorVoice();
    const masculine = this.masculineVoices();
    const selectable = masculine.filter((voice) => voice !== narrator);
    const pool = selectable.length ? selectable : masculine;
    if (!pool.length) {
      return narrator;
    }

    const voice = pool[this.characterVoiceCursor % pool.length];
    this.characterVoiceCursor += 1;
    this.characterVoiceMap.set(normalized, voice);
    return voice;
  }

  private async loadVoices(): Promise<void> {
    try {
      const payload = await firstValueFrom(this.ttsApi.listOpenAiVoices());
      const normalized = this.normalizeVoices(payload);
      const all = normalized.all.length ? normalized.all : [...ComicPageComponent.fallbackVoices];
      const masculine = normalized.male.length
        ? normalized.male
        : ComicPageComponent.fallbackMasculineVoices.filter((voice) => all.includes(voice));

      this.availableVoices.set(all);
      this.masculineVoices.set(masculine.length ? masculine : [all[0]]);
    } catch {
      this.availableVoices.set([...ComicPageComponent.fallbackVoices]);
      this.masculineVoices.set([...ComicPageComponent.fallbackMasculineVoices]);
    }
  }

  private normalizeVoices(payload: unknown): { all: string[]; male: string[] } {
    const values = Array.isArray(payload)
      ? payload
      : payload &&
            typeof payload === 'object' &&
            Array.isArray((payload as Record<string, unknown>)['voices'])
        ? ((payload as Record<string, unknown>)['voices'] as unknown[])
        : [];

    const options: VoiceOption[] = [];
    for (const entry of values) {
      if (typeof entry === 'string' && entry.trim()) {
        options.push({ voice: entry.trim(), gender: '' });
        continue;
      }

      if (entry && typeof entry === 'object') {
        const record = entry as Record<string, unknown>;
        const charId = record['charId'];
        const voice = record['voice'];
        const id = record['id'];
        const gender = typeof record['gender'] === 'string' ? record['gender'].trim().toLowerCase() : '';
        if (typeof voice === 'string' && voice.trim()) {
          options.push({ voice: voice.trim(), gender });
        } else if (typeof charId === 'string' && charId.trim()) {
          options.push({ voice: charId.trim(), gender });
        } else if (typeof id === 'string' && id.trim()) {
          options.push({ voice: id.trim(), gender });
        }
      }
    }

    const all = Array.from(new Set(options.map((option) => option.voice)));
    const male = Array.from(
      new Set(
        options
          .filter((option) => option.gender === 'male' || option.gender === 'masculine')
          .map((option) => option.voice)
      )
    );
    return { all, male };
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
      this.audio.src = ComicPageComponent.silentWavDataUrl;
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
}
