import { Component, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { RagApiService, RagCharacterDetails } from '../../core/api/rag-api.service';

@Component({
  selector: 'app-document-characters',
  imports: [RouterLink],
  templateUrl: './document-characters.html',
  styleUrl: './document-characters.scss'
})
export class DocumentCharactersComponent {
  docKey = signal('');
  loading = signal(false);
  message = signal('');
  characters = signal<RagCharacterDetails[]>([]);

  constructor(
    private readonly route: ActivatedRoute,
    private readonly ragApi: RagApiService
  ) {
    this.route.paramMap.subscribe((params) => {
      this.docKey.set(params.get('docKey') ?? '');
      this.loadCharacters();
    });
  }

  retry(): void {
    this.loadCharacters();
  }

  characterName(item: RagCharacterDetails): string {
    if (typeof item.characterName === 'string' && item.characterName.trim()) {
      return item.characterName.trim();
    }
    if (typeof item.character_name === 'string' && item.character_name.trim()) {
      return item.character_name.trim();
    }
    return `Character #${item.id}`;
  }

  private loadCharacters(): void {
    const key = this.docKey().trim();
    if (!key) {
      this.message.set('Missing docKey.');
      this.characters.set([]);
      return;
    }

    this.loading.set(true);
    this.message.set('');
    this.characters.set([]);

    this.ragApi.getCharactersByDocKey(key).subscribe({
      next: (items) => {
        this.characters.set(items ?? []);
        if (!items?.length) {
          this.message.set('No characters found for this document.');
        }
        this.loading.set(false);
      },
      error: (err) => {
        const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
        const backendMessage =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
        this.message.set(`Failed to load characters (${status}): ${backendMessage}`);
        this.loading.set(false);
      }
    });
  }
}
