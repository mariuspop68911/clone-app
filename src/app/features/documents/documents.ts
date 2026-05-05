import { isPlatformBrowser } from '@angular/common';
import { Component, Inject, OnDestroy, OnInit, PLATFORM_ID, computed, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { RagApiService, RagDocumentResponse } from '../../core/api/rag-api.service';
import { IngestProgressService } from '../import/ingest-progress.service';
import { DocumentCoverCacheService } from '../../shared/document-cover-cache.service';
import { resolveLibraryBasePath, resolveLibraryTitle } from '../../shared/library-route';

@Component({
  selector: 'app-documents',
  imports: [RouterLink],
  templateUrl: './documents.html',
  styleUrl: './documents.scss'
})
export class DocumentsComponent implements OnInit, OnDestroy {
  private static readonly documentsRefreshEvent = 'codex:documents-refresh';
  private readonly onDocumentsRefreshBound = () => this.loadDocuments();
  docs = signal<RagDocumentResponse[]>([]);
  loading = signal(false);
  message = signal('');
  deletingDocId = signal<number | null>(null);
  readonly mergedDocs = computed(() => this.mergeTrackedDocs(this.docs()));

  constructor(
    private readonly route: ActivatedRoute,
    private readonly ragApi: RagApiService,
    private readonly ingestProgress: IngestProgressService,
    private readonly documentCoverCache: DocumentCoverCacheService,
    @Inject(PLATFORM_ID) private readonly platformId: object
  ) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    window.addEventListener(DocumentsComponent.documentsRefreshEvent, this.onDocumentsRefreshBound);
    this.loadDocuments();
  }

  ngOnDestroy(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    window.removeEventListener(DocumentsComponent.documentsRefreshEvent, this.onDocumentsRefreshBound);
  }

  displayTitle(doc: RagDocumentResponse, index: number): string {
    const key = doc['docKey'];
    if (typeof key === 'string' && key.trim()) {
      return key;
    }
    return `Your document ${index + 1}`;
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

  isLearningDoc(doc: RagDocumentResponse): boolean {
    const mode = typeof doc['mode'] === 'string' ? doc['mode'].trim().toLowerCase() : '';
    return mode.includes('learning') || mode.includes('action') || mode.includes('extraction');
  }

  isStoryDoc(doc: RagDocumentResponse): boolean {
    const mode = typeof doc['mode'] === 'string' ? doc['mode'].trim().toLowerCase() : '';
    return !mode || mode.includes('story');
  }

  storyDocs(): RagDocumentResponse[] {
    return this.mergedDocs().filter((doc) => this.isStoryDoc(doc));
  }

  learningDocs(): RagDocumentResponse[] {
    return this.mergedDocs().filter((doc) => this.isLearningDoc(doc));
  }

  libraryBasePath(): string {
    return resolveLibraryBasePath(this.route.snapshot);
  }

  libraryTitle(): string {
    return resolveLibraryTitle(this.route.snapshot);
  }

  coverUrl(doc: RagDocumentResponse): string {
    const backendCoverUrl = typeof doc.coverUrl === 'string' ? doc.coverUrl.trim() : '';
    if (backendCoverUrl) {
      return backendCoverUrl;
    }

    return this.documentCoverCache.coverUrl(this.docKeyForRoute(doc));
  }

  docKeyForRoute(doc: RagDocumentResponse): string | null {
    const key = doc['docKey'];
    if (typeof key === 'string' && key.trim()) {
      return key.trim();
    }
    return null;
  }

  documentRoute(doc: RagDocumentResponse): string[] | null {
    const docKey = this.docKeyForRoute(doc);
    if (!docKey) {
      return null;
    }

    return ['/', this.libraryBasePath(), docKey];
  }

  deleteDocument(event: Event, doc: RagDocumentResponse): void {
    event.preventDefault();
    event.stopPropagation();

    const docKey = this.docKeyForRoute(doc);
    const docId = this.documentId(doc);
    if (!docKey || docId === null || this.deletingDocId() !== null) {
      return;
    }

    this.deletingDocId.set(docId);
    this.message.set('');

    this.ragApi.deleteDocument(docId).subscribe({
      next: () => {
        this.docs.update((current) =>
          current.filter((entry) => this.documentId(entry) !== docId)
        );
        this.ingestProgress.stopTrackingDoc(docKey);
        this.documentCoverCache.forget(docKey);
        this.deletingDocId.set(null);
        this.message.set(`Removed "${docKey}" from your library.`);
        this.dispatchDocumentsRefresh();
      },
      error: (err) => {
        const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
        const backendMessage =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
        this.deletingDocId.set(null);
        this.message.set(`Deleting document failed (${status}): ${backendMessage}`);
      }
    });
  }

  documentId(doc: RagDocumentResponse): number | null {
    const value =
      typeof doc.documentId === 'number'
        ? doc.documentId
        : typeof doc.id === 'number'
          ? doc.id
          : null;
    return value !== null && Number.isFinite(value) ? value : null;
  }

  documentStatusText(doc: RagDocumentResponse): string {
    const docKey = this.docKeyForRoute(doc);
    if (!docKey) {
      return '';
    }

    const tracked = this.ingestProgress.trackedStatus(docKey);
    if (!tracked?.usable) {
      return '';
    }

    if (tracked.backgroundProcessing) {
      return 'Your first chapter is ready. More chapters are still processing for this document.';
    }

    if (tracked.done) {
      return 'Ready in your library';
    }

    return '';
  }

  isDocumentProcessing(doc: RagDocumentResponse): boolean {
    const docKey = this.docKeyForRoute(doc);
    return !!docKey && this.ingestProgress.trackedStatus(docKey)?.backgroundProcessing === true;
  }

  private loadDocuments(): void {
    this.loading.set(true);
    this.message.set('');

    this.ragApi.listDocuments().subscribe({
      next: (docs) => {
        this.docs.set(docs ?? []);
        if (!(docs?.length ?? 0) && this.ingestProgress.trackedStatusesSnapshot().every((status) => !status.usable)) {
          this.message.set('No documents found in your library yet.');
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

  private dispatchDocumentsRefresh(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    window.dispatchEvent(new CustomEvent(DocumentsComponent.documentsRefreshEvent));
  }

  private mergeTrackedDocs(docs: RagDocumentResponse[]): RagDocumentResponse[] {
    const merged = [...docs];
    const existingDocKeys = new Set(
      docs
        .map((doc) => this.docKeyForRoute(doc))
        .filter((docKey): docKey is string => !!docKey)
    );

    for (const tracked of this.ingestProgress.trackedStatusesSnapshot()) {
      const docKey = tracked.docKey?.trim();
      if (!docKey || !tracked.usable || existingDocKeys.has(docKey)) {
        continue;
      }

      merged.unshift({
        docKey,
        documentId: tracked.documentId,
        id: tracked.documentId,
        mode: tracked.mode
      });
      existingDocKeys.add(docKey);
    }

    return merged;
  }
}
