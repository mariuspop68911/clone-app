import { Routes } from '@angular/router';
import { DocumentCharactersComponent } from './features/document-characters';
import { DocumentDetailsComponent } from './features/document-details';
import { DocumentEventsComponent } from './features/document-events';
import { DocumentChatComponent } from './features/document-chat';
import { CharacterImagesComponent } from './features/character-images';
import { ComicPageComponent } from './features/comic-page';
import { DocumentsComponent } from './features/documents';
import { ImportComponent } from './features/import';
import { SummaryDetailsComponent } from './features/summary-details';
import { TtsOpenAiComponent } from './features/tts-openai';

export const routes: Routes = [
  { path: '', redirectTo: 'documents', pathMatch: 'full' },
  { path: 'import', component: ImportComponent },
  { path: 'tts/openai', component: TtsOpenAiComponent },
  { path: 'documents', component: DocumentsComponent },
  { path: 'documents/:docKey/characters', component: DocumentCharactersComponent },
  { path: 'documents/:docKey/characters-images', component: CharacterImagesComponent },
  { path: 'documents/:docKey/comic-page', component: ComicPageComponent },
  { path: 'documents/:docKey/events', component: DocumentEventsComponent },
  { path: 'documents/:docKey/chat', component: DocumentChatComponent },
  { path: 'documents/:docKey/summaries/:summaryId', component: SummaryDetailsComponent },
  { path: 'documents/:docKey', component: DocumentDetailsComponent },
  { path: '**', redirectTo: 'documents' }
];
