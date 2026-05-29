import { Routes } from '@angular/router';
import { authGuard, authMatchGuard } from './core/auth/auth.guard';
import { DocumentDetailsComponent } from './features/document-details';
import { DocumentChatComponent } from './features/document-chat';
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
      { path: '', redirectTo: 'documents2', pathMatch: 'full' },
      { path: 'browse-gutenberg', component: StorySourceBrowseComponent },
      { path: 'import', component: ImportComponent },
      {
        path: 'documents2',
        component: DocumentsComponent,
        data: { libraryBasePath: 'documents2', libraryTitle: 'My Documents' }
      },
      {
        path: 'documents2/:docKey/chat',
        component: DocumentChatComponent,
        data: { libraryBasePath: 'documents2', libraryTitle: 'My Documents' }
      },
      {
        path: 'documents2/:docKey',
        component: DocumentDetailsComponent,
        data: { libraryBasePath: 'documents2', libraryTitle: 'My Documents' }
      }
    ]
  },
  { path: '**', redirectTo: 'login' }
];
