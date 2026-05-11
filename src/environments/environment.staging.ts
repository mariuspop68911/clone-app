import { AppEnvironment } from './environment.model';

const stagingBackend = {
  projectId: 'documentor-staging',
  region: 'europe-central2',
  serviceName: 'documentor-staging-api'
} as const;

const stagingApiBaseUrl =
  'https://documentor-staging-api-509998383418.europe-central2.run.app/api';

// These must match the backend's staging JWT issuer/audience env vars exactly.
const stagingJwtIssuer = 'demo-clone';
const stagingJwtAudience = 'demo-api';

export const environment: AppEnvironment = {
  production: true,
  apiBaseUrl: stagingApiBaseUrl,
  apiCredentialsMode: 'include',
  googleClientId: '356853868531-vg70bg4jtj1d2pcgv3jk6t0g584nq2cf.apps.googleusercontent.com',
  auth: {
    expectedIssuer: stagingJwtIssuer,
    expectedAudience: stagingJwtAudience
  },
  polling: {
    jobStatusMs: 1500,
    ingestStatusMs: 1000
  }
};
