import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { gql } from 'graphql-tag';
import { v4 as uuidv4 } from 'uuid';

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

const orders: Record<string, unknown>[] = [];
const idempotency = new Map<string, unknown>();
const encodeCursor = (i: number) => Buffer.from(`offset:${i}`).toString('base64');
const decodeCursor = (c: string) => {
  try { return parseInt(Buffer.from(c, 'base64').toString().split(':')[1] ?? '0', 10); } catch { return 0; }
};

const resolvers = {
  Query: {
    myOrders(_: unknown, { first, after }: { first?: number; after?: string }) {
      const start = after ? decodeCursor(after) + 1 : 0;
      const f = first ?? 10;
      const slice = orders.slice(start, start + f);
      const edges = slice.map((node, i) => ({ cursor: encodeCursor(start + i), node }));
      return {
        edges,
        pageInfo: { hasNextPage: start + f < orders.length, hasPreviousPage: start > 0, startCursor: edges[0]?.cursor ?? null, endCursor: edges[edges.length - 1]?.cursor ?? null },
        totalCount: orders.length,
      };
    },
    order(_: unknown, { id }: { id: string }) {
      return orders.find((o) => (o as { id: string }).id === id) ?? null;
    },
  },
  Mutation: {
    createOrder(_: unknown, { input }: { input: { items: { productId: string; quantity: number }[]; shippingAddress: Record<string, string>; idempotencyKey: string } }) {
      const key = `order:${input.idempotencyKey}`;
      if (idempotency.has(key)) return idempotency.get(key);
      const items = input.items.map((item, i) => ({
        id: uuidv4(),
        productId: item.productId,
        productTitle: 'Product',
        productImageUrl: '',
        quantity: item.quantity,
        unitPrice: '99.00',
        subtotal: (99 * item.quantity).toFixed(2),
      }));
      const subtotal = items.reduce((s, it) => s + parseFloat(it.subtotal), 0).toFixed(2);
      const order = { id: uuidv4(), userId: 'unknown', status: 'PENDING', items, shippingAddress: input.shippingAddress, subtotal, total: subtotal, payment: null, idempotencyKey: input.idempotencyKey, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      orders.unshift(order);
      idempotency.set(key, order);
      return order;
    },
    processPayment(_: unknown, { input }: { input: { orderId: string; idempotencyKey: string } }) {
      const key = `payment:${input.idempotencyKey}`;
      if (idempotency.has(key)) return idempotency.get(key);
      const order = orders.find((o) => (o as { id: string }).id === input.orderId) as Record<string, unknown> | undefined;
      const payment = { id: uuidv4(), orderId: input.orderId, status: 'CAPTURED', amount: (order?.['total'] as string | undefined) ?? '0.00', currency: 'BRL', idempotencyKey: input.idempotencyKey, processedAt: new Date().toISOString() };
      if (order) { order['status'] = 'PAID'; order['payment'] = payment; }
      idempotency.set(key, payment);
      return payment;
    },
  },
  Order: {
    __resolveReference(ref: { id: string }) {
      return orders.find((o) => (o as { id: string }).id === ref.id) ?? null;
    },
  },
};

const server = new ApolloServer({ schema: buildSubgraphSchema({ typeDefs, resolvers }) });

startStandaloneServer(server, { listen: { port: Number(process.env['PORT'] ?? 4003) } })
  .then(({ url }) => console.log(`💳 Payments subgraph running at: ${url}`))
  .catch((err) => { console.error(err); process.exit(1); });
