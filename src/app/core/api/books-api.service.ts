import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface BookSearchResult {
  id: string;
  title: string;
  authors: string[];
  firstPublishYear: number | null;
  coverUrl: string | null;
  editionCount: number | null;
  totalPages: number | null;
  languages: string[];
  editionId: string;
  workKey: string | null;
}

export interface BrowseBooksCategory {
  key: string;
  label: string;
  count: number;
  books: BookSearchResult[];
}

export interface BrowseBooksResponse {
  categoryCount: number;
  booksPerCategory: number;
  categories: BrowseBooksCategory[];
}

export interface BrowseCategoryPageResponse {
  key: string;
  label: string;
  offset: number;
  limit: number;
  count: number;
  hasMore: boolean;
  books: BookSearchResult[];
}

export interface BookReaderData {
  editionId: string;
  title: string;
  authors: string[];
  coverUrl: string | null;
  totalPages: number | null;
  embedUrl: string | null;
  readUrl: string | null;
  textUrl: string | null;
  pdfUrl: string | null;
  epubUrl: string | null;
}

export interface BookImportPreviewPage {
  pageNumber: number;
  leafNumber: number;
  pageType: string | null;
  imageUrl: string;
}

export interface BookImportPreview {
  editionId: string;
  title: string;
  archiveIdentifier: string | null;
  pages: BookImportPreviewPage[];
}

@Injectable({
  providedIn: 'root'
})
export class BooksApiService {
  private readonly baseUrl = '/api/books';

  constructor(private readonly http: HttpClient) {}

  searchBooks(query: string, limit = 8): Observable<BookSearchResult[]> {
    const params = new HttpParams()
      .set('q', query.trim())
      .set('limit', limit);

    return this.http.get<BookSearchResult[]>(`${this.baseUrl}/search`, { params });
  }

  browseReadableBooks(limit = 20): Observable<BrowseBooksResponse> {
    const params = new HttpParams().set('limit', limit);
    return this.http.get<BrowseBooksResponse>(`${this.baseUrl}/browse`, { params });
  }

  browseCategoryPage(
    categoryKey: string,
    limit = 10,
    offset = 0
  ): Observable<BrowseCategoryPageResponse> {
    const params = new HttpParams()
      .set('limit', limit)
      .set('offset', offset);

    return this.http.get<BrowseCategoryPageResponse>(
      `${this.baseUrl}/browse/${encodeURIComponent(categoryKey.trim())}`,
      { params }
    );
  }

  getBookReader(editionId: string): Observable<BookReaderData> {
    return this.http.get<BookReaderData>(`${this.baseUrl}/${encodeURIComponent(editionId.trim())}`);
  }

  getBookImportFile(editionId: string): Observable<HttpResponse<Blob>> {
    return this.http.get(`${this.baseUrl}/${encodeURIComponent(editionId.trim())}/import-file`, {
      observe: 'response',
      responseType: 'blob'
    });
  }

  getBookImportPreview(editionId: string): Observable<BookImportPreview> {
    return this.http.get<BookImportPreview>(`${this.baseUrl}/${encodeURIComponent(editionId.trim())}/import-preview`);
  }
}
