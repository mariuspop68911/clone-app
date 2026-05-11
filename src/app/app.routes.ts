import { Routes } from '@angular/router';
import { authGuard, authMatchGuard } from './core/auth/auth.guard';
import { DocumentDetailsComponent } from './features/document-details';
import { DocumentChatComponent } from './features/document-chat';
import { DocumentSeriesBuildComponent } from './features/document-series-build';
import { DocumentsComponent } from './features/documents';
import { ImportComponent } from './features/import';
import { LoginComponent } from './features/login';
import { StorySourceBrowseComponent } from './features/story-source-browse';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: '',
    canMatch: [authMatchGuard],
    canActivateChild: [authGuard],
    children: [
      { path: '', redirectTo: 'documents', pathMatch: 'full' },
      { path: 'browse-gutenberg', component: StorySourceBrowseComponent },
      { path: 'import', component: ImportComponent },
      {
        path: 'documents',
        component: DocumentsComponent,
        data: { libraryBasePath: 'documents', libraryTitle: 'Your Document Library' }
      },
      {
        path: 'documents/:docKey/chat',
        component: DocumentChatComponent,
        data: { libraryBasePath: 'documents', libraryTitle: 'Your Document Library' }
      },
      {
        path: 'documents/:docKey',
        component: DocumentDetailsComponent,
        data: { libraryBasePath: 'documents', libraryTitle: 'Your Document Library' }
      },
      {
        path: 'documents2',
        component: DocumentsComponent,
        data: { libraryBasePath: 'documents2', libraryTitle: 'Your Series Library' }
      },
      {
        path: 'documents2/:docKey',
        component: DocumentSeriesBuildComponent,
        data: { libraryBasePath: 'documents2', libraryTitle: 'Your Series Library' }
      }
    ]
  },
  { path: '**', redirectTo: 'login' }
];
