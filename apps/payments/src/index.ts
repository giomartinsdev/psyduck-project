import 'reflect-metadata';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { gql } from 'graphql-tag';
import { MikroORM } from '@mikro-orm/core';
import { defineConfig } from '@mikro-orm/postgresql';
import { v4 as uuidv4 } from 'uuid';
import { OrderEntity, type OrderItemJson, type ShippingAddressJson } from './order.entity';
import { PaymentEntity } from './payment.entity';

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

// ─── MikroORM ─────────────────────────────────────────────────────────────────
let orm: MikroORM;

async function initOrm() {
  orm = await MikroORM.init(defineConfig({
    host: process.env['DB_HOST'] ?? 'localhost',
    port: Number(process.env['DB_PORT'] ?? 5432),
    dbName: process.env['DB_NAME'] ?? 'payments_db',
    user: process.env['DB_USER'] ?? 'users_user',
    password: process.env['DB_PASSWORD'] ?? 'users_pwd',
    entities: [OrderEntity, PaymentEntity],
    debug: false,
  }));
  await orm.schema.updateSchema({ safe: true });
}

// ─── Mappers ──────────────────────────────────────────────────────────────────
function toOrder(o: OrderEntity) {
  return {
    id: o.id,
    userId: o.userId,
    status: o.status,
    items: o.items,
    shippingAddress: o.shippingAddress,
    subtotal: String(o.subtotal),
    total: String(o.total),
    idempotencyKey: o.idempotencyKey,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

function toPayment(p: PaymentEntity) {
  return {
    id: p.id,
    orderId: p.order.id,
    status: p.status,
    amount: String(p.amount),
    currency: p.currency,
    idempotencyKey: p.idempotencyKey,
    processedAt: p.processedAt?.toISOString() ?? null,
  };
}

const encodeCursor = (i: number) => Buffer.from(`offset:${i}`).toString('base64');
const decodeCursor = (c: string) => {
  try { return parseInt(Buffer.from(c, 'base64').toString().split(':')[1] ?? '0', 10); } catch { return 0; }
};

// ─── SDL ──────────────────────────────────────────────────────────────────────
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

// ─── Resolvers ────────────────────────────────────────────────────────────────
const resolvers = {
  Query: {
    async myOrders(_: unknown, { first, after }: { first?: number; after?: string }) {
      const em = orm.em.fork();
      const start = after ? decodeCursor(after) + 1 : 0;
      const f = first ?? 10;
      const [orders, total] = await em.findAndCount(
        OrderEntity, {},
        { orderBy: { createdAt: 'DESC' }, limit: f, offset: start },
      );
      const edges = orders.map((o, i) => ({ cursor: encodeCursor(start + i), node: toOrder(o) }));
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
      const em = orm.em.fork();
      const o = await em.findOne(OrderEntity, { id });
      return o ? toOrder(o) : null;
    },
  },

  Mutation: {
    async createOrder(_: unknown, { input }: { input: { items: { productId: string; quantity: number }[]; shippingAddress: ShippingAddressJson; idempotencyKey: string } }) {
      const em = orm.em.fork();

      const existing = await em.findOne(OrderEntity, { idempotencyKey: input.idempotencyKey });
      if (existing) return toOrder(existing);

      const items: OrderItemJson[] = await Promise.all(input.items.map(async (item) => {
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

      const order = em.create(OrderEntity, {
        userId: 'unknown',
        status: 'PENDING',
        items,
        shippingAddress: input.shippingAddress,
        subtotal,
        total: subtotal,
        idempotencyKey: input.idempotencyKey,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await em.persistAndFlush(order);
      return toOrder(order);
    },

    async processPayment(_: unknown, { input }: { input: { orderId: string; idempotencyKey: string } }) {
      const em = orm.em.fork();

      const existing = await em.findOne(PaymentEntity, { idempotencyKey: input.idempotencyKey });
      if (existing) return toPayment(existing);

      const order = await em.findOneOrFail(OrderEntity, { id: input.orderId });

      const payment = em.create(PaymentEntity, {
        order,
        status: 'CAPTURED',
        amount: order.total,
        currency: 'BRL',
        idempotencyKey: input.idempotencyKey,
        processedAt: new Date(),
      });

      order.status = 'PAID';
      order.updatedAt = new Date();

      await em.persistAndFlush([payment, order]);
      return toPayment(payment);
    },
  },

  Order: {
    async payment(order: { id: string }) {
      const em = orm.em.fork();
      const p = await em.findOne(PaymentEntity, { order: order.id as never });
      return p ? toPayment(p) : null;
    },
    async __resolveReference(ref: { id: string }) {
      const em = orm.em.fork();
      const o = await em.findOne(OrderEntity, { id: ref.id });
      return o ? toOrder(o) : null;
    },
  },
};

// ─── Bootstrap ────────────────────────────────────────────────────────────────
const server = new ApolloServer({ schema: buildSubgraphSchema({ typeDefs, resolvers }) });

async function main() {
  await initOrm();
  const { url } = await startStandaloneServer(server, { listen: { port: Number(process.env['PORT'] ?? 4003) } });
  console.log(`💳 Payments subgraph running at: ${url}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
