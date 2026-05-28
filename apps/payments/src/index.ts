import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { gql } from 'graphql-tag';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

const PRODUCTS_URL = process.env['PRODUCTS_SUBGRAPH_URL'] ?? 'http://localhost:4002/graphql';

async function fetchProduct(productId: string): Promise<{ title: string; price: string; imageUrl: string } | null> {
  try {
    const res = await fetch(PRODUCTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `query($id:UUID!){product(id:$id){title price imageUrl}}`, variables: { id: productId } }),
    });
    const json = await res.json() as { data?: { product?: { title: string; price: string; imageUrl: string } } };
    return json.data?.product ?? null;
  } catch {
    return null;
  }
}

const pool = new Pool({
  host: process.env['DB_HOST'] ?? 'localhost',
  port: Number(process.env['DB_PORT'] ?? 5432),
  database: process.env['DB_NAME'] ?? 'payments_db',
  user: process.env['DB_USER'] ?? 'users_user',
  password: process.env['DB_PASSWORD'] ?? 'users_pwd',
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'unknown',
      status TEXT NOT NULL DEFAULT 'PENDING',
      items JSONB NOT NULL DEFAULT '[]',
      shipping_address JSONB NOT NULL DEFAULT '{}',
      subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
      total NUMERIC(10,2) NOT NULL DEFAULT 0,
      idempotency_key TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id UUID PRIMARY KEY,
      order_id UUID NOT NULL REFERENCES orders(id),
      status TEXT NOT NULL,
      amount NUMERIC(10,2) NOT NULL,
      currency TEXT NOT NULL DEFAULT 'BRL',
      idempotency_key TEXT NOT NULL UNIQUE,
      processed_at TIMESTAMPTZ
    )
  `);
}

type DbOrder = {
  id: string; user_id: string; status: string;
  items: Record<string, unknown>[]; shipping_address: Record<string, string>;
  subtotal: string; total: string; idempotency_key: string;
  created_at: Date; updated_at: Date;
};
type DbPayment = {
  id: string; order_id: string; status: string;
  amount: string; currency: string; idempotency_key: string; processed_at: Date | null;
};

function rowToOrder(row: DbOrder) {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    items: row.items,
    shippingAddress: row.shipping_address,
    subtotal: row.subtotal,
    total: row.total,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function rowToPayment(row: DbPayment) {
  return {
    id: row.id,
    orderId: row.order_id,
    status: row.status,
    amount: row.amount,
    currency: row.currency,
    idempotencyKey: row.idempotency_key,
    processedAt: row.processed_at?.toISOString() ?? null,
  };
}

const encodeCursor = (i: number) => Buffer.from(`offset:${i}`).toString('base64');
const decodeCursor = (c: string) => {
  try { return parseInt(Buffer.from(c, 'base64').toString().split(':')[1] ?? '0', 10); } catch { return 0; }
};

const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable"])

  scalar DateTime
  scalar UUID
  scalar Decimal

  type PageInfo @shareable {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  enum OrderStatus {
    PENDING
    PROCESSING
    PAID
    FULFILLED
    CANCELLED
    REFUNDED
  }

  enum PaymentStatus {
    INITIATED
    AUTHORIZED
    CAPTURED
    FAILED
    REFUNDED
  }

  type ShippingAddress {
    street: String!
    city: String!
    state: String!
    postalCode: String!
    country: String!
  }

  type OrderItem {
    id: UUID!
    productId: UUID!
    productTitle: String!
    productImageUrl: String!
    quantity: Int!
    unitPrice: Decimal!
    subtotal: Decimal!
  }

  type Payment {
    id: UUID!
    orderId: UUID!
    status: PaymentStatus!
    amount: Decimal!
    currency: String!
    idempotencyKey: String!
    processedAt: DateTime
  }

  type Order @key(fields: "id") {
    id: UUID!
    userId: UUID!
    status: OrderStatus!
    items: [OrderItem!]!
    shippingAddress: ShippingAddress!
    subtotal: Decimal!
    total: Decimal!
    payment: Payment
    idempotencyKey: String!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type OrderEdge {
    cursor: String!
    node: Order!
  }

  type OrderConnection {
    edges: [OrderEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  input ShippingAddressInput {
    street: String!
    city: String!
    state: String!
    postalCode: String!
    country: String!
  }

  input OrderItemInput {
    productId: UUID!
    quantity: Int!
  }

  input CreateOrderInput {
    items: [OrderItemInput!]!
    shippingAddress: ShippingAddressInput!
    idempotencyKey: String!
  }

  input ProcessPaymentInput {
    orderId: UUID!
    idempotencyKey: String!
  }

  type Query {
    myOrders(first: Int, after: String): OrderConnection!
    order(id: UUID!): Order
  }

  type Mutation {
    createOrder(input: CreateOrderInput!): Order!
    processPayment(input: ProcessPaymentInput!): Payment!
  }
`;

const resolvers = {
  Query: {
    async myOrders(_: unknown, { first, after }: { first?: number; after?: string }) {
      const start = after ? decodeCursor(after) + 1 : 0;
      const f = first ?? 10;
      const { rows } = await pool.query<DbOrder>(
        'SELECT * FROM orders ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [f, start],
      );
      const { rows: countRows } = await pool.query<{ count: string }>('SELECT COUNT(*) FROM orders');
      const total = parseInt(countRows[0]!.count, 10);
      const edges = rows.map((row, i) => ({ cursor: encodeCursor(start + i), node: rowToOrder(row) }));
      return {
        edges,
        pageInfo: {
          hasNextPage: start + f < total,
          hasPreviousPage: start > 0,
          startCursor: edges[0]?.cursor ?? null,
          endCursor: edges[edges.length - 1]?.cursor ?? null,
        },
        totalCount: total,
      };
    },
    async order(_: unknown, { id }: { id: string }) {
      const { rows } = await pool.query<DbOrder>('SELECT * FROM orders WHERE id = $1', [id]);
      return rows[0] ? rowToOrder(rows[0]) : null;
    },
  },
  Mutation: {
    async createOrder(_: unknown, { input }: { input: { items: { productId: string; quantity: number }[]; shippingAddress: Record<string, string>; idempotencyKey: string } }) {
      const existing = await pool.query<DbOrder>('SELECT * FROM orders WHERE idempotency_key = $1', [input.idempotencyKey]);
      if (existing.rows[0]) return rowToOrder(existing.rows[0]);

      const items = await Promise.all(input.items.map(async (item) => {
        const product = await fetchProduct(item.productId);
        const unitPrice = parseFloat(product?.price ?? '99.00');
        return {
          id: uuidv4(),
          productId: item.productId,
          productTitle: product?.title ?? 'Product',
          productImageUrl: product?.imageUrl ?? '',
          quantity: item.quantity,
          unitPrice: unitPrice.toFixed(2),
          subtotal: (unitPrice * item.quantity).toFixed(2),
        };
      }));
      const subtotal = items.reduce((s, it) => s + parseFloat(it.subtotal), 0).toFixed(2);
      const id = uuidv4();

      await pool.query(
        `INSERT INTO orders (id, user_id, status, items, shipping_address, subtotal, total, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, 'unknown', 'PENDING', JSON.stringify(items), JSON.stringify(input.shippingAddress), subtotal, subtotal, input.idempotencyKey],
      );

      const { rows } = await pool.query<DbOrder>('SELECT * FROM orders WHERE id = $1', [id]);
      return rowToOrder(rows[0]!);
    },
    async processPayment(_: unknown, { input }: { input: { orderId: string; idempotencyKey: string } }) {
      const existing = await pool.query<DbPayment>('SELECT * FROM payments WHERE idempotency_key = $1', [input.idempotencyKey]);
      if (existing.rows[0]) return rowToPayment(existing.rows[0]);

      const orderResult = await pool.query<DbOrder>('SELECT * FROM orders WHERE id = $1', [input.orderId]);
      const order = orderResult.rows[0];
      const amount = order?.total ?? '0.00';
      const paymentId = uuidv4();

      await pool.query(
        `INSERT INTO payments (id, order_id, status, amount, currency, idempotency_key, processed_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [paymentId, input.orderId, 'CAPTURED', amount, 'BRL', input.idempotencyKey],
      );
      await pool.query(`UPDATE orders SET status = 'PAID', updated_at = NOW() WHERE id = $1`, [input.orderId]);

      const { rows } = await pool.query<DbPayment>('SELECT * FROM payments WHERE id = $1', [paymentId]);
      return rowToPayment(rows[0]!);
    },
  },
  Order: {
    async payment(order: { id: string }) {
      const { rows } = await pool.query<DbPayment>('SELECT * FROM payments WHERE order_id = $1', [order.id]);
      return rows[0] ? rowToPayment(rows[0]) : null;
    },
    async __resolveReference(ref: { id: string }) {
      const { rows } = await pool.query<DbOrder>('SELECT * FROM orders WHERE id = $1', [ref.id]);
      return rows[0] ? rowToOrder(rows[0]) : null;
    },
  },
};

const server = new ApolloServer({ schema: buildSubgraphSchema({ typeDefs, resolvers }) });

async function main() {
  await initDb();
  const { url } = await startStandaloneServer(server, { listen: { port: Number(process.env['PORT'] ?? 4003) } });
  console.log(`💳 Payments subgraph running at: ${url}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
