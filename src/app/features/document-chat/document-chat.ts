import { Component, Input, OnChanges, SimpleChanges, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { RagApiService } from '../../core/api/rag-api.service';
import { resolveLibraryBasePath } from '../../shared/library-route';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

@Component({
  selector: 'app-document-chat',
  imports: [FormsModule, RouterLink],
  templateUrl: './document-chat.html',
  styleUrl: './document-chat.scss'
})
export class DocumentChatComponent {
  @Input() embedded = false;
  @Input() docKeyInput = '';
  @Input() languageCode = 'en';
  @Input() requestedQuestion = '';
  @Input() requestKey = 0;
  docKey = signal('');
  input = '';
  loading = signal(false);
  message = signal('');
  messages = signal<ChatMessage[]>([]);

  constructor(
    private readonly route: ActivatedRoute,
    private readonly ragApi: RagApiService
  ) {
    this.route.paramMap.subscribe((params) => {
      this.docKey.set(params.get('docKey') ?? '');
      const initialQuestion = this.route.snapshot.queryParamMap.get('q')?.trim() ?? '';
      this.message.set('');
      this.messages.set([
        {
          role: 'assistant',
          text: 'Ask a question about this document and I will answer from indexed content.'
        }
      ]);
      this.input = initialQuestion;
      if (initialQuestion) {
        setTimeout(() => this.send(), 0);
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes['requestKey'] &&
      !changes['requestKey'].firstChange &&
      this.requestedQuestion.trim()
    ) {
      queueMicrotask(() => this.submitQuestion(this.requestedQuestion));
    }
  }

  ask(question: string): void {
    this.submitQuestion(question);
  }

  libraryBasePath(): string {
    return resolveLibraryBasePath(this.route.snapshot);
  }

  send(): void {
    this.submitQuestion(this.input);
  }

  private submitQuestion(rawQuestion: string): void {
    const question = rawQuestion.trim();
    const key = this.docKeyInput.trim() || this.docKey().trim();

    if (!key) {
      this.message.set('Missing document key.');
      return;
    }
    if (!question || this.loading()) {
      return;
    }

    this.message.set('');
    this.messages.update((current) => [...current, { role: 'user', text: question }]);
    this.input = '';
    this.loading.set(true);

    this.ragApi
      .askQuestion({
        question,
        docKey: key,
        topK: 5,
        languageCode: this.languageCode.trim().toLowerCase() || 'en'
      })
      .subscribe({
      next: (response) => {
        const answer =
          typeof response?.answer === 'string' && response.answer.trim()
            ? response.answer
            : 'No answer text was returned.';
        this.messages.update((current) => [...current, { role: 'assistant', text: answer }]);
        this.loading.set(false);
      },
      error: (err) => {
        const status = err?.status ? `HTTP ${err.status}` : 'Request failed';
        const backendMessage =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message ?? err?.error?.error ?? err?.message ?? 'unknown error';
        this.message.set(`Ask failed (${status}): ${backendMessage}`);
        this.messages.update((current) => [
          ...current,
          { role: 'assistant', text: `I could not answer due to an error: ${backendMessage}` }
        ]);
        this.loading.set(false);
      }
    });
  }

  onComposerKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }
    event.preventDefault();
    this.send();
  }
}
