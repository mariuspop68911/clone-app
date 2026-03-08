import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';

export interface OpenAiTtsGenerateRequest {
  text: string;
  voice: string;
  format: 'wav';
}

@Injectable({ providedIn: 'root' })
export class TtsApiService {
  private readonly baseUrl = '/api/tts';
  constructor(private readonly http: HttpClient) {}

  streamTts(text: string): Observable<Blob> {
    return this.http.post(`${this.baseUrl}/stream`, { text }, { responseType: 'blob' });
  }

  listOpenAiVoices(): Observable<unknown> {
    return this.http.get<unknown>(`${this.baseUrl}/voices`);
  }

  generateOpenAiTts(req: OpenAiTtsGenerateRequest): Observable<Blob> {
    console.info('[TTS] POST /api/tts', {
      textLength: req.text?.length ?? 0,
      voice: req.voice,
      format: req.format
    });
    return this.http.post(`${this.baseUrl}`, req, { responseType: 'blob' }).pipe(
      tap((blob) => {
        console.info('[TTS] /api/tts blob received', {
          size: blob.size,
          type: blob.type || 'unknown'
        });
      })
    );
  }

  openAiVoice(text: string, voice = 'alloy'): Observable<Blob> {
    console.info('[TTS] POST /api/tts (openAiVoice)', {
      textLength: text?.length ?? 0,
      voice,
      format: 'wav'
    });
    return this.http
      .post(
        `${this.baseUrl}`,
        { text, voice, format: 'wav' as const },
        {
          responseType: 'blob'
        }
      )
      .pipe(
        tap((blob) => {
          console.info('[TTS] /api/tts blob received (openAiVoice)', {
            size: blob.size,
            type: blob.type || 'unknown'
          });
        })
      );
  }
}
