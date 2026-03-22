import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'tts/openai',
    renderMode: RenderMode.Server
  },
  {
    path: 'books/:editionId',
    renderMode: RenderMode.Server
  },
  {
    path: 'documents/:docKey/chat',
    renderMode: RenderMode.Server
  },
  {
    path: 'documents/:docKey',
    renderMode: RenderMode.Server
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
