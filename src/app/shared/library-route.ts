import { ActivatedRouteSnapshot } from '@angular/router';

const defaultLibraryBasePath = 'documents2';
const defaultLibraryTitle = 'My Documents';

export function resolveLibraryBasePath(snapshot: ActivatedRouteSnapshot): string {
  const configuredBasePath = snapshot.data['libraryBasePath'];
  if (typeof configuredBasePath === 'string' && configuredBasePath.trim()) {
    return configuredBasePath.trim();
  }

  const firstPathSegment = snapshot.url[0]?.path?.trim();
  return firstPathSegment || defaultLibraryBasePath;
}

export function resolveLibraryTitle(snapshot: ActivatedRouteSnapshot): string {
  const configuredTitle = snapshot.data['libraryTitle'];
  if (typeof configuredTitle === 'string' && configuredTitle.trim()) {
    return configuredTitle.trim();
  }

  return defaultLibraryTitle;
}
