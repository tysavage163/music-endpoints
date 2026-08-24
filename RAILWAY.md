# Railway deployment

Deploy this repository as two Railway services from the repository root. Do not deploy the `lib/*` packages as services; they are shared workspace libraries.

## API service

Build command:

```text
pnpm --filter @workspace/api-server build
```

Start command:

```text
pnpm --dir artifacts/api-server start
```

The API listens on Railway's injected `PORT` and binds to `0.0.0.0`. No `DATABASE_URL` is required by the current API routes.

## UI service

Set this service variable before deployment:

```text
VITE_API_URL=https://<your-api-service-domain>
```

Build command:

```text
pnpm --filter @workspace/music-ui build
```

Start command:

```text
pnpm --dir artifacts/music-ui start
```

`VITE_API_URL` must be the API service origin only, without `/api`; the application appends `/api` itself. For local development, leave it unset and Vite uses its `/api` proxy.

## Railway settings

- Keep both services' root directory set to `/` so pnpm can see `pnpm-workspace.yaml` and `pnpm-lock.yaml`.
- Use watch paths so the API watches `/artifacts/api-server/**` and the UI watches `/artifacts/music-ui/**` plus shared `/lib/**`.
- Generate a public domain for the API first, then place that domain in the UI service's `VITE_API_URL` variable and redeploy the UI. Vite embeds this value during the UI build.
