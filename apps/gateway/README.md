# Gateway

Apollo Federation v2 gateway built with NestJS. Composes the supergraph schema from all four subgraphs at runtime and routes every incoming GraphQL request to the appropriate service(s).

## Responsibilities

- Compose the federated supergraph from Users, Products, Payments, and Companion subgraphs via `IntrospectAndCompose`
- Forward the user's `Authorization` header to all standard subgraphs
- Perform an OAuth2 Authorization Code + PKCE exchange on behalf of the user before forwarding requests to the Companion subgraph (FR-010)
- Provide a single GraphQL endpoint at `/graphql` for all clients

## Port

`4000`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | HTTP listen port |
| `USERS_SUBGRAPH_URL` | `http://localhost:4001/graphql` | Users subgraph endpoint |
| `PRODUCTS_SUBGRAPH_URL` | `http://localhost:4002/graphql` | Products subgraph endpoint |
| `PAYMENTS_SUBGRAPH_URL` | `http://localhost:4003/graphql` | Payments subgraph endpoint |
| `AI_SUBGRAPH_URL` | `http://localhost:4004/graphql` | Companion AI subgraph endpoint |
| `USERS_AUTH_URL` | `http://localhost:4001` | BetterAuth base URL (used for OAuth2 exchange) |
| `AI_OAUTH_CLIENT_ID` | `ai-companion` | OAuth2 client ID registered in Users |
| `AI_OAUTH_CLIENT_SECRET` | `companion-dev-secret` | OAuth2 client secret |
| `AI_OAUTH_REDIRECT_URL` | `http://localhost:4004/auth/callback` | OAuth2 redirect URI |
| `NODE_ENV` | `development` | `development` enables 30s schema polling |

## How to Run

### With Docker Compose (recommended)

```bash
docker compose up -d gateway
```

The gateway waits for all four subgraphs to be healthy before starting.

### Local Dev

```bash
npm install
npm run dev
# → http://localhost:4000/graphql
```

### Build & Start (production-style)

```bash
npm run build
npm start
```

## Schema Composition

The gateway uses `IntrospectAndCompose` — it fetches each subgraph's SDL at startup and re-composes every 30 seconds in development. There is no static supergraph SDL file; the schema is always derived at runtime.

If a subgraph is unreachable at startup the gateway will fail to boot. Ensure all four subgraphs are healthy first.

## Auth Header Forwarding

Two data source classes handle request forwarding:

**`SessionForwardingDataSource`** (Users, Products, Payments)
Copies the `Authorization` and `x-user-id` headers from the incoming request and attaches them to the outbound subgraph request unchanged.

**`CompanionDataSource`** (Companion AI)
For each request the gateway checks a per-user token cache. On a cache miss it performs:
1. `GET /api/auth/oauth2/authorize` — intercepts the `Location` redirect to extract the authorization code
2. `POST /api/auth/oauth2/token` — exchanges code + PKCE verifier for an access token

The resulting access token is cached for its lifetime (minus a 30-second grace period) and injected as `Authorization: Bearer <access_token>`. The original session token is also forwarded in `x-user-token` so the Companion's MCP tools can call other subgraphs.

## GraphQL Endpoint

```
POST http://localhost:4000/graphql
Content-Type: application/json
Authorization: Bearer <session-token>
```

The full supergraph schema is accessible via introspection at the same endpoint.
