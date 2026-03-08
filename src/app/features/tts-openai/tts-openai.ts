import { Component, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TtsApiService } from '../../core/api/tts-api.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-tts-openai',
  imports: [FormsModule, RouterLink],
  templateUrl: './tts-openai.html',
  styleUrl: './tts-openai.scss'
})
export class TtsOpenAiComponent {
  text = '';
  selectedVoice = '';
  loadingVoices = signal(false);
  generating = signal(false);
  errorMessage = signal('');
  voices = signal<string[]>([]);
  audioUrl = signal('');
  audioMimeType = signal('');

  constructor(private readonly ttsApi: TtsApiService) {
    this.loadVoices();
  }

  ngOnDestroy(): void {
    this.clearAudioUrl();
  }

  async loadVoices(): Promise<void> {
    this.loadingVoices.set(true);
    this.errorMessage.set('');

    try {
      const payload = await firstValueFrom(this.ttsApi.listOpenAiVoices());
      const normalized = this.normalizeVoices(payload);
      this.voices.set(normalized);

      if (!normalized.length) {
        this.errorMessage.set('No voices returned by API.');
      } else if (!this.selectedVoice || !normalized.includes(this.selectedVoice)) {
        this.selectedVoice = normalized[0];
      }
    } catch (err) {
      const raw = err as Error;
      this.errorMessage.set(`Failed to load voices: ${raw?.message ?? 'unknown error'}`);
      this.voices.set([]);
    } finally {
      this.loadingVoices.set(false);
    }
  }

  async generate(): Promise<void> {
    const text = this.text.trim();
    const voice = this.selectedVoice.trim();

    if (!text) {
      this.errorMessage.set('Text is required.');
      return;
    }
    if (!voice) {
      this.errorMessage.set('Voice is required.');
      return;
    }

    this.generating.set(true);
    this.errorMessage.set('');
    this.clearAudioUrl();

    try {
      const blob = await firstValueFrom(
        this.ttsApi.generateOpenAiTts({
          text,
          voice,
          format: 'wav'
        })
      );
      if (!blob.size) {
        throw new Error('API returned empty audio content.');
      }
      console.info('[TTS OpenAI] Received audio blob', {
        size: blob.size,
        type: blob.type || 'unknown'
      });
      const mimeType = blob.type?.trim() || 'audio/wav';
      const objectUrl = URL.createObjectURL(blob);
      this.audioUrl.set(objectUrl);
      this.audioMimeType.set(mimeType);
    } catch (err) {
      this.errorMessage.set(`TTS generation failed: ${this.readApiError(err)}`);
    } finally {
      this.generating.set(false);
    }
  }

  private normalizeVoices(payload: unknown): string[] {
    const values = Array.isArray(payload)
      ? payload
      : payload && typeof payload === 'object' && Array.isArray((payload as Record<string, unknown>)['voices'])
        ? ((payload as Record<string, unknown>)['voices'] as unknown[])
        : [];

    const unique = new Set<string>();
    for (const entry of values) {
      if (typeof entry === 'string' && entry.trim()) {
        unique.add(entry.trim());
        continue;
      }

      if (entry && typeof entry === 'object') {
        const record = entry as Record<string, unknown>;
        const charId = record['charId'];
        const voice = record['voice'];
        const id = record['id'];
        if (typeof charId === 'string' && charId.trim()) {
          unique.add(charId.trim());
        } else if (typeof voice === 'string' && voice.trim()) {
          unique.add(voice.trim());
        } else if (typeof id === 'string' && id.trim()) {
          unique.add(id.trim());
        }
      }
    }

    return Array.from(unique);
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

  private clearAudioUrl(): void {
    const url = this.audioUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
    this.audioUrl.set('');
    this.audioMimeType.set('');
  }
}
