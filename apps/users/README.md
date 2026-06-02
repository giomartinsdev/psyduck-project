# Users Subgraph

NestJS service that owns everything related to user identity: registration, login, session management, and OAuth2/OIDC token issuance. It exposes both a GraphQL Federation endpoint and a REST auth API via BetterAuth.

## Responsibilities

- User registration and credential-based authentication
- Session management with opaque Bearer tokens (BetterAuth)
- OAuth2 Authorization Server + OIDC Provider for the Companion AI service
- User aggregate persistence (PostgreSQL via MikroORM)
- Idempotency key scoping per user

## Port

`4001`

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Framework | NestJS v10 |
| GraphQL | `@nestjs/graphql` + `@nestjs/apollo` (Federation v2 subgraph) |
| Auth | BetterAuth v1.6.11 (credential + OIDC provider plugins) |
| ORM | MikroORM v6 + PostgreSQL driver |
| Architecture | DDD with Aggregates + CQRS (`@nestjs/cqrs`) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4001` | HTTP listen port |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `users_db` | Database name |
| `DB_USER` | `users_user` | Database user |
| `DB_PASSWORD` | `users_pwd` | Database password |
| `NODE_ENV` | `development` | Runtime environment |
| `BETTER_AUTH_URL` | `http://localhost:4001` | Public-facing URL (embedded in OIDC discovery doc) |
| `BETTER_AUTH_SECRET` | — | Secret for session token signing — **change in production** |
| `AI_OAUTH_CLIENT_ID` | `ai-companion` | OAuth2 client ID for the Companion service |
| `AI_OAUTH_CLIENT_SECRET` | `companion-dev-secret` | OAuth2 client secret — **change in production** |
| `AI_OAUTH_REDIRECT_URL` | `http://localhost:4004/auth/callback` | OAuth2 redirect URI |
| `RUN_MIGRATIONS` | `false` | Set to `true` to auto-run MikroORM migrations on boot |

## How to Run

### With Docker Compose (recommended)

```bash
docker compose up -d users
```

Requires `postgres` to be healthy first.

### Local Dev

```bash
# Ensure PostgreSQL is running
docker compose up -d postgres

cd apps/users
npm install
npm run dev
# → http://localhost:4001
```

### Database Migrations

```bash
cd apps/users

# Create a new migration from entity changes
npm run migration:create

# Apply all pending migrations
npm run migration:up
```

Migrations live in `src/infrastructure/persistence/migrations/`. BetterAuth auto-runs its own table migrations on startup (idempotent).

## REST Auth Endpoints (BetterAuth)

All endpoints are under `/api/auth/`.

### Credential Auth

```bash
# Register a new user
curl -X POST http://localhost:4001/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"secret123","name":"Alice"}'
# → { "token": "...", "user": { "id": "...", "email": "..." } }

# Sign in
curl -X POST http://localhost:4001/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"secret123"}'
# → { "token": "...", "user": { ... } }

# Validate a session
curl http://localhost:4001/api/auth/get-session \
  -H "Authorization: Bearer <token>"
# → { "user": { "id": "...", ... }, "session": { ... } }

# Sign out
curl -X POST http://localhost:4001/api/auth/sign-out \
  -H "Authorization: Bearer <token>"
```

### OAuth2 / OIDC Endpoints

Used by the Gateway to issue scoped tokens for the Companion subgraph.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/oauth2/authorize` | GET | Authorization endpoint (Authorization Code + PKCE) |
| `/api/auth/oauth2/token` | POST | Token exchange endpoint |
| `/api/auth/oauth2/userinfo` | GET | OIDC UserInfo endpoint |
| `/api/auth/.well-known/openid-configuration` | GET | OIDC Discovery document |

### OIDC Authorization Code + PKCE Flow (performed by the Gateway)

```
1. GET /api/auth/oauth2/authorize
      ?client_id=ai-companion
      &redirect_uri=http://localhost:4004/auth/callback
      &response_type=code
      &scope=openid+profile+email
      &state=<random>
      &code_challenge=<S256-hash>
      &code_challenge_method=S256
   Authorization: Bearer <session-token>
   → 302 Location: <redirect_uri>?code=<code>&state=<state>

2. POST /api/auth/oauth2/token
   grant_type=authorization_code
   &code=<code>
   &redirect_uri=...
   &client_id=ai-companion
   &client_secret=companion-dev-secret
   &code_verifier=<verifier>
   → { "access_token": "...", "token_type": "Bearer", "expires_in": 3600 }
```

## GraphQL Endpoint

```
POST http://localhost:4001/graphql
Content-Type: application/json
Authorization: Bearer <session-token>
```

Exposes the Users federation subgraph — the `User` type and associated queries/mutations.

## Database Schema

### BetterAuth Tables (auto-migrated on startup)

| Table | Description |
|-------|-------------|
| `user` | Core user records (email, name) |
| `session` | Active sessions (opaque token, expiry, IP, user-agent) |
| `account` | Auth provider links (credential, OAuth providers) |
| `oauth_application` | Registered OAuth2 clients (ai-companion) |
| `oauth_access_token` | Issued OAuth2 access tokens with scopes |
| `oauth_consent` | User consent records for OAuth2 clients |
| `verification` | Email verification tokens |

### MikroORM Domain Tables (managed by migrations)

| Table | Description |
|-------|-------------|
| `users` | Domain user aggregate |
| `idempotency_keys` | Per-user idempotency keys for mutation safety |

## Architecture Notes

The Users subgraph follows Domain-Driven Design with CQRS:

- `UserAggregate` — domain aggregate with business rules
- Commands + Handlers (`RegisterUserCommand`, `LoginUserCommand`, …) via `@nestjs/cqrs`
- BetterAuth runs alongside the domain layer — it handles the cryptographic session lifecycle while MikroORM handles the business domain

`BETTER_AUTH_URL` must use the host-reachable URL (e.g., `http://localhost:4001`) even inside Docker, because the URL is embedded in the OIDC discovery document and browser-initiated OAuth flows need to reach it from outside the container network.
