import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TtsApiService {
  private readonly baseUrl = '/api/tts';

  streamTts(text: string, signal?: AbortSignal): Promise<Response> {
    return fetch(`${this.baseUrl}/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal
    });
  }
}
