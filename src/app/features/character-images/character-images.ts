import { Component, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  RagApiService,
  RagComicCharacterImageItem,
  RagComicCharacterImagesGenerateResponse
} from '../../core/api/rag-api.service';

@Component({
  selector: 'app-character-images',
  imports: [RouterLink],
  templateUrl: './character-images.html',
  styleUrl: './character-images.scss'
})
export class CharacterImagesComponent {
  docKey = signal('');
  loading = signal(false);
  message = signal('');
  result = signal<RagComicCharacterImagesGenerateResponse | null>(null);

  constructor(
    private readonly route: ActivatedRoute,
    private readonly ragApi: RagApiService
  ) {
    this.route.paramMap.subscribe((params) => {
      const key = params.get('docKey') ?? '';
      this.docKey.set(key);

      const statePayload = this.fromNavigationState(history.state?.['generatedCharacterImages']);
      if (statePayload && statePayload.docKey === key) {
        this.result.set(statePayload);
        this.message.set('');
        return;
      }

      this.loadCharactersImages();
    });
  }

  refresh(): void {
    this.loadCharactersImages();
  }

  characters(): RagComicCharacterImageItem[] {
    const items = this.result()?.characters;
    return Array.isArray(items) ? items : [];
  }

  characterName(item: RagComicCharacterImageItem, index: number): string {
    const name = (item.name ?? '').trim();
    return name || `Character #${index + 1}`;
  }

  characterAppearance(item: RagComicCharacterImageItem): string {
    const appearance = (item.appearance ?? '').trim();
    return appearance || 'No appearance provided.';
  }

  private loadCharactersImages(): void {
    const key = this.docKey().trim();
    if (!key) {
      this.message.set('Missing docKey.');
      this.result.set(null);
      return;
    }

    this.loading.set(true);
    this.message.set('');
    this.result.set(null);

    this.ragApi.generateComicCharacterImages(key).subscribe({
      next: (response) => {
        this.result.set(response);
        if (!this.characters().length) {
          this.message.set('No characters returned for this document.');
        }
        this.loading.set(false);
      },
      error: (err) => {
        const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
        const backendMessage =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
        this.message.set(`Failed to generate character images (${status}): ${backendMessage}`);
        this.loading.set(false);
      }
    });
  }

  private fromNavigationState(value: unknown): RagComicCharacterImagesGenerateResponse | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    return value as RagComicCharacterImagesGenerateResponse;
  }
}
