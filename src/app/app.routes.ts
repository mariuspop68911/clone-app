import { BooksBrowseComponent } from './features/books-browse';
import { BookReaderComponent } from './features/book-reader';
import { BooksSearchComponent } from './features/books-search';
import { Routes } from '@angular/router';
import { DocumentDetailsComponent } from './features/document-details';
import { DocumentChatComponent } from './features/document-chat';
import { DocumentsComponent } from './features/documents';
import { ImportComponent } from './features/import';
import { StorySourceBrowseComponent } from './features/story-source-browse';
import { TtsOpenAiComponent } from './features/tts-openai';

export const routes: Routes = [
  { path: '', redirectTo: 'books', pathMatch: 'full' },
  { path: 'books', component: BooksSearchComponent },
  { path: 'browse', component: BooksBrowseComponent },
  { path: 'browse-gutenberg', component: StorySourceBrowseComponent },
  { path: 'books/:editionId', component: BookReaderComponent },
  { path: 'import', component: ImportComponent },
  { path: 'tts/openai', component: TtsOpenAiComponent },
  { path: 'documents', component: DocumentsComponent },
  { path: 'documents/:docKey/chat', component: DocumentChatComponent },
  { path: 'documents/:docKey', component: DocumentDetailsComponent },
  { path: '**', redirectTo: 'books' }
];
