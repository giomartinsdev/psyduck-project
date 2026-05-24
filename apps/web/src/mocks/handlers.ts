'use client';

/**
 * Apollo MockLink-compatible handlers for all GraphQL operations.
 * Simulates: pagination, auth, idempotency, payment state machine, AI streaming.
 */

import {
  ApolloLink,
  Observable,
  Operation,
  FetchResult,
} from '@apollo/client';
import {
  MOCK_USER,
  MOCK_TOKEN,
  MOCK_PRODUCTS,
  MOCK_POSTS,
  MOCK_ORDERS,
  MOCK_AI_CONVERSATION,
  MOCK_AI_RESPONSES,
} from './fixtures';

// ─── Idempotency store (in-memory Map keyed by userId:key) ───────────────────
const idempotencyStore = new Map<string, unknown>();

// ─── Cursor helpers ───────────────────────────────────────────────────────────
const encodeCursor = (offset: number): string =>
  Buffer.from(`offset:${offset}`).toString('base64');

const decodeCursor = (cursor: string): number => {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    return parseInt(decoded.split(':')[1], 10) || 0;
  } catch {
    return 0;
  }
};

const paginate = <T>(
  items: T[],
  first: number = 6,
  after?: string | null
): { edges: Array<{ cursor: string; node: T }>; pageInfo: object; totalCount: number } => {
  const startOffset = after ? decodeCursor(after) + 1 : 0;
  const slice = items.slice(startOffset, startOffset + first);
  const edges = slice.map((node, i) => ({
    cursor: encodeCursor(startOffset + i),
    node,
  }));
  return {
    edges,
    pageInfo: {
      hasNextPage: startOffset + first < items.length,
      hasPreviousPage: startOffset > 0,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges[edges.length - 1]?.cursor ?? null,
    },
    totalCount: items.length,
  };
};

// ─── Mock auth state ──────────────────────────────────────────────────────────
let currentUser: typeof MOCK_USER | null = null;

const setMockUser = (user: typeof MOCK_USER | null) => {
  currentUser = user;
  if (typeof window !== 'undefined') {
    if (user) {
      localStorage.setItem('mock_token', MOCK_TOKEN);
      localStorage.setItem('mock_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('mock_token');
      localStorage.removeItem('mock_user');
    }
  }
};

// ─── In-memory orders store ───────────────────────────────────────────────────
const ordersStore = [...MOCK_ORDERS];

// ─── AI conversations store ───────────────────────────────────────────────────
const conversationsStore = [MOCK_AI_CONVERSATION];
let messageCounter = 100;

// ─── Response resolver map ────────────────────────────────────────────────────
type Variables = Record<string, unknown>;

const resolvers: Record<string, (variables: Variables) => unknown> = {
  // ── Auth ─────────────────────────────────────────────────────────────────
  signIn: ({ input }: Variables) => {
    const { email } = input as { email: string; password: string };
    if (email === MOCK_USER.email) {
      setMockUser(MOCK_USER);
      return { signIn: { token: MOCK_TOKEN, user: MOCK_USER } };
    }
    throw new Error('Invalid credentials');
  },

  signUp: ({ input }: Variables) => {
    const { name, email } = input as { name: string; email: string; password: string };
    const newUser = { ...MOCK_USER, name, email };
    setMockUser(newUser);
    return { signUp: { token: MOCK_TOKEN, user: newUser } };
  },

  signOut: () => {
    setMockUser(null);
    return { signOut: true };
  },

  me: () => ({ me: currentUser }),

  // ── Products ──────────────────────────────────────────────────────────────
  products: ({ first, after, search, category }: Variables) => {
    let filtered = MOCK_PRODUCTS;
    if (search) {
      const q = String(search).toLowerCase();
      filtered = filtered.filter(
        p => p.title.toLowerCase().includes(q) || p.tags.some(t => t.includes(q))
      );
    }
    if (category) {
      filtered = filtered.filter(p => p.category === category);
    }
    return { products: paginate(filtered, Number(first) || 6, after as string) };
  },

  product: ({ id }: Variables) => ({
    product: MOCK_PRODUCTS.find(p => p.id === id || p.slug === id) ?? null,
  }),

  featuredProducts: ({ limit }: Variables) => ({
    featuredProducts: MOCK_PRODUCTS.slice(0, Number(limit) || 3),
  }),

  // ── Posts ─────────────────────────────────────────────────────────────────
  posts: ({ first, after }: Variables) => ({
    posts: paginate(MOCK_POSTS, Number(first) || 3, after as string),
  }),

  post: ({ id }: Variables) => ({
    post: MOCK_POSTS.find(p => p.id === id || p.slug === id) ?? null,
  }),

  featuredPosts: ({ limit }: Variables) => ({
    featuredPosts: MOCK_POSTS.slice(0, Number(limit) || 2),
  }),

  // ── Orders ────────────────────────────────────────────────────────────────
  myOrders: ({ first, after }: Variables) => ({
    myOrders: paginate(ordersStore, Number(first) || 10, after as string),
  }),

  order: ({ id }: Variables) => ({
    order: ordersStore.find(o => o.id === id) ?? null,
  }),

  // ── Create Order (with idempotency) ───────────────────────────────────────
  createOrder: ({ input }: Variables) => {
    const { items, shippingAddress, idempotencyKey } = input as {
      items: Array<{ productId: string; quantity: number }>;
      shippingAddress: { street: string; city: string; state: string; postalCode: string; country: string; };
      idempotencyKey: string;
    };

    const idemKey = `${currentUser?.id ?? 'anon'}:${idempotencyKey}`;
    if (idempotencyStore.has(idemKey)) {
      return { createOrder: idempotencyStore.get(idemKey) };
    }

    const orderItems = items.map((item, i) => {
      const product = MOCK_PRODUCTS.find(p => p.id === item.productId)!;
      return {
        id: `oi-new-${i}-${Date.now()}`,
        productId: item.productId,
        productTitle: product?.title ?? 'Unknown',
        productImageUrl: product?.imageUrl ?? '',
        quantity: item.quantity,
        unitPrice: product?.price ?? '0',
        subtotal: (parseFloat(product?.price ?? '0') * item.quantity).toFixed(2),
      };
    });

    const subtotal = orderItems.reduce((sum, i) => sum + parseFloat(i.subtotal), 0).toFixed(2);
    const newOrder = {
      id: `order-${Date.now()}`,
      userId: currentUser?.id ?? '',
      status: 'PENDING',
      items: orderItems,
      shippingAddress,
      subtotal,
      total: subtotal,
      payment: null,
      idempotencyKey,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    ordersStore.unshift(newOrder as any);
    idempotencyStore.set(idemKey, newOrder);
    return { createOrder: newOrder };
  },

  // ── Process Payment (with idempotency) ────────────────────────────────────
  processPayment: ({ input }: Variables) => {
    const { orderId, idempotencyKey } = input as { orderId: string; idempotencyKey: string };

    const idemKey = `payment:${currentUser?.id ?? 'anon'}:${idempotencyKey}`;
    if (idempotencyStore.has(idemKey)) {
      return { processPayment: idempotencyStore.get(idemKey) };
    }

    const order = ordersStore.find(o => o.id === orderId);
    const payment = {
      id: `pay-${Date.now()}`,
      orderId,
      status: 'CAPTURED',
      amount: order?.total ?? '0',
      currency: 'BRL',
      idempotencyKey,
      processedAt: new Date().toISOString(),
    };

    if (order) {
      (order as typeof order & { status: string; payment: typeof payment }).status = 'PAID';
      (order as typeof order & { payment: typeof payment }).payment = payment;
    }

    idempotencyStore.set(idemKey, payment);
    return { processPayment: payment };
  },

  // ── AI ────────────────────────────────────────────────────────────────────
  startConversation: () => {
    const conv = {
      id: `conv-${Date.now()}`,
      userId: currentUser?.id ?? '',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    conversationsStore.push(conv as typeof conversationsStore[0]);
    return { startConversation: conv };
  },

  myConversations: () => ({ myConversations: conversationsStore }),

  conversation: ({ id }: Variables) => ({
    conversation: conversationsStore.find(c => c.id === id) ?? null,
  }),

  sendAIMessage: ({ input }: Variables) => {
    const { conversationId, content } = input as { conversationId?: string; content: string };

    let conv = conversationsStore.find(c => c.id === conversationId);
    if (!conv) {
      conv = {
        id: `conv-${Date.now()}`,
        userId: currentUser?.id ?? '',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as typeof conversationsStore[0];
      conversationsStore.push(conv);
    }

    const userMsg = {
      id: `msg-user-${messageCounter++}`,
      role: 'USER' as const,
      content,
      toolInvocations: [],
      createdAt: new Date().toISOString(),
    };

    const randomProduct = MOCK_PRODUCTS[Math.floor(Math.random() * 3)];
    const rawResponse = MOCK_AI_RESPONSES[messageCounter % MOCK_AI_RESPONSES.length]
      .replace('{product}', randomProduct.title)
      .replace('{total}', `${parseFloat(randomProduct.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);

    const assistantMsg = {
      id: `msg-ai-${messageCounter++}`,
      role: 'ASSISTANT' as const,
      content: rawResponse,
      toolInvocations: [
        {
          toolName: 'search_products',
          arguments: JSON.stringify({ query: content }),
          result: JSON.stringify({ found: randomProduct.title }),
          status: 'SUCCESS' as const,
        },
      ],
      createdAt: new Date().toISOString(),
    };

    conv.messages.push(userMsg as typeof conv.messages[0]);
    conv.messages.push(assistantMsg as typeof conv.messages[0]);
    conv.updatedAt = new Date().toISOString();

    return { sendAIMessage: { message: assistantMsg, conversation: conv } };
  },
};

// Helper to extract fields recursively or for the root Query/Mutation
const getRootFields = (query: any): string[] => {
  const fields: string[] = [];
  const def = query.definitions.find((d: any) => d.kind === 'OperationDefinition');
  if (def && def.selectionSet) {
    def.selectionSet.selections.forEach((sel: any) => {
      if (sel.kind === 'Field') {
        fields.push(sel.name.value);
      }
    });
  }
  return fields;
};

// ─── MockLink implementation ──────────────────────────────────────────────────
export class MockLink extends ApolloLink {
  override request(operation: Operation): Observable<FetchResult> {
    return new Observable(observer => {
      const variables = operation.variables as Variables;

      // Simulate 300ms network delay
      const timeout = setTimeout(() => {
        try {
          const rootFields = getRootFields(operation.query);
          const data: Record<string, any> = {};

          for (const field of rootFields) {
            const resolver = resolvers[field];
            if (!resolver) {
              throw new Error(`No mock resolver for field: "${field}"`);
            }
            Object.assign(data, resolver(variables));
          }

          observer.next({ data });
          observer.complete();
        } catch (error) {
          observer.next({
            errors: [{ message: (error as Error).message }],
          });
          observer.complete();
        }
      }, 300);

      return () => clearTimeout(timeout);
    });
  }
}

// Initialize from localStorage if available (for page refresh persistence)
if (typeof window !== 'undefined') {
  const stored = localStorage.getItem('mock_user');
  if (stored) {
    try {
      currentUser = JSON.parse(stored);
    } catch {
      currentUser = null;
    }
  }
}
