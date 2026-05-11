import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { buildApiUrl } from '../config/app-environment';

export interface OpenAiTtsGenerateRequest {
  text: string;
  voice?: string;
  characterName?: string;
  characterKey?: string;
  languageCode?: string;
  docKey?: string;
  entityType?: 'slide_summary' | 'dialog';
  entityId?: number;
  speed?: number;
  expressiveness?: 'low' | 'medium' | 'high';
  format: 'mp3' | 'wav';
}

export type TtsRequest = {
  text: string;
  voice?: string;
  characterName?: string;
  characterKey?: string;
  languageCode?: string;
  docKey?: string;
  entityType?: 'slide_summary' | 'dialog';
  entityId?: number;
  speed?: number;
  format?: string;
  expressiveness?: 'low' | 'medium' | 'high';
  style?: 'neutral' | 'warm' | 'mysterious' | 'suspenseful' | 'solemn' | 'playful';
};

@Injectable({ providedIn: 'root' })
export class TtsApiService {
  private readonly baseUrl = buildApiUrl('/tts');
  constructor(private readonly http: HttpClient) {}

  streamTts(text: string): Observable<Blob> {
    return this.http.post(`${this.baseUrl}/stream`, { text }, { responseType: 'blob' });
  }

  generateOpenAiTts(req: OpenAiTtsGenerateRequest): Observable<Blob> {
    console.info('[TTS] POST /api/tts', {
      textLength: req.text?.length ?? 0,
      voice: req.voice,
      characterName: req.characterName,
      characterKey: req.characterKey,
      languageCode: req.languageCode,
      docKey: req.docKey,
      entityType: req.entityType,
      entityId: req.entityId,
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
      characterKey: req.characterKey,
      languageCode: req.languageCode,
      docKey: req.docKey,
      entityType: req.entityType,
      entityId: req.entityId,
      speed: req.speed,
      format: req.format ?? 'mp3',
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
          characterKey: req.characterKey,
          languageCode: req.languageCode,
          docKey: req.docKey,
          entityType: req.entityType,
          entityId: req.entityId,
          speed: req.speed,
          format: req.format ?? 'mp3',
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
