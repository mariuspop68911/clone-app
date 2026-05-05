import { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: true,
  apiBaseUrl: '/api',
  apiCredentialsMode: 'include',
  googleClientId: '356853868531-vg70bg4jtj1d2pcgv3jk6t0g584nq2cf.apps.googleusercontent.com',
  auth: {
    expectedIssuer: null,
    expectedAudience: null
  },
  polling: {
    jobStatusMs: 1500,
    ingestStatusMs: 1000
  }
};
