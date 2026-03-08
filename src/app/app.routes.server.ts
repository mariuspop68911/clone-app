import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'tts/openai',
    renderMode: RenderMode.Server
  },
  {
    path: 'documents/:docKey/characters',
    renderMode: RenderMode.Server
  },
  {
    path: 'documents/:docKey/characters-images',
    renderMode: RenderMode.Server
  },
  {
    path: 'documents/:docKey/comic-page',
    renderMode: RenderMode.Server
  },
  {
    path: 'documents/:docKey/events',
    renderMode: RenderMode.Server
  },
  {
    path: 'documents/:docKey/chat',
    renderMode: RenderMode.Server
  },
  {
    path: 'documents/:docKey/summaries/:summaryId',
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
