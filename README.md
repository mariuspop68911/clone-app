# CloneApp

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.1.4.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4201/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Cloud Run

The Dockerfile builds the Angular SSR app in a build stage, installs only production dependencies in the runtime stage, and starts the compiled server with `npm start`. The SSR server reads Cloud Run's `PORT` environment variable and defaults to `8080` in the container.

## Container Publishing

The `Build And Publish Frontend Container Images` GitHub Actions workflow mirrors the backend container workflow. It runs on pushes to `main` and on manual dispatch, builds immutable images tagged as `sha-<12-char-sha>`, then pushes staging and production images to separate Google Cloud projects.

The staging image is built with the Angular `staging` configuration. The production image is built with the Angular `production` configuration.

Configure these GitHub repository secrets, matching the backend repository:

```text
GCP_WORKLOAD_IDENTITY_PROVIDER
GCP_CI_SERVICE_ACCOUNT
```

The workflow publishes to these Artifact Registry targets:

```text
europe-central2-docker.pkg.dev/documentor-staging/documentor-container/clone-app:sha-<shortsha>
europe-central2-docker.pkg.dev/documentor-production-494707/documentor-containers/clone-app:sha-<shortsha>
```

The reusable Cloud Build config can also be run directly:

```bash
gcloud builds submit . \
  --project documentor-staging \
  --config cloudbuild.image.yaml \
  --substitutions _REGION=europe-central2,_ARTIFACT_REGISTRY_REPOSITORY=documentor-container,_IMAGE_NAME=clone-app,_IMAGE_TAG=sha-SHORTSHA,_BUILD_CONFIGURATION=staging
```

Example staging deploy:

```bash
gcloud run deploy clone-app-staging --project documentor-staging --image europe-central2-docker.pkg.dev/documentor-staging/documentor-container/clone-app:sha-SHORTSHA --region europe-central2 --allow-unauthenticated
```

## Staging Cloud Run Deployment

The `Deploy Staging Frontend Cloud Run Service` workflow deploys the staging frontend image from Artifact Registry to Cloud Run after `Build And Publish Frontend Container Images` succeeds on `main`. It can also be run manually with an immutable image tag such as `sha-abc123def456`.

It deploys:

```text
Project: documentor-staging
Region: europe-central2
Service: documentor-staging-frontend
Image: europe-central2-docker.pkg.dev/documentor-staging/documentor-container/clone-app:sha-<shortsha>
Access: unauthenticated/public
Port: 8080
```

Required GitHub repository secrets:

```text
GCP_WORKLOAD_IDENTITY_PROVIDER
GCP_CI_SERVICE_ACCOUNT
```

Optional GitHub repository or staging environment variables:

```text
STAGING_API_ORIGIN
STAGING_GOOGLE_CLIENT_ID
```

The Angular SSR server currently only needs Cloud Run's automatic `PORT` variable at runtime. `STAGING_API_ORIGIN` and `STAGING_GOOGLE_CLIENT_ID` are passed to Cloud Run when present so the service configuration records the intended staging values, but the browser app still uses the Angular environment values compiled into the image.

Example production deploy:

```bash
gcloud run deploy clone-app --project documentor-production-494707 --image europe-central2-docker.pkg.dev/documentor-production-494707/documentor-containers/clone-app:sha-SHORTSHA --region europe-central2 --allow-unauthenticated
```

The frontend uses relative `/api` URLs in production, so keep routing/proxying aligned with the backend deployment.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
