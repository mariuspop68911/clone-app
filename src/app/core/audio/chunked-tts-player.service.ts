import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TtsApiService } from '../api/tts-api.service';
import { firstValueFrom } from 'rxjs';

export interface ChunkedTtsHooks {
  onLoading?: (loading: boolean) => void;
  onPlaying?: (playing: boolean) => void;
  onProgress?: (currentChunk: number, totalChunks: number) => void;
  onWordProgress?: (currentWordIndex: number, totalWords: number) => void;
  onMessage?: (message: string) => void;
}

interface PreparedTtsAudio {
  chunkWordCounts: number[];
  totalWords: number;
  blobs: Blob[];
}

@Injectable({ providedIn: 'root' })
export class ChunkedTtsPlayerService {
  private readonly maxChunkChars = 900;
  private readonly maxCacheEntries = 30;
  private readonly isBrowser: boolean;
  private audio: HTMLAudioElement | null = null;
  private abortController: AbortController | null = null;
  private currentObjectUrl: string | null = null;
  private readonly preparedCache = new Map<string, PreparedTtsAudio>();

  constructor(
    private readonly ttsApi: TtsApiService,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    if (this.isBrowser) {
      this.audio = new Audio();
    }
  }

  async play(text: string, hooks?: ChunkedTtsHooks): Promise<void> {
    if (!this.isBrowser || !this.audio) {
      hooks?.onMessage?.('Audio playback is only available in the browser.');
      return;
    }

    const normalized = text.trim();
    if (!normalized) {
      hooks?.onMessage?.('No text available for TTS.');
      return;
    }

    this.stop();
    hooks?.onLoading?.(true);
    hooks?.onMessage?.('');
    hooks?.onPlaying?.(false);

    this.abortController = new AbortController();

    try {
      const prepared = await this.prepareAudio(normalized, this.abortController.signal);
      hooks?.onLoading?.(false);

      for (let i = 0; i < prepared.blobs.length; i += 1) {
        hooks?.onProgress?.(i + 1, prepared.blobs.length);
        const chunkPrefixWords = prepared.chunkWordCounts
          .slice(0, i)
          .reduce((sum, count) => sum + count, 0);
        const currentChunkWordCount = prepared.chunkWordCounts[i] ?? 0;
        const removeWordProgressListener = this.attachWordProgressListener(
          chunkPrefixWords,
          currentChunkWordCount,
          prepared.totalWords,
          hooks
        );

        this.clearObjectUrl();
        this.currentObjectUrl = URL.createObjectURL(prepared.blobs[i]);
        this.audio.src = this.currentObjectUrl;
        await this.audio.play();
        hooks?.onPlaying?.(true);

        await this.waitForChunkEnd(this.abortController.signal);
        removeWordProgressListener();
      }

      hooks?.onPlaying?.(false);
    } catch (err) {
      hooks?.onPlaying?.(false);
      const raw = err as Error | { name?: string; message?: string };
      if (raw?.name === 'AbortError') {
        hooks?.onMessage?.('Playback stopped.');
      } else {
        hooks?.onMessage?.(`TTS playback failed: ${raw?.message ?? 'unknown error'}`);
      }
    } finally {
      hooks?.onLoading?.(false);
      this.abortController = null;
    }
  }

  async preload(text: string): Promise<void> {
    if (!this.isBrowser || !this.audio) {
      return;
    }

    const normalized = text.trim();
    if (!normalized) {
      return;
    }

    await this.prepareAudio(normalized);
  }

  private async fetchChunkBlob(chunk: string, signal: AbortSignal): Promise<Blob> {
    if (signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const blob = await firstValueFrom(this.ttsApi.streamTts(chunk));
    if (!blob.size) {
      throw new Error('API returned empty audio content.');
    }
    return blob;
  }

  private async prepareAudio(text: string, signal?: AbortSignal): Promise<PreparedTtsAudio> {
    const cached = this.preparedCache.get(text);
    if (cached) {
      return cached;
    }

    const chunks = this.chunkText(text);
    const chunkWordCounts = chunks.map((chunk) => this.countWords(chunk));
    const totalWords = chunkWordCounts.reduce((sum, count) => sum + count, 0);
    const blobs: Blob[] = [];

    for (const chunk of chunks) {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      blobs.push(await this.fetchChunkBlob(chunk, signal ?? new AbortController().signal));
    }

    const prepared: PreparedTtsAudio = {
      chunkWordCounts,
      totalWords,
      blobs
    };

    this.preparedCache.set(text, prepared);
    if (this.preparedCache.size > this.maxCacheEntries) {
      const firstKey = this.preparedCache.keys().next().value;
      if (typeof firstKey === 'string') {
        this.preparedCache.delete(firstKey);
      }
    }

    return prepared;
  }

  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    this.clearObjectUrl();
  }

  private waitForChunkEnd(signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.audio) {
        resolve();
        return;
      }

      const onEnded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('Audio playback failed.'));
      };
      const onAbort = () => {
        cleanup();
        reject(new DOMException('Aborted', 'AbortError'));
      };
      const cleanup = () => {
        this.audio?.removeEventListener('ended', onEnded);
        this.audio?.removeEventListener('error', onError);
        signal.removeEventListener('abort', onAbort);
      };

      this.audio.addEventListener('ended', onEnded, { once: true });
      this.audio.addEventListener('error', onError, { once: true });
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private attachWordProgressListener(
    chunkPrefixWords: number,
    currentChunkWordCount: number,
    totalWords: number,
    hooks?: ChunkedTtsHooks
  ): () => void {
    if (!this.audio || currentChunkWordCount <= 0) {
      return () => {};
    }

    const emitProgress = () => {
      if (!this.audio) {
        return;
      }
      const duration = Number.isFinite(this.audio.duration) && this.audio.duration > 0
        ? this.audio.duration
        : 0;
      const ratio = duration > 0 ? this.audio.currentTime / duration : 0;
      const chunkWordIndex = Math.min(
        currentChunkWordCount - 1,
        Math.max(0, Math.floor(ratio * currentChunkWordCount))
      );
      const globalWordIndex = chunkPrefixWords + chunkWordIndex;
      hooks?.onWordProgress?.(globalWordIndex, totalWords);
    };

    emitProgress();
    this.audio.addEventListener('timeupdate', emitProgress);
    return () => {
      this.audio?.removeEventListener('timeupdate', emitProgress);
      if (currentChunkWordCount > 0) {
        const finalWordIndex = chunkPrefixWords + currentChunkWordCount - 1;
        hooks?.onWordProgress?.(finalWordIndex, totalWords);
      }
    };
  }

  private chunkText(text: string): string[] {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= this.maxChunkChars) {
      return [normalized];
    }

    const sentenceLike = normalized.split(/(?<=[.!?])\s+/);
    const chunks: string[] = [];
    let current = '';

    for (const sentence of sentenceLike) {
      if (!sentence) {
        continue;
      }

      const candidate = current ? `${current} ${sentence}` : sentence;
      if (candidate.length <= this.maxChunkChars) {
        current = candidate;
        continue;
      }

      if (current) {
        chunks.push(current);
      }

      if (sentence.length <= this.maxChunkChars) {
        current = sentence;
        continue;
      }

      let remaining = sentence;
      while (remaining.length > this.maxChunkChars) {
        chunks.push(remaining.slice(0, this.maxChunkChars));
        remaining = remaining.slice(this.maxChunkChars).trimStart();
      }
      current = remaining;
    }

    if (current) {
      chunks.push(current);
    }

    return chunks.length ? chunks : [normalized];
  }

  private clearObjectUrl(): void {
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
  }

  private countWords(text: string): number {
    const matches = text.trim().match(/\S+/g);
    return matches ? matches.length : 0;
  }
}
