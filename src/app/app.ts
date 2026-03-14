import { isPlatformBrowser } from '@angular/common';
import { Component, Inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet
} from '@angular/router';
import { filter } from 'rxjs';
import {
  RagApiService,
  RagCharacterReferenceImageResponse,
  RagDocumentResponse
} from './core/api/rag-api.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  drawerDocs = signal<RagDocumentResponse[]>([]);
  drawerLoading = signal(false);
  selectedDocKey = signal('');
  drawerDocExpandedByDocKey = signal<Record<string, boolean>>({});
  drawerCharactersByDocKey = signal<Record<string, RagCharacterReferenceImageResponse[]>>({});
  drawerCharacterLoadingByDocKey = signal<Record<string, boolean>>({});
  drawerCharacterErrorByDocKey = signal<Record<string, string>>({});
  drawerCharacterExpandedByDocKey = signal<Record<string, boolean>>({});

  constructor(
    private readonly ragApi: RagApiService,
    private readonly router: Router,
    @Inject(PLATFORM_ID) private readonly platformId: object
  ) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this.loadDrawerDocs();
    this.syncSelectedDocFromUrl();
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => this.syncSelectedDocFromUrl());
  }

  drawerDocKey(doc: RagDocumentResponse): string | null {
    const key = doc['docKey'];
    if (typeof key === 'string' && key.trim()) {
      return key.trim();
    }
    return null;
  }

  drawerDocLabel(doc: RagDocumentResponse, index: number): string {
    const key = this.drawerDocKey(doc);
    if (key) {
      return key;
    }
    return `Document ${index + 1}`;
  }

  isSelectedDoc(doc: RagDocumentResponse): boolean {
    const key = this.drawerDocKey(doc);
    return !!key && key === this.selectedDocKey();
  }

  isDocExpanded(docKey: string): boolean {
    return !!this.drawerDocExpandedByDocKey()[docKey];
  }

  toggleDocSection(docKey: string): void {
    this.drawerDocExpandedByDocKey.update((current) => ({
      ...current,
      [docKey]: !current[docKey]
    }));
  }

  isCharacterSectionExpanded(docKey: string): boolean {
    return !!this.drawerCharacterExpandedByDocKey()[docKey];
  }

  toggleCharacterSection(docKey: string): void {
    this.drawerCharacterExpandedByDocKey.update((current) => ({
      ...current,
      [docKey]: !current[docKey]
    }));
    this.ensureCharactersLoaded(docKey);
  }

  drawerCharacters(docKey: string): RagCharacterReferenceImageResponse[] {
    return this.drawerCharactersByDocKey()[docKey] ?? [];
  }

  drawerCharactersLoading(docKey: string): boolean {
    return !!this.drawerCharacterLoadingByDocKey()[docKey];
  }

  drawerCharactersError(docKey: string): string {
    return this.drawerCharacterErrorByDocKey()[docKey] ?? '';
  }

  private loadDrawerDocs(): void {
    this.drawerLoading.set(true);
    this.ragApi.listDocuments().subscribe({
      next: (docs) => {
        this.drawerDocs.set(docs ?? []);
        this.drawerLoading.set(false);
      },
      error: () => {
        this.drawerDocs.set([]);
        this.drawerLoading.set(false);
      }
    });
  }

  private syncSelectedDocFromUrl(): void {
    const docKey = this.extractDocKeyFromUrl(this.router.url);
    this.selectedDocKey.set(docKey);
    if (docKey) {
      this.drawerDocExpandedByDocKey.update((current) => ({ ...current, [docKey]: true }));
      this.ensureCharactersLoaded(docKey);
    }
  }

  private extractDocKeyFromUrl(url: string): string {
    const path = url.split('?')[0]?.split('#')[0] ?? '';
    const match = path.match(/^\/documents\/([^/]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : '';
  }

  private ensureCharactersLoaded(docKey: string): void {
    if (
      !docKey ||
      this.drawerCharactersByDocKey()[docKey] ||
      this.drawerCharacterLoadingByDocKey()[docKey]
    ) {
      return;
    }

    this.drawerCharacterLoadingByDocKey.update((current) => ({ ...current, [docKey]: true }));
    this.drawerCharacterErrorByDocKey.update((current) => ({ ...current, [docKey]: '' }));

    this.ragApi.getCharacterReferenceImages(docKey).subscribe({
      next: (response) => {
        this.drawerCharactersByDocKey.update((current) => ({
          ...current,
          [docKey]: Array.isArray(response.characters) ? response.characters : []
        }));
        this.drawerCharacterLoadingByDocKey.update((current) => ({ ...current, [docKey]: false }));
      },
      error: (err) => {
        const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
        const backendMessage =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
        this.drawerCharactersByDocKey.update((current) => ({ ...current, [docKey]: [] }));
        this.drawerCharacterLoadingByDocKey.update((current) => ({ ...current, [docKey]: false }));
        this.drawerCharacterErrorByDocKey.update((current) => ({
          ...current,
          [docKey]: `Failed to load characters (${status}): ${backendMessage}`
        }));
      }
    });
  }
}
