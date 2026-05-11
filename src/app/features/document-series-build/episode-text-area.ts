import { Component, ElementRef, NgZone, OnDestroy, ViewChild, computed, inject, input, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { RagSeriesEpisodeCharacterImage, RagSeriesEpisodeDialogueLine, RagSeriesEpisodeEventResponse } from '../../core/api/rag-api.service';
import { TtsApiService } from '../../core/api/tts-api.service';

export interface EpisodeTextAreaEpisode {
  id?: number | string;
  episodeId?: string;
  episode_id?: string;
  episodeTitle?: string;
  events?: RagSeriesEpisodeEventResponse[];
  selected_events?: RagSeriesEpisodeEventResponse[];
}

interface EpisodeWordToken {
  text: string;
  isWord: boolean;
  wordIndex: number;
  timingWeight: number;
}

interface EpisodeDialogLine {
  orderIndex: number;
  characterName: string;
  characterKey: string;
  normalizedCharacterName: string;
  text: string;
}

interface EpisodeCharacterRow {
  imageUrl: string;
  characterName: string;
  normalizedCharacterName: string;
  dialogs: EpisodeDialogLine[];
}

interface EpisodePlaybackSegment {
  kind: 'summary' | 'dialog';
  eventIndex: number;
  dialogOrderIndex: number;
  text: string;
  characterName: string;
  characterKey: string;
  timingUnits: number;
}

@Component({
  selector: 'app-episode-text-area',
  standalone: true,
  templateUrl: './episode-text-area.html',
  styleUrl: './episode-text-area.scss'
})
export class EpisodeTextAreaComponent implements OnDestroy {
  private static readonly narratorCharacterName = 'Narrator';
  private readonly ttsApi = inject(TtsApiService);
  private readonly ngZone = inject(NgZone);
  private audio: HTMLAudioElement | null = null;
  private currentAudioUrl: string | null = null;
  private ttsSubscription: Subscription | null = null;
  private playbackSessionId = 0;
  private audioInstanceId = 0;
  private lastScrolledWordIndex = -1;

  @ViewChild('scrollContainer') private scrollContainer?: ElementRef<HTMLDivElement>;

  readonly episodes = input<EpisodeTextAreaEpisode[]>([]);
  readonly selectedEpisodeId = signal<string | null>(null);
  readonly activeEventIndex = signal(0);
  readonly activeDisplayEvent = signal<RagSeriesEpisodeEventResponse | null>(null);
  readonly ttsLoading = signal(false);
  readonly ttsPlaying = signal(false);
  readonly ttsMessage = signal('');
  readonly activeTimingUnit = signal(-1);
  readonly activeDialogEventIndex = signal(-1);
  readonly activeDialogOrderIndex = signal(-1);
  readonly activeSegmentKind = signal<'summary' | 'dialog' | null>(null);

  readonly selectedEpisode = computed(() => {
    const allEpisodes = this.episodes();
    if (!allEpisodes.length) {
      return null;
    }
    const currentId = this.selectedEpisodeId();
    return allEpisodes.find((episode) => this.episodeIdentity(episode) === currentId) ?? allEpisodes[0];
  });

  readonly displayEventIndex = computed(() => {
    return this.activeEventIndex();
  });

  readonly displayEvent = computed(() => {
    const explicitEvent = this.activeDisplayEvent();
    if (explicitEvent) {
      return explicitEvent;
    }

    const episode = this.selectedEpisode();
    const events = this.normalizedEvents(episode);
    return events[this.displayEventIndex()] ?? events[0] ?? null;
  });

  readonly displayImageUrl = computed(() => {
    const event = this.displayEvent();
    const camelImageUrl = typeof event?.imageUrl === 'string' ? event.imageUrl.trim() : '';
    const snakeImageUrl = typeof event?.image_url === 'string' ? event.image_url.trim() : '';
    const imageUrl = camelImageUrl || snakeImageUrl;
    return typeof imageUrl === 'string' && imageUrl.trim().length ? imageUrl.trim() : null;
  });

  readonly displayCharacterImageUrls = computed(() => {
    const event = this.displayEvent();
    const camelUrls = Array.isArray(event?.characterImageUrls) ? event.characterImageUrls : [];
    const snakeUrls = Array.isArray(event?.character_image_urls) ? event.character_image_urls : [];
    const rawUrls = camelUrls.length ? camelUrls : snakeUrls;
    if (!rawUrls.length) {
      return [];
    }
    return rawUrls
      .filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
      .map((url) => url.trim());
  });

  episodeTitle(episode: EpisodeTextAreaEpisode): string {
    if (typeof episode.episodeTitle === 'string' && episode.episodeTitle.trim()) {
      return episode.episodeTitle.trim();
    }

    const raw = episode as Record<string, unknown>;
    return typeof raw['episode_title'] === 'string' && raw['episode_title'].trim()
      ? raw['episode_title'].trim()
      : 'Untitled episode';
  }

  eventSummaryText(event: RagSeriesEpisodeEventResponse): string {
    return this.eventSummary(event);
  }

  readonly displayCharacterRows = computed(() => {
    const event = this.displayEvent();
    if (!event) {
      return [];
    }

    const dialogs = this.normalizedEventDialogs(event);
    if (!dialogs.length) {
      return [];
    }

    const characterImages = this.normalizedCharacterImages(event);
    if (!characterImages.length) {
      return [];
    }

    const imageByName = new Map(
      characterImages.map((item) => [this.normalizedCharacterName(item.characterName), item.imageUrl])
    );

    const speakerNames = dialogs
      .map((dialog) => dialog.characterName.trim())
      .filter((name, index, values) => name.length > 0 && values.indexOf(name) === index);

    const rows: EpisodeCharacterRow[] = speakerNames.flatMap((name) => {
      const normalizedName = this.normalizedCharacterName(name);
      const imageUrl = imageByName.get(normalizedName)
        ?? this.findPartialSpeakerImage(characterImages, normalizedName);
      if (!imageUrl) {
        return [];
      }

      return {
        imageUrl,
        characterName: name,
        normalizedCharacterName: normalizedName,
        dialogs: []
      };
    });

    for (const dialog of dialogs) {
      const rowIndex = this.dialogRowIndex(rows, dialog);
      if (rowIndex >= 0) {
        rows[rowIndex].dialogs.push(dialog);
      }
    }

    return rows;
  });

  circleItemTransform(index: number, total: number): string {
    if (total <= 1) {
      return 'translate(-50%, -50%) translate(0, 0)';
    }

    const radius = total <= 2 ? 92 : total === 3 ? 102 : 112;
    const startAngle = -90;
    const angle = startAngle + (360 / total) * index;
    const radians = (angle * Math.PI) / 180;
    const x = Math.cos(radians) * radius;
    const y = Math.sin(radians) * radius;
    return `translate(-50%, -50%) translate(${x}px, ${y}px)`;
  }

  selectEpisode(episodeId: string): void {
    this.stopPlayback();
    this.selectedEpisodeId.set(episodeId);
    this.setActiveEvent(0);
  }

  episodeTrackId(episode: EpisodeTextAreaEpisode, index: number): string {
    return this.episodeIdentity(episode) || `episode-${index}`;
  }

  isEpisodeActive(episode: EpisodeTextAreaEpisode, index: number): boolean {
    const selected = this.selectedEpisode();
    if (!selected) {
      return false;
    }
    return this.episodeTrackId(selected, -1) === this.episodeTrackId(episode, index);
  }

  selectEvent(summaryIndex: number): void {
    if (summaryIndex < 0) {
      return;
    }
    this.setActiveEvent(summaryIndex);
  }

  ngOnDestroy(): void {
    this.stopPlayback();
  }

  episodeTokens(summary: string | null | undefined): EpisodeWordToken[] {
    const normalizedSummary = typeof summary === 'string' ? summary : '';
    let wordIndex = 0;
    return normalizedSummary.split(/(\s+)/).filter((token) => token.length > 0).map((token) => {
      if (/^\s+$/.test(token)) {
        return { text: token, isWord: false, wordIndex: -1, timingWeight: 0 };
      }

      const nextToken = {
        text: token,
        isWord: true,
        wordIndex,
        timingWeight: this.wordTimingWeight(token)
      };
      wordIndex += 1;
      return nextToken;
    });
  }

  isWordActive(wordIndex: number, offset: number, summary: string | null | undefined): boolean {
    if (wordIndex < 0) {
      return false;
    }
    const activeTimingUnit = this.activeTimingUnit();
    if (activeTimingUnit < 0) {
      return false;
    }
    const tokenRanges = this.wordRanges(summary);
    const range = tokenRanges[wordIndex];
    if (!range) {
      return false;
    }
    const start = offset + range.start;
    const endExclusive = start + range.weight;
    return activeTimingUnit >= start && activeTimingUnit < endExclusive;
  }

  isEventActive(summaryIndex: number): boolean {
    return this.displayEventIndex() === summaryIndex;
  }

  isDialogWordActive(
    eventIndex: number,
    event: RagSeriesEpisodeEventResponse,
    dialogOrderIndex: number,
    wordIndex: number,
    _characterName: string,
    text: string | null | undefined
  ): boolean {
    if (wordIndex < 0) {
      return false;
    }

    if (
      this.ttsPlaying()
      && this.activeSegmentKind() === 'dialog'
      && this.activeDialogEventIndex() === eventIndex
      && this.activeDialogOrderIndex() === dialogOrderIndex
    ) {
      return true;
    }

    const activeTimingUnit = this.activeTimingUnit();
    if (activeTimingUnit < 0) {
      return false;
    }

    const dialogOffset = this.dialogWordOffsetBefore(event, dialogOrderIndex);
    const tokenRanges = this.wordRanges(text);
    const range = tokenRanges[wordIndex];
    if (!range) {
      return false;
    }

    const start = this.wordOffsetBefore(eventIndex) + dialogOffset + range.start;
    const endExclusive = start + range.weight;
    return activeTimingUnit >= start && activeTimingUnit < endExclusive;
  }

  isDialogVisibleOnCharacter(
    eventIndex: number,
    _event: RagSeriesEpisodeEventResponse,
    dialog: EpisodeDialogLine
  ): boolean {
    return this.ttsPlaying()
      && this.activeSegmentKind() === 'dialog'
      && this.activeDialogEventIndex() === eventIndex
      && this.activeDialogOrderIndex() === dialog.orderIndex;
  }

  activeDialogForCharacterRow(eventIndex: number, row: EpisodeCharacterRow): EpisodeDialogLine | null {
    if (
      !this.ttsPlaying()
      || this.activeSegmentKind() !== 'dialog'
      || this.activeDialogEventIndex() !== eventIndex
    ) {
      return null;
    }

    const activeOrderIndex = this.activeDialogOrderIndex();
    return row.dialogs.find((dialog) => dialog.orderIndex === activeOrderIndex) ?? null;
  }

  isCharacterRowSpeaking(eventIndex: number, row: EpisodeCharacterRow): boolean {
    return this.activeDialogForCharacterRow(eventIndex, row) !== null;
  }

  eventDialogs(event: RagSeriesEpisodeEventResponse): EpisodeDialogLine[] {
    return this.normalizedEventDialogs(event);
  }

  dialogDisplayPrefix(dialog: EpisodeDialogLine): string {
    return this.dialogPrefix(dialog.characterName);
  }

  globalWordIndex(summaryIndex: number, wordIndex: number, summary: string): number {
    const range = this.wordRanges(summary)[wordIndex];
    return this.wordOffsetBefore(summaryIndex) + (range?.start ?? wordIndex);
  }

  globalDialogWordIndex(
    eventIndex: number,
    event: RagSeriesEpisodeEventResponse,
    dialogOrderIndex: number,
    wordIndex: number,
    text: string | null | undefined
  ): number {
    const range = this.wordRanges(text)[wordIndex];
    return this.wordOffsetBefore(eventIndex)
      + this.dialogWordOffsetBefore(event, dialogOrderIndex)
      + (range?.start ?? wordIndex);
  }

  wordOffsetBefore(summaryIndex: number): number {
    const episode = this.selectedEpisode();
    if (!episode) {
      return 0;
    }

    return this.normalizedEvents(episode)
      .slice(0, summaryIndex)
      .reduce((total, event) => total + this.timingUnitsForEvent(event), 0);
  }

  toggleTts(): void {
    if (this.ttsPlaying() || this.ttsLoading()) {
      this.stopPlayback();
      return;
    }

    const episode = this.selectedEpisode();
    const events = this.normalizedEvents(episode);
    const segments = this.playbackSegments(episode);
    const totalTimingUnits = segments.reduce((total, segment) => total + segment.timingUnits, 0);
    if (!events.length || !segments.length || totalTimingUnits <= 0) {
      this.ttsMessage.set('No text available for TTS.');
      return;
    }

    const selectedEventIndex = Math.min(
      Math.max(this.activeEventIndex(), 0),
      Math.max(events.length - 1, 0)
    );
    const startSegmentIndex = segments.findIndex((segment) => segment.eventIndex >= selectedEventIndex);
    if (startSegmentIndex < 0) {
      this.ttsMessage.set('No text available for the selected event.');
      return;
    }
    const startTimingOffset = this.wordOffsetBefore(selectedEventIndex);

    this.stopPlayback();
    this.ttsMessage.set('');
    this.ttsLoading.set(true);
    this.activeSegmentKind.set(null);
    this.activeDialogEventIndex.set(-1);
    this.activeDialogOrderIndex.set(-1);
    const sessionId = this.playbackSessionId;
    this.playNextSegment(segments, startSegmentIndex, startTimingOffset, totalTimingUnits, sessionId);
  }

  normalizedEvents(episode: EpisodeTextAreaEpisode | null | undefined): RagSeriesEpisodeEventResponse[] {
    if (!episode) {
      return [];
    }

    const rawEpisode = episode as unknown as { selected_events?: RagSeriesEpisodeEventResponse[] };
    const camelEvents = Array.isArray(episode.events) ? episode.events : [];
    const snakeEvents = Array.isArray(rawEpisode.selected_events) ? rawEpisode.selected_events : [];
    const rawEvents = camelEvents.length ? camelEvents : snakeEvents;

    return rawEvents.filter(
      (event): event is RagSeriesEpisodeEventResponse =>
        Boolean(event) && (this.eventSummary(event).length > 0 || this.normalizedEventDialogs(event).length > 0)
    );
  }

  private updateWordHighlight(totalTimingUnits: number): void {
    if (!this.audio || totalTimingUnits <= 0) {
      this.activeTimingUnit.set(-1);
      this.lastScrolledWordIndex = -1;
      return;
    }

    if (!Number.isFinite(this.audio.duration) || this.audio.duration <= 0) {
      if (this.ttsPlaying() && this.activeTimingUnit() < 0) {
        this.activeTimingUnit.set(0);
        this.scrollActiveWordIntoView(0);
      }
      return;
    }

    const correctedRatio = Math.min(1, Math.max(0, this.audio.currentTime / this.audio.duration));
    const nextIndex = Math.min(
      totalTimingUnits - 1,
      Math.floor(correctedRatio * totalTimingUnits)
    );
    if (nextIndex === this.activeTimingUnit()) {
      return;
    }

    this.activeTimingUnit.set(nextIndex);
    this.scrollActiveWordIntoView(nextIndex);
  }

  private timingUnitsForEvent(event: RagSeriesEpisodeEventResponse): number {
    let total = this.timingUnits(this.eventSummary(event));
    for (const dialog of this.normalizedEventDialogs(event)) {
      total += this.timingUnits(dialog.text);
    }
    return total;
  }

  private eventSummary(event: RagSeriesEpisodeEventResponse): string {
    if (typeof event.summary === 'string' && event.summary.trim()) {
      return event.summary.trim();
    }
    const raw = event as Record<string, unknown>;
    return typeof raw['summary'] === 'string' ? raw['summary'].trim() : '';
  }

  private eventCharacterNames(event: RagSeriesEpisodeEventResponse): string[] {
    const rawNames: unknown[] = [];
    const eventRecord = event as Record<string, unknown>;

    const pushNames = (value: unknown): void => {
      if (!Array.isArray(value)) {
        return;
      }
      for (const item of value) {
        if (typeof item === 'string') {
          rawNames.push(item);
          continue;
        }

        if (item && typeof item === 'object') {
          const objectItem = item as Record<string, unknown>;
          rawNames.push(
            objectItem['name'],
            objectItem['characterName'],
            objectItem['character'],
            objectItem['speakerCharacterName']
          );
        }
      }
    };

    pushNames(eventRecord['characterNames']);
    pushNames(eventRecord['charactersInImage']);
    pushNames(eventRecord['characters_in_scene']);
    pushNames(eventRecord['characters']);

    return rawNames
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
  }

  private normalizedCharacterImages(event: RagSeriesEpisodeEventResponse): Array<{ characterName: string; imageUrl: string }> {
    const camelItems = Array.isArray(event.characterImages) ? event.characterImages : [];
    const snakeItems = Array.isArray(event.character_images) ? event.character_images : [];
    const rawItems = camelItems.length ? camelItems : snakeItems;

    const normalized = rawItems
      .map((item) => this.normalizeCharacterImage(item))
      .filter((item): item is { characterName: string; imageUrl: string } => item !== null);

    if (normalized.length) {
      return normalized;
    }

    const imageUrls = this.displayCharacterImageUrls();
    const characterNames = this.eventCharacterNames(event);
    return imageUrls.map((imageUrl, index) => ({
      characterName: characterNames[index] ?? `Character ${index + 1}`,
      imageUrl
    }));
  }

  private normalizeCharacterImage(item: RagSeriesEpisodeCharacterImage | unknown): { characterName: string; imageUrl: string } | null {
    if (!item || typeof item !== 'object') {
      return null;
    }
    const record = item as Record<string, unknown>;
    const characterName = this.firstString(record['characterName'], record['character_name']).trim();
    const imageUrl = this.firstString(record['imageUrl'], record['image_url']).trim();
    if (!characterName || !imageUrl) {
      return null;
    }
    return { characterName, imageUrl };
  }

  private findPartialSpeakerImage(
    characterImages: Array<{ characterName: string; imageUrl: string }>,
    normalizedSpeakerName: string
  ): string | null {
    if (!normalizedSpeakerName) {
      return null;
    }

    const match = characterImages.find((item) => {
      const normalizedImageName = this.normalizedCharacterName(item.characterName);
      return normalizedImageName.includes(normalizedSpeakerName)
        || normalizedSpeakerName.includes(normalizedImageName);
    });
    return match?.imageUrl ?? null;
  }

  private normalizedEventDialogs(event: RagSeriesEpisodeEventResponse): EpisodeDialogLine[] {
    const eventRecord = event as Record<string, unknown>;
    const candidates: unknown[] = [];
    const pushCandidates = (value: unknown): void => {
      if (Array.isArray(value)) {
        candidates.push(...value);
      }
    };

    pushCandidates(eventRecord['dialogueLines']);
    pushCandidates(eventRecord['dialogue_lines']);
    pushCandidates(eventRecord['dialogs']);
    pushCandidates(eventRecord['dialogsList']);
    pushCandidates(eventRecord['dialogue']);

    const dialogs = candidates
      .map((entry, index) => this.normalizeDialogLine(entry, index))
      .filter((entry): entry is EpisodeDialogLine => entry !== null)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    return dialogs.map((entry, index) => ({ ...entry, orderIndex: index }));
  }

  private normalizeDialogLine(entry: unknown, fallbackIndex: number): EpisodeDialogLine | null {
    if (typeof entry === 'string') {
      const text = entry.trim();
      if (!text) {
        return null;
      }
      return {
        orderIndex: fallbackIndex,
        characterName: '',
        characterKey: '',
        normalizedCharacterName: '',
        text
      };
    }

    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const entryRecord = entry as Record<string, unknown>;
    const typedEntry = entry as RagSeriesEpisodeDialogueLine;
    const orderValue = this.toNonNegativeInteger(entryRecord['dialogOrder']);
    const text = this.firstString(
      typedEntry.text,
      entryRecord['dialogLine'],
      entryRecord['line'],
      entryRecord['text'],
      entryRecord['dialogue']
    );
    const normalizedText = text.trim();
    if (!normalizedText) {
      return null;
    }

    const characterName = this.firstString(
      typedEntry.speaker,
      entryRecord['speakerCharacterName'],
      entryRecord['characterName'],
      entryRecord['character'],
      entryRecord['speaker'],
      entryRecord['name']
    ).trim();
    const characterKey = this.firstString(
      typedEntry.speakerKey,
      typedEntry.speaker_key,
      entryRecord['speakerKey'],
      entryRecord['speakerCharacterKey'],
      entryRecord['characterKey']
    ).trim();

    return {
      orderIndex: Number.isFinite(orderValue) ? orderValue : fallbackIndex,
      characterName,
      characterKey,
      normalizedCharacterName: this.normalizedCharacterName(characterName),
      text: normalizedText
    };
  }

  private dialogRowIndex(rows: EpisodeCharacterRow[], dialog: EpisodeDialogLine): number {
    if (!rows.length) {
      return -1;
    }

    const normalizedSpeaker = dialog.normalizedCharacterName;
    if (normalizedSpeaker) {
      const speakerIndex = rows.findIndex((row) => row.normalizedCharacterName === normalizedSpeaker);
      if (speakerIndex >= 0) {
        return speakerIndex;
      }

      const partialMatchIndex = rows.findIndex(
        (row) =>
          row.normalizedCharacterName.includes(normalizedSpeaker) ||
          normalizedSpeaker.includes(row.normalizedCharacterName)
      );
      if (partialMatchIndex >= 0) {
        return partialMatchIndex;
      }
    }

    return rows.reduce(
      (leastUsedIndex, row, index, allRows) =>
        row.dialogs.length < allRows[leastUsedIndex].dialogs.length ? index : leastUsedIndex,
      0
    );
  }

  private dialogPlaybackText(dialog: EpisodeDialogLine): string {
    const line = dialog.text.trim();
    if (!line) {
      return '';
    }
    return line;
  }

  private dialogWordOffsetBefore(event: RagSeriesEpisodeEventResponse, dialogOrderIndex: number): number {
    const summaryUnits = this.timingUnits(this.eventSummary(event));
    const dialogs = this.normalizedEventDialogs(event);
    if (dialogOrderIndex <= 0) {
      return summaryUnits;
    }

    const dialogUnits = dialogs
      .slice(0, dialogOrderIndex)
      .reduce((total, dialog) => total + this.timingUnits(dialog.text), 0);
    return summaryUnits + dialogUnits;
  }

  private dialogPrefix(characterName: string): string {
    const speaker = characterName.trim() || EpisodeTextAreaComponent.narratorCharacterName;
    return `${speaker}: `;
  }

  private episodeIdentity(episode: EpisodeTextAreaEpisode): string {
    const raw = episode as Record<string, unknown>;
    const candidate =
      raw['id'] ?? raw['episodeId'] ?? raw['episode_id'];

    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return String(candidate);
    }
    if (typeof candidate === 'string') {
      return candidate.trim();
    }
    return '';
  }

  private normalizedCharacterName(value: string): string {
    return value.trim().toLowerCase();
  }

  private firstString(...values: unknown[]): string {
    for (const value of values) {
      if (typeof value === 'string') {
        return value;
      }
    }
    return '';
  }

  private toNonNegativeInteger(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return Math.floor(value);
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed >= 0) {
        return Math.floor(parsed);
      }
    }
    return Number.NaN;
  }

  private timingUnits(text: string | null | undefined): number {
    return this.episodeTokens(text)
      .filter((token) => token.isWord)
      .reduce((total, token) => total + token.timingWeight, 0);
  }

  private wordRanges(summary: string | null | undefined): Array<{ start: number; weight: number }> {
    const ranges: Array<{ start: number; weight: number }> = [];
    let offset = 0;
    for (const token of this.episodeTokens(summary)) {
      if (!token.isWord) {
        continue;
      }
      ranges.push({ start: offset, weight: token.timingWeight });
      offset += token.timingWeight;
    }
    return ranges;
  }

  private wordTimingWeight(text: string | null | undefined): number {
    const normalized = typeof text === 'string' ? text.trim() : '';
    if (!normalized) {
      return 0;
    }

    let weight = 1;
    const alphanumericLength = normalized.replace(/[^A-Za-z0-9]/g, '').length;
    if (alphanumericLength >= 7) {
      weight += 1;
    }
    if (/[,:;]/.test(normalized)) {
      weight += 1;
    }
    if (/[.!?]/.test(normalized)) {
      weight += 2;
    }
    if (/["')\]]$/.test(normalized) && /[.!?]/.test(normalized)) {
      weight += 1;
    }
    return weight;
  }

  private stopPlayback(resetMessage = true): void {
    this.playbackSessionId += 1;
    this.ttsSubscription?.unsubscribe();
    this.ttsSubscription = null;

    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio.load();
      this.audio = null;
    }

    if (this.currentAudioUrl) {
      URL.revokeObjectURL(this.currentAudioUrl);
      this.currentAudioUrl = null;
    }

    this.ttsLoading.set(false);
    this.ttsPlaying.set(false);
    this.activeTimingUnit.set(-1);
    this.activeSegmentKind.set(null);
    this.activeDialogEventIndex.set(-1);
    this.activeDialogOrderIndex.set(-1);
    this.activeDisplayEvent.set(this.eventAtIndex(this.activeEventIndex()));
    this.lastScrolledWordIndex = -1;
    if (resetMessage) {
      this.ttsMessage.set('');
    }
  }

  private playbackSegments(episode: EpisodeTextAreaEpisode | null): EpisodePlaybackSegment[] {
    if (!episode) {
      return [];
    }

    const segments: EpisodePlaybackSegment[] = [];
    for (const [eventIndex, event] of this.normalizedEvents(episode).entries()) {
      const summary = this.eventSummary(event);
      if (summary) {
        const timingUnits = this.timingUnits(summary);
        if (timingUnits > 0) {
          segments.push({
            kind: 'summary',
            eventIndex,
            dialogOrderIndex: -1,
            text: summary,
            characterName: EpisodeTextAreaComponent.narratorCharacterName,
            characterKey: '',
            timingUnits
          });
        }
      }

      for (const dialog of this.normalizedEventDialogs(event)) {
        const line = dialog.text.trim();
        if (!line) {
          continue;
        }
        const timingUnits = this.timingUnits(line);
        if (timingUnits <= 0) {
          continue;
        }
        segments.push({
          kind: 'dialog',
          eventIndex,
          dialogOrderIndex: dialog.orderIndex,
          text: line,
          characterName: dialog.characterName || EpisodeTextAreaComponent.narratorCharacterName,
          characterKey: dialog.characterKey,
          timingUnits
        });
      }
    }

    return segments;
  }

  private playNextSegment(
    segments: EpisodePlaybackSegment[],
    index: number,
    timingOffset: number,
    totalTimingUnits: number,
    sessionId: number
  ): void {
    if (sessionId !== this.playbackSessionId) {
      return;
    }

    if (typeof window === 'undefined') {
      this.ttsLoading.set(false);
      this.ttsMessage.set('Audio playback is only available in the browser.');
      return;
    }

    if (index >= segments.length) {
      this.stopPlayback();
      return;
    }

    const segment = segments[index];
    this.setActiveEvent(segment.eventIndex);
    this.activeSegmentKind.set(segment.kind);
    this.activeDialogEventIndex.set(segment.kind === 'dialog' ? segment.eventIndex : -1);
    this.activeDialogOrderIndex.set(segment.kind === 'dialog' ? segment.dialogOrderIndex : -1);

    this.ttsSubscription?.unsubscribe();
    this.ttsSubscription = this.ttsApi
      .openAiVoice({
        text: segment.text,
        characterName: segment.characterName,
        characterKey: segment.characterKey || undefined,
        entityType: segment.kind === 'dialog' ? 'dialog' : 'slide_summary',
        format: 'mp3',
        expressiveness: segment.kind === 'dialog' ? 'high' : 'medium',
        style: 'neutral'
      })
      .subscribe({
        next: (blob) => {
          if (sessionId !== this.playbackSessionId) {
            return;
          }

          this.ttsSubscription = null;
          this.startAudioForSegment(
            blob,
            segment,
            timingOffset,
            totalTimingUnits,
            sessionId,
            () => {
              this.playNextSegment(
                segments,
                index + 1,
                timingOffset + segment.timingUnits,
                totalTimingUnits,
                sessionId
              );
            }
          );
        },
        error: (err) => {
          if (sessionId !== this.playbackSessionId) {
            return;
          }

          const backendMessage =
            typeof err?.error === 'string'
              ? err.error
              : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
          this.ttsLoading.set(false);
          this.ttsPlaying.set(false);
          this.activeTimingUnit.set(-1);
          this.ttsMessage.set(`TTS failed: ${backendMessage}`);
          this.activeSegmentKind.set(null);
          this.activeDialogEventIndex.set(-1);
          this.activeDialogOrderIndex.set(-1);
        }
      });
  }

  private startAudioForSegment(
    blob: Blob,
    segment: EpisodePlaybackSegment,
    timingOffset: number,
    totalTimingUnits: number,
    sessionId: number,
    onEnded: () => void
  ): void {
    if (sessionId !== this.playbackSessionId) {
      return;
    }

    const previousAudio = this.audio;
    this.audio = null;
    if (previousAudio) {
      previousAudio.pause();
      previousAudio.removeAttribute('src');
    }
    if (this.currentAudioUrl) {
      URL.revokeObjectURL(this.currentAudioUrl);
      this.currentAudioUrl = null;
    }

    this.currentAudioUrl = URL.createObjectURL(blob);
    this.audio = new Audio(this.currentAudioUrl);
    const audio = this.audio;
    const audioInstanceId = ++this.audioInstanceId;
    this.activeTimingUnit.set(Math.min(totalTimingUnits - 1, timingOffset));
    this.scrollActiveWordIntoView(this.activeTimingUnit());

    const updateSegmentHighlight = (): void => {
      this.ngZone.run(() => {
        if (sessionId !== this.playbackSessionId || audioInstanceId !== this.audioInstanceId || !audio) {
          return;
        }
        if (segment.timingUnits <= 0 || totalTimingUnits <= 0) {
          return;
        }

        if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
          const fallbackIndex = timingOffset;
          if (this.activeTimingUnit() !== fallbackIndex) {
            this.activeTimingUnit.set(fallbackIndex);
            this.scrollActiveWordIntoView(fallbackIndex);
          }
          return;
        }

        const ratio = Math.min(1, Math.max(0, audio.currentTime / audio.duration));
        const localIndex = Math.min(segment.timingUnits - 1, Math.floor(ratio * segment.timingUnits));
        const globalIndex = Math.min(totalTimingUnits - 1, timingOffset + localIndex);
        if (globalIndex === this.activeTimingUnit()) {
          return;
        }

        this.activeTimingUnit.set(globalIndex);
        this.scrollActiveWordIntoView(globalIndex);
      });
    };

    audio.addEventListener('loadedmetadata', updateSegmentHighlight);
    audio.addEventListener('canplay', updateSegmentHighlight);
    audio.addEventListener('timeupdate', updateSegmentHighlight);
    audio.addEventListener('ended', () => {
      this.ngZone.run(() => {
        if (sessionId !== this.playbackSessionId || audioInstanceId !== this.audioInstanceId) {
          return;
        }
        onEnded();
      });
    });
    audio.addEventListener('error', () => {
      this.ngZone.run(() => {
        if (sessionId !== this.playbackSessionId || audioInstanceId !== this.audioInstanceId) {
          return;
        }
        this.ttsMessage.set('TTS playback failed.');
        this.stopPlayback(false);
      });
    });

    void audio.play().then(() => {
      this.ngZone.run(() => {
        if (sessionId !== this.playbackSessionId || audioInstanceId !== this.audioInstanceId) {
          return;
        }

        this.ttsLoading.set(false);
        this.ttsPlaying.set(true);
        updateSegmentHighlight();
      });
    }).catch(() => {
      this.ngZone.run(() => {
        if (sessionId !== this.playbackSessionId || audioInstanceId !== this.audioInstanceId) {
          return;
        }
        this.ttsLoading.set(false);
        this.ttsPlaying.set(false);
        this.activeTimingUnit.set(-1);
        this.ttsMessage.set('Audio playback could not start.');
        this.activeSegmentKind.set(null);
        this.activeDialogEventIndex.set(-1);
        this.activeDialogOrderIndex.set(-1);
      });
    });
  }

  private scrollActiveWordIntoView(activeWordIndex: number): void {
    if (activeWordIndex < 0 || activeWordIndex === this.lastScrolledWordIndex) {
      return;
    }

    const container = this.scrollContainer?.nativeElement;
    if (!container) {
      return;
    }

    requestAnimationFrame(() => {
      const activeWord = container.querySelector<HTMLElement>(
        `[data-global-word-index="${activeWordIndex}"]`
      );
      if (!activeWord) {
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const wordRect = activeWord.getBoundingClientRect();
      const currentTop = container.scrollTop;
      const wordCenter = wordRect.top - containerRect.top + currentTop + wordRect.height / 2;
      const targetTop = wordCenter - container.clientHeight / 2;

      container.scrollTo({
        top: Math.max(0, targetTop),
        behavior: 'auto'
      });
    });
    this.lastScrolledWordIndex = activeWordIndex;
  }

  private setActiveEvent(index: number): void {
    const event = this.eventAtIndex(index);
    this.activeEventIndex.set(index);
    this.activeDisplayEvent.set(event);
  }

  private eventAtIndex(index: number): RagSeriesEpisodeEventResponse | null {
    const episode = this.selectedEpisode();
    if (!episode) {
      return null;
    }
    const events = this.normalizedEvents(episode);
    if (!events.length) {
      return null;
    }
    return events[index] ?? null;
  }
}
