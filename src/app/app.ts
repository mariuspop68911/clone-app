import { isPlatformBrowser } from '@angular/common';
import { Component, Inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { RagApiService, RagDocumentResponse } from './core/api/rag-api.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  drawerDocs = signal<RagDocumentResponse[]>([]);
  drawerLoading = signal(false);

  constructor(
    private readonly ragApi: RagApiService,
    @Inject(PLATFORM_ID) private readonly platformId: object
  ) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this.loadDrawerDocs();
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
}
