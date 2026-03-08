import { Routes } from '@angular/router';
import { DocumentCharactersComponent } from './features/document-characters';
import { DocumentDetailsComponent } from './features/document-details';
import { DocumentEventsComponent } from './features/document-events';
import { DocumentChatComponent } from './features/document-chat';
import { CharacterImagesComponent } from './features/character-images';
import { DocumentsComponent } from './features/documents';
import { ImportComponent } from './features/import';
import { SummaryDetailsComponent } from './features/summary-details';

export const routes: Routes = [
  { path: '', redirectTo: 'documents', pathMatch: 'full' },
  { path: 'import', component: ImportComponent },
  { path: 'documents', component: DocumentsComponent },
  { path: 'documents/:docKey', component: DocumentDetailsComponent },
  { path: 'documents/:docKey/characters', component: DocumentCharactersComponent },
  { path: 'documents/:docKey/characters-images', component: CharacterImagesComponent },
  { path: 'documents/:docKey/events', component: DocumentEventsComponent },
  { path: 'documents/:docKey/chat', component: DocumentChatComponent },
  { path: 'documents/:docKey/summaries/:summaryId', component: SummaryDetailsComponent },
  { path: '**', redirectTo: 'documents' }
];
