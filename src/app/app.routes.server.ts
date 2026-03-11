import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'tts/openai',
    renderMode: RenderMode.Server
  },
  {
    path: 'documents/:docKey/comic-slides',
    renderMode: RenderMode.Server
  },
  {
    path: 'documents/:docKey/pipeline',
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
