import { HttpClient } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { timeout } from 'rxjs';

@Component({
  selector: 'app-import',
  imports: [FormsModule],
  templateUrl: './import.html',
  styleUrl: './import.scss'
})
export class ImportComponent {
  private readonly ingestUrl = '/api/rag/ingest';
  docKey = '';
  selectedFile: File | null = null;
  loading = signal(false);
  message = signal('');

  constructor(private http: HttpClient) {}

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] ?? null;
    this.message.set('');
  }

  submit(): void {
    const docKey = this.docKey.trim();

    if (!docKey) {
      this.message.set('docKey is required.');
      return;
    }

    if (!this.selectedFile) {
      this.message.set('Please select a PDF file.');
      return;
    }

    const formData = new FormData();
    formData.append('file', this.selectedFile, this.selectedFile.name);

    this.loading.set(true);
    this.http
      .post(this.ingestUrl, formData, { params: { docKey } })
      .pipe(timeout(120000))
      .subscribe({
      next: () => {
        this.message.set('File ingested successfully.');
        this.loading.set(false);
      },
      error: (err) => {
        if (err?.name === 'TimeoutError') {
          this.message.set('Ingest timed out after 120s. Backend is taking too long or is unreachable.');
          this.loading.set(false);
          return;
        }
        const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
        const backendMessage =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
        this.message.set(`Ingest failed (${status}): ${backendMessage}`);
        this.loading.set(false);
      }
      });
  }
}
