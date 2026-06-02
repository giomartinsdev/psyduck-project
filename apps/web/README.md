# Web App

Next.js 14 e-commerce frontend with the App Router. Communicates with the Apollo Gateway via GraphQL. Supports both a live federated backend and a local mock mode for UI development without running any services.

## Port

`3000`

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| UI | React 19 |
| Data fetching | Apollo Client (client) + `graphql-request` (server/SSR) |
| Type generation | GraphQL Codegen (`@graphql-codegen/client-preset`) |
| Testing | Playwright (e2e) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_GATEWAY_URL` | `http://localhost:4000/graphql` | Browser-facing Gateway URL |
| `GATEWAY_URL` | `http://localhost:4000/graphql` | Server-side Gateway URL (used by SSR/RSC) |
| `NEXT_PUBLIC_USE_MOCKS` | `false` | Set to `true` to use local mock data instead of the Gateway |

In Docker Compose, `GATEWAY_URL` is set to `http://gateway:4000/graphql` (internal Docker hostname) while `NEXT_PUBLIC_GATEWAY_URL` stays at `http://localhost:4000/graphql` so browser requests work through the host port mapping.

## How to Run

### With Docker Compose (recommended)

```bash
docker compose up -d web
```

Requires the `gateway` service to be running.

### Local Dev (live backend)

```bash
# Ensure the full backend stack is running
docker compose up -d

cd apps/web
npm install
npx next dev -p 3000
# → http://localhost:3000
```

### Local Dev (mock mode — no backend needed)

```bash
cd apps/web
NEXT_PUBLIC_USE_MOCKS=true npx next dev -p 3000
```

Mock data is defined in `src/mocks/` and mirrors the shape of the GraphQL responses.

### Build for Production

```bash
cd apps/web
npm run build
npm start
```

## GraphQL Code Generation

TypeScript types for all GraphQL operations are auto-generated from the Gateway schema.

```bash
# One-time generation
cd apps/web && npm run codegen

# Watch mode (regenerates on .graphql file changes)
cd apps/web && npm run codegen:watch
```

Generated files live in `src/gql/`. Commit them — they are required for the TypeScript build to pass.

The codegen config expects the Gateway to be running at `NEXT_PUBLIC_GATEWAY_URL`. If you're running in mock mode, run codegen against the live stack first.

## App Structure

```
apps/web/src/
├── app/
│   ├── layout.tsx            Root layout, Apollo Provider
│   ├── page.tsx              Home / landing page
│   ├── catalogue/            Product listing page
│   ├── cart/                 Shopping cart
│   ├── checkout/             Checkout flow
│   ├── orders/               Order history
│   ├── ai-chat/              AI Companion chat interface
│   └── auth/                 Sign-in / sign-up pages
├── lib/
│   ├── apollo-client.ts      Client-side Apollo Client setup
│   └── graphql-server.ts     Server-side GraphQL client (for RSC/SSR)
├── gql/                      Generated GraphQL types (do not edit manually)
├── mocks/                    Mock data for NEXT_PUBLIC_USE_MOCKS=true
└── components/               Shared UI components
```

## Authentication in the Frontend

After a successful sign-in the session token returned by the Users service is stored (e.g., in a cookie or `localStorage`). Every Apollo Client request includes it in the `Authorization: Bearer <token>` header via the auth link configured in `src/lib/apollo-client.ts`.

The Gateway receives the token and forwards it to each subgraph for validation.

## E2E Tests

```bash
cd apps/web

# Run Playwright tests (requires a running dev server)
npx playwright test

# Run with UI (headed mode)
npx playwright test --ui
```

Playwright config is at `apps/web/playwright.config.ts`.
