# Psyduck Project

A federated e-commerce platform built with GraphQL Federation v2. The system is composed of four independent subgraphs — users, products, payments, and AI companion — unified behind a single Apollo Gateway endpoint.

## Architecture

```
Browser / Next.js (3000)
        │
        ▼
Apollo Gateway (4000)  ─── OAuth2/PKCE exchange for Companion ───┐
        │                                                          │
   ┌────┼────────────────────────────────────┐                    │
   ▼    ▼                  ▼                 ▼                    ▼
Users  Products         Payments          Companion AI (4004)
(4001)  (4002)          Go (4003)         Python/FastAPI
NestJS  Apollo          gqlgen            Strawberry + LangGraph
BetterAuth             Valkey streams     Ollama (host:11434)
PostgreSQL             PostgreSQL
                       Valkey
```

| Service | Port | Language | Purpose |
|---------|------|----------|---------|
| Gateway | 4000 | TypeScript / NestJS | Apollo Federation hub |
| Users | 4001 | TypeScript / NestJS + BetterAuth | Auth, identity, OIDC provider |
| Products | 4002 | TypeScript / Apollo Server | Product catalog (WooCommerce or mock) |
| Payments | 4003 | Go / gqlgen | Orders, async payment capture |
| Companion | 4004 | Python / FastAPI + LangGraph | AI shopping assistant |
| Web | 3000 | Next.js 14 | E-commerce frontend |
| PostgreSQL | 5432 | — | Users, Payments, Companion databases |
| Valkey | 6379 | — | Redis-compatible stream for async payments |
| WordPress | 8080 | — | Optional WooCommerce product backend |

## Prerequisites

- Docker and Docker Compose
- Node.js 20+ and npm (for local dev without Docker)
- Go 1.23+ (for local dev of the Payments service)
- Python 3.12+ (for local dev of the Companion service)
- [Ollama](https://ollama.com) with `llama3.2:3b` pulled (for the AI Companion)

```bash
# Pull the Ollama model once
ollama pull llama3.2:3b
```

## Quick Start (Docker)

```bash
# 1. Clone and enter the repo
git clone <repo-url> psyduck-project
cd psyduck-project

# 2. Bring up the full stack
docker compose up -d

# 3. Wait for all services to be healthy (takes ~2 min on first run)
docker compose ps

# 4. Open the app
open http://localhost:3000
```

All services start in dependency order:
`postgres` → `users` → `products` + `payments` + `companion` → `gateway` → `web`

WordPress starts in parallel but is optional — Products falls back to mock data if it is unavailable.

## Quick Start (Local Dev)

Run infrastructure containers only, then start services as Node/Go/Python processes.

```bash
# Step 1 — infrastructure
docker compose up -d postgres valkey

# Step 2 — install Node.js dependencies (all workspaces)
npm install

# Step 3 — run services (each in a separate terminal)
npm run dev:users       # terminal 1 → :4001
npm run dev:products    # terminal 2 → :4002
cd apps/payments-go && go run . &   # terminal 3 → :4003
cd apps/companion-py && uvicorn src.main:app --reload --port 4004 &  # terminal 4
npm run dev:gateway     # terminal 5 → :4000
cd apps/web && npx next dev -p 3000  # terminal 6 → :3000
```

## Services

| Service | README |
|---------|--------|
| Gateway | [apps/gateway/README.md](apps/gateway/README.md) |
| Users | [apps/users/README.md](apps/users/README.md) |
| Products | [apps/products/README.md](apps/products/README.md) |
| Payments (Go) | [apps/payments-go/README.md](apps/payments-go/README.md) |
| Companion AI | [apps/companion-py/README.md](apps/companion-py/README.md) |
| Web | [apps/web/README.md](apps/web/README.md) |
| Infrastructure | [infra/README.md](infra/README.md) |
| Load Testing | [load-test/README.md](load-test/README.md) |

## Authentication Overview

All requests carry a BetterAuth session token in the `Authorization: Bearer <token>` header.

- **Users, Products, Payments** — the Gateway forwards the session token directly. Each subgraph validates it by calling `GET /api/auth/get-session` on the Users service.
- **Companion AI** — the Gateway performs an OAuth2 Authorization Code + PKCE exchange server-side and injects the resulting access token. The Companion validates it via `/oauth2/userinfo`.

See [apps/users/README.md](apps/users/README.md) for detailed auth flows.

## Useful Commands

```bash
# Tail logs for a specific service
docker compose logs -f gateway

# Rebuild a single service after code changes
docker compose build users && docker compose up -d --no-deps users

# Run database migrations manually (Users subgraph)
cd apps/users && npm run migration:up

# GraphQL Codegen (regenerate TypeScript types for the Web app)
cd apps/web && npm run codegen

# Visualize the Nx project graph
npx nx graph

# Run k6 load tests
k6 run load-test/k6.js
```

## Monorepo Structure

```
psyduck-project/
├── apps/
│   ├── gateway/          TypeScript · NestJS · Apollo Gateway
│   ├── users/            TypeScript · NestJS · BetterAuth · MikroORM
│   ├── products/         TypeScript · Apollo Server standalone
│   ├── payments/         TypeScript stub (deprecated, replaced by payments-go)
│   ├── payments-go/      Go · gqlgen · PostgreSQL · Valkey
│   ├── companion/        TypeScript stub (deprecated, replaced by companion-py)
│   ├── companion-py/     Python · FastAPI · Strawberry · LangGraph
│   └── web/              Next.js 14 · Apollo Client · React 19
├── infra/                Docker init scripts
├── load-test/            k6 load test scenarios
├── specs/                Feature specifications
├── workflows/            SpecKit workflow docs
├── docker-compose.yml    Full stack definition
└── nx.json               Nx build system configuration
```
