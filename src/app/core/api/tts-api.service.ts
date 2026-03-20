import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';

export interface OpenAiTtsGenerateRequest {
  text: string;
  voice?: string;
  characterName?: string;
  speed?: number;
  expressiveness?: 'low' | 'medium' | 'high';
  format: 'wav';
}

export type TtsRequest = {
  text: string;
  voice?: string;
  characterName?: string;
  speed?: number;
  format?: string;
  expressiveness?: 'low' | 'medium' | 'high';
  style?: 'neutral' | 'warm' | 'mysterious' | 'suspenseful' | 'solemn' | 'playful';
};

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
      characterName: req.characterName,
      speed: req.speed,
      expressiveness: req.expressiveness,
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

  openAiVoice(req: TtsRequest): Observable<Blob> {
    console.info('[TTS] POST /api/tts/stream (openAiVoice)', {
      textLength: req.text?.length ?? 0,
      voice: req.voice,
      characterName: req.characterName,
      speed: req.speed,
      format: req.format ?? 'wav',
      expressiveness: req.expressiveness ?? 'medium',
      style: req.style ?? 'neutral'
    });
    return this.http
      .post(
        `${this.baseUrl}/stream`,
        {
          text: req.text,
          voice: req.voice,
          characterName: req.characterName,
          speed: req.speed,
          format: req.format ?? 'wav',
          expressiveness: req.expressiveness,
          style: req.style
        },
        {
          responseType: 'blob'
        }
      )
      .pipe(
        tap((blob) => {
          console.info('[TTS] /api/tts/stream blob received (openAiVoice)', {
            size: blob.size,
            type: blob.type || 'unknown'
          });
        })
      );
  }
}
