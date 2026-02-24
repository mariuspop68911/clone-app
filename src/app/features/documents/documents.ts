import { isPlatformBrowser } from '@angular/common';
import { Component, Inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RagApiService, RagDocumentResponse } from '../../core/api/rag-api.service';

@Component({
  selector: 'app-documents',
  imports: [RouterLink],
  templateUrl: './documents.html',
  styleUrl: './documents.scss'
})
export class DocumentsComponent implements OnInit {
  docs = signal<RagDocumentResponse[]>([]);
  loading = signal(false);
  message = signal('');

  constructor(
    private readonly ragApi: RagApiService,
    @Inject(PLATFORM_ID) private readonly platformId: object
  ) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this.loadDocuments();
  }

  refresh(): void {
    this.loadDocuments();
  }

  displayTitle(doc: RagDocumentResponse, index: number): string {
    const key = doc['docKey'];
    if (typeof key === 'string' && key.trim()) {
      return key;
    }
    return `Document ${index + 1}`;
  }

  displayMeta(doc: RagDocumentResponse): string {
    const parts: string[] = [];
    if (typeof doc['documentId'] === 'number') {
      parts.push(`#${doc['documentId']}`);
    }
    if (typeof doc['fileName'] === 'string' && doc['fileName'].trim()) {
      parts.push(doc['fileName']);
    }
    if (typeof doc['createdAt'] === 'string' && doc['createdAt'].trim()) {
      parts.push(doc['createdAt']);
    }
    return parts.join(' | ');
  }

  docKeyForRoute(doc: RagDocumentResponse): string | null {
    const key = doc['docKey'];
    if (typeof key === 'string' && key.trim()) {
      return key.trim();
    }
    return null;
  }

  private loadDocuments(): void {
    this.loading.set(true);
    this.message.set('');

    this.ragApi.listDocuments().subscribe({
      next: (docs) => {
        this.docs.set(docs ?? []);
        if (!docs?.length) {
          this.message.set('No documents found.');
        }
        this.loading.set(false);
      },
      error: (err) => {
        const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
        const backendMessage =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
        this.message.set(`Loading documents failed (${status}): ${backendMessage}`);
        this.loading.set(false);
      }
    });
  }
}
