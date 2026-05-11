import { environment } from '../../../environments/environment';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function ensureLeadingSlash(value: string): string {
  return value.startsWith('/') ? value : `/${value}`;
}

export const appEnvironment = environment;

export function buildApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const baseUrl = trimTrailingSlash(appEnvironment.apiBaseUrl.trim());
  const normalizedPath = ensureLeadingSlash(path.trim());
  return `${baseUrl}${normalizedPath}`;
}

export function includeApiCredentials(): boolean {
  return appEnvironment.apiCredentialsMode === 'include';
}

export function isConfiguredApiRequest(url: string): boolean {
  const apiBaseUrl = trimTrailingSlash(appEnvironment.apiBaseUrl.trim());
  return url === apiBaseUrl || url.startsWith(`${apiBaseUrl}/`);
}

export function isConfiguredAuthRequest(url: string): boolean {
  const authBaseUrl = buildApiUrl('/auth');
  return url === authBaseUrl || url.startsWith(`${authBaseUrl}/`);
}

export function isConfiguredRefreshRequest(url: string): boolean {
  return url === buildApiUrl('/auth/refresh');
}
