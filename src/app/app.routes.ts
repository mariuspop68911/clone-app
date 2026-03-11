import { Routes } from '@angular/router';
import { DocumentDetailsComponent } from './features/document-details';
import { DocumentChatComponent } from './features/document-chat';
import { ComicPageComponent } from './features/comic-page';
import { DocumentsComponent } from './features/documents';
import { ImportComponent } from './features/import';
import { PipelineComponent } from './features/pipeline';
import { TtsOpenAiComponent } from './features/tts-openai';

export const routes: Routes = [
  { path: '', redirectTo: 'documents', pathMatch: 'full' },
  { path: 'import', component: ImportComponent },
  { path: 'tts/openai', component: TtsOpenAiComponent },
  { path: 'documents', component: DocumentsComponent },
  { path: 'documents/:docKey/comic-slides', component: ComicPageComponent },
  { path: 'documents/:docKey/pipeline', component: PipelineComponent },
  { path: 'documents/:docKey/chat', component: DocumentChatComponent },
  { path: 'documents/:docKey', component: DocumentDetailsComponent },
  { path: '**', redirectTo: 'documents' }
];
