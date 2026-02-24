import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TtsApiService } from '../api/tts-api.service';

export interface ChunkedTtsHooks {
  onLoading?: (loading: boolean) => void;
  onPlaying?: (playing: boolean) => void;
  onProgress?: (currentChunk: number, totalChunks: number) => void;
  onMessage?: (message: string) => void;
}

@Injectable({ providedIn: 'root' })
export class ChunkedTtsPlayerService {
  private readonly maxChunkChars = 900;
  private readonly isBrowser: boolean;
  private audio: HTMLAudioElement | null = null;
  private abortController: AbortController | null = null;
  private currentObjectUrl: string | null = null;

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

    const chunks = this.chunkText(normalized);
    this.stop();
    hooks?.onLoading?.(true);
    hooks?.onMessage?.('');
    hooks?.onPlaying?.(false);

    this.abortController = new AbortController();
    let firstChunkStarted = false;

    try {
      let nextChunkBlobPromise: Promise<Blob> | null = this.fetchChunkBlob(
        chunks[0],
        this.abortController.signal
      );

      for (let i = 0; i < chunks.length; i += 1) {
        hooks?.onProgress?.(i + 1, chunks.length);
        if (!nextChunkBlobPromise) {
          throw new Error('Missing queued TTS chunk.');
        }
        const blob = await nextChunkBlobPromise;

        nextChunkBlobPromise =
          i + 1 < chunks.length
            ? this.fetchChunkBlob(chunks[i + 1], this.abortController.signal)
            : null;

        this.clearObjectUrl();
        this.currentObjectUrl = URL.createObjectURL(blob);
        this.audio.src = this.currentObjectUrl;
        await this.audio.play();
        hooks?.onPlaying?.(true);
        if (!firstChunkStarted) {
          firstChunkStarted = true;
          hooks?.onLoading?.(false);
        }

        await this.waitForChunkEnd(this.abortController.signal);
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
      if (!firstChunkStarted) {
        hooks?.onLoading?.(false);
      }
      this.abortController = null;
    }
  }

  private async fetchChunkBlob(chunk: string, signal: AbortSignal): Promise<Blob> {
    const response = await this.ttsApi.streamTts(chunk, signal);
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || `HTTP ${response.status}`);
    }
    const contentType = response.headers.get('content-type') ?? 'audio/wav';
    const audioBuffer = await response.arrayBuffer();
    return new Blob([audioBuffer], { type: contentType });
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
}
