# Products Subgraph

Apollo Server standalone service that exposes the product catalog and blog posts. It proxies data from a WordPress/WooCommerce backend via WPGraphQL when available, and transparently falls back to an in-memory mock dataset when WordPress is unreachable.

## Responsibilities

- Serve product listings with cursor-based pagination
- Expose featured products and posts
- Map WooCommerce integer IDs to UUIDs for federation compatibility
- Provide a stable fallback mock for local development without WordPress

## Port

`4002`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4002` | HTTP listen port |
| `WP_GRAPHQL_URL` | `http://localhost:8080/graphql` | WordPress WPGraphQL endpoint |

## How to Run

### With Docker Compose (recommended)

```bash
# With WordPress (full stack)
docker compose up -d products

# Infrastructure only — Products will use the mock dataset
docker compose up -d postgres valkey
```

### Local Dev (mock mode)

No database required. The service starts immediately and uses mock data when WordPress is not reachable.

```bash
cd apps/products
npm install
npm run dev
# → http://localhost:4002/graphql
```

### Local Dev (WordPress mode)

```bash
# Start WordPress and MySQL
docker compose up -d wordpress

# Wait for WordPress to be healthy (~2 min on first run)
docker compose ps

# Then start the Products service pointing at it
WP_GRAPHQL_URL=http://localhost:8080/graphql npm run dev
```

## GraphQL Schema

### Queries

```graphql
# Paginated product catalog (Relay cursor pagination)
products(first: Int, after: String): ProductConnection!

# Single product by UUID
product(id: UUID!): Product

# Pre-selected featured products
featuredProducts(limit: Int): [Product!]!

# Blog posts from WordPress
posts(first: Int, after: String): PostConnection!

# Single post by UUID
post(id: UUID!): Post

# Pre-selected featured posts
featuredPosts(limit: Int): [Post!]!
```

### Types

```graphql
type Product @key(fields: "id") {
  id: UUID!
  title: String!
  description: String
  price: String!
  imageUrl: String
  category: String
}

type Post {
  id: UUID!
  title: String!
  excerpt: String
  content: String
  imageUrl: String
  date: String
}
```

## Mock Data

When `WP_GRAPHQL_URL` is unreachable the service serves:
- **16 mock products** across multiple categories with placeholder prices and images
- **12 mock blog posts** with lorem-ipsum excerpts

Mock data is seeded in `src/index.ts` and is suitable for development and demos.

## WordPress Integration

When WordPress is available the service:
1. Forwards GraphQL queries to `WP_GRAPHQL_URL`
2. Maps WooCommerce integer node IDs to stable UUIDs (deterministic, based on a hash of the WP ID)
3. Translates WooCommerce product and post types to the federation schema

The WPGraphQL plugin must be active on the WordPress instance. The `infra/wp-bootstrap.sh` script installs and activates it automatically when the WordPress container starts.

## Example Queries

```bash
# Featured products
curl -X POST http://localhost:4002/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ featuredProducts(limit: 3) { id title price } }"}'

# Paginated catalogue
curl -X POST http://localhost:4002/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ products(first: 6) { edges { node { id title price } } pageInfo { hasNextPage endCursor } } }"}'
```
