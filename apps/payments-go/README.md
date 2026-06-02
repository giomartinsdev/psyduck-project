# Payments Subgraph (Go)

Go service that handles order creation and payment processing. Built with Domain-Driven Design — commands and events flow through a Valkey (Redis-compatible) stream so payment capture happens asynchronously after the order is created.

## Responsibilities

- Create orders with idempotency guarantees
- Initiate payment capture asynchronously via Valkey streams
- Persist orders and payments to PostgreSQL
- Validate user sessions by calling the Users subgraph
- Fetch live product pricing from the Products subgraph at order time

## Port

`4003`

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Language | Go 1.23 |
| GraphQL | gqlgen |
| Database | PostgreSQL (pgx v5) |
| Message Bus | Valkey 8 (Redis-compatible) via `go-redis/v9` |
| Architecture | DDD — Aggregates, Repositories, Application Handlers |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4003` | HTTP listen port |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `payments_db` | Database name |
| `DB_USER` | `users_user` | Database user |
| `DB_PASSWORD` | `users_pwd` | Database password |
| `VALKEY_ADDR` | `localhost:6379` | Valkey server address |
| `PRODUCTS_SUBGRAPH_URL` | `http://localhost:4002/graphql` | Products subgraph (for price lookup) |
| `USERS_AUTH_URL` | `http://localhost:4001` | Users service (for session validation) |

## How to Run

### With Docker Compose (recommended)

```bash
docker compose up -d payments
```

Requires `postgres`, `valkey`, and `users` to be healthy first.

### Local Dev

```bash
# Start infrastructure
docker compose up -d postgres valkey

# Run the Go service
cd apps/payments-go
go run .
# → http://localhost:4003/graphql
```

### Build Docker Image

```bash
cd apps/payments-go
docker build -t psyduck-payments-go .
docker run -p 4003:4003 \
  -e DB_HOST=host.docker.internal \
  -e VALKEY_ADDR=host.docker.internal:6379 \
  psyduck-payments-go
```

### Run Tests

```bash
cd apps/payments-go
go test ./...
```

## GraphQL Schema

### Mutations

```graphql
# Create a new order (requires authentication)
createOrder(input: CreateOrderInput!): Order!

# Initiate payment for an existing order (requires authentication)
processPayment(input: ProcessPaymentInput!): Payment!
```

### Queries

```graphql
# Get all orders for the authenticated user
myOrders: [Order!]!

# Get a specific order by ID
order(id: UUID!): Order
```

### Types

```graphql
type Order @key(fields: "id") {
  id: UUID!
  userId: String!
  status: OrderStatus!
  items: [OrderItem!]!
  totalAmount: String!
  createdAt: String!
}

type Payment {
  id: UUID!
  orderId: UUID!
  status: PaymentStatus!
  amount: String!
  createdAt: String!
}

enum OrderStatus  { PENDING CONFIRMED CANCELLED }
enum PaymentStatus { INITIATED CAPTURED FAILED }
```

## Async Payment Flow

```
Client → createOrder mutation
              │
              ▼
    CreateOrderHandler
    ├── Fetches product prices from Products subgraph
    ├── Persists Order to PostgreSQL (status: PENDING)
    └── Publishes OrderCreated event to Valkey stream

Client → processPayment mutation
              │
              ▼
    ProcessPaymentHandler
    ├── Creates Payment record (status: INITIATED)
    └── Publishes CapturePayment command to Valkey stream

                    PaymentCommandConsumer (background)
                    ├── Reads CapturePayment from stream
                    ├── Processes payment logic
                    ├── Updates Payment to CAPTURED
                    └── Publishes PaymentCaptured event
```

This design keeps the GraphQL mutations fast — they return immediately after writing to the stream, and the heavy lifting happens in the background consumer.

## Auth

The `authMiddleware` validates every request by calling `GET /api/auth/get-session` on the Users service. The resolved user ID is stored in the request context and propagated to all application handlers. Unauthenticated requests are allowed through but mutations that require a user ID will return an error.

## Example Mutations

```bash
TOKEN="Bearer <your-session-token>"

# Create an order
curl -X POST http://localhost:4003/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{
    "query": "mutation { createOrder(input: { items: [{ productId: \"<uuid>\", quantity: 2 }] }) { id status totalAmount } }"
  }'

# Process payment for the order
curl -X POST http://localhost:4003/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{
    "query": "mutation { processPayment(input: { orderId: \"<order-uuid>\" }) { id status } }"
  }'
```

## Project Layout

```
apps/payments-go/
├── main.go                   Entry point, HTTP server, auth middleware
├── go.mod / go.sum
├── Dockerfile                Multi-stage build (builder + alpine runtime)
├── application/
│   ├── create_order.go       CreateOrderHandler
│   └── process_payment.go    ProcessPaymentHandler
├── db/
│   └── db.go                 PostgreSQL connection pool
├── graph/
│   ├── schema.graphql        GraphQL schema definition
│   ├── resolver.go           gqlgen resolver implementations
│   └── generated/            gqlgen auto-generated code
└── infrastructure/
    ├── order_repository.go   PostgreSQL order persistence
    ├── payment_repository.go PostgreSQL payment persistence
    └── valkey_event_bus.go   Valkey stream publisher + consumers
```
