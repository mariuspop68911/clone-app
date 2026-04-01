import { Routes } from '@angular/router';
import { DocumentDetailsComponent } from './features/document-details';
import { DocumentChatComponent } from './features/document-chat';
import { DocumentsComponent } from './features/documents';
import { ImportComponent } from './features/import';
import { StorySourceBrowseComponent } from './features/story-source-browse';

export const routes: Routes = [
  { path: '', redirectTo: 'documents', pathMatch: 'full' },
  { path: 'browse-gutenberg', component: StorySourceBrowseComponent },
  { path: 'import', component: ImportComponent },
  { path: 'documents', component: DocumentsComponent },
  { path: 'documents/:docKey/chat', component: DocumentChatComponent },
  { path: 'documents/:docKey', component: DocumentDetailsComponent },
  { path: '**', redirectTo: 'documents' }
];
