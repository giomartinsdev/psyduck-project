import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

// ─── Unified Schema Definition ───────────────────────────────────────────────
const schemaPath = path.join(__dirname, '../../web/src/graphql/schema.graphql');
const typeDefs = fs.readFileSync(schemaPath, 'utf8');

// ─── Local WordPress Settings ────────────────────────────────────────────────
const WP_GRAPHQL_URL = 'http://localhost:8080/graphql';

// ─── Rich Mock Datasets for Fallbacks and Mocked Subgraphs ───────────────────
const MOCK_USER = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'gio@techallenge.dev',
  name: 'Giovanni Palest',
  avatarUrl: null,
  createdAt: '2026-01-15T10:00:00Z',
};

const MOCK_TOKEN = 'mock-jwt-token-abc123';

const MOCK_PRODUCTS = [
  {
    id: 'p1000001-0000-0000-0000-000000000001',
    slug: 'wireless-noise-cancelling-headphones',
    title: 'Wireless Noise-Cancelling Headphones',
    description: 'Premium over-ear headphones with active noise cancellation, 30-hour battery life, and hi-res audio support. Perfect for focus and travel.',
    price: '1299.90',
    compareAtPrice: '1799.90',
    imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&q=80',
    galleryImages: [],
    stockStatus: 'IN_STOCK',
    inventoryCount: 42,
    category: 'Electronics',
    tags: ['audio', 'wireless', 'headphones'],
    createdAt: '2026-01-10T00:00:00Z',
  },
  {
    id: 'p1000001-0000-0000-0000-000000000002',
    slug: 'mechanical-keyboard-rgb',
    title: 'Mechanical RGB Keyboard',
    description: 'Compact 75% layout mechanical keyboard with hot-swappable switches, per-key RGB lighting, and aluminum frame. The ultimate typing experience.',
    price: '849.90',
    compareAtPrice: null,
    imageUrl: 'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?w=600&q=80',
    galleryImages: [],
    stockStatus: 'IN_STOCK',
    inventoryCount: 18,
    category: 'Peripherals',
    tags: ['keyboard', 'mechanical', 'rgb'],
    createdAt: '2026-01-11T00:00:00Z',
  },
  {
    id: 'p1000001-0000-0000-0000-000000000003',
    slug: 'ultra-wide-monitor-34inch',
    title: '34" Ultra-Wide QHD Monitor',
    description: '34-inch curved ultra-wide monitor with 3440×1440 resolution, 144Hz refresh rate, 1ms response time, and HDR support for gaming and productivity.',
    price: '3499.00',
    compareAtPrice: '4199.00',
    imageUrl: 'https://images.unsplash.com/photo-1527443224154-c4a573d5f000?w=600&q=80',
    galleryImages: [],
    stockStatus: 'IN_STOCK',
    inventoryCount: 7,
    category: 'Displays',
    tags: ['monitor', 'ultra-wide', 'gaming'],
    createdAt: '2026-01-12T00:00:00Z',
  },
];

const MOCK_POSTS = [
  {
    id: 'b2000001-0000-0000-0000-000000000001',
    slug: 'why-mechanical-keyboards-boost-productivity',
    title: 'Why Mechanical Keyboards Boost Developer Productivity',
    excerpt: 'The tactile feedback, key actuation precision, and ergonomic benefits of mechanical keyboards can dramatically improve your typing speed and reduce fatigue.',
    content: 'Mechanical keyboards offer tactile feedback and precision switches that elevate your everyday workflow.',
    imageUrl: 'https://images.unsplash.com/photo-1541140532154-b024d705b90a?w=600&q=80',
    category: 'Tech Guides',
    tags: ['keyboard', 'productivity', 'developers'],
    publishedAt: '2026-05-10T09:00:00Z',
    author: 'Tech Editorial',
  },
  {
    id: 'b2000001-0000-0000-0000-000000000002',
    slug: 'build-perfect-home-office-2026',
    title: 'Building the Perfect Home Office Setup in 2026',
    excerpt: "Remote work is here to stay. Here's our curated guide to the best ergonomic, audio, and display gear to transform your workspace.",
    content: 'Transform your home workspace with high-end, carefully designed ergonomic gear.',
    imageUrl: 'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=600&q=80',
    category: 'Buying Guides',
    tags: ['home-office', 'setup', 'ergonomics'],
    publishedAt: '2026-05-14T09:00:00Z',
    author: 'Tech Editorial',
  },
];

const MOCK_ORDERS: any[] = [];
const MOCK_CONVERSATIONS: any[] = [];

// ─── In-memory Idempotency Store ──────────────────────────────────────────────
const idempotencyStore = new Map<string, any>();

// ─── Helpers for cursor pagination ───────────────────────────────────────────
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
): { edges: Array<{ cursor: string; node: T }>; pageInfo: any; totalCount: number } => {
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

// ─── ID-to-UUID Deterministic Translation Helpers ───────────────────────────
function wpProductIdToUuid(wpId: string | number): string {
  let numericId = String(wpId);
  if (numericId.includes('=')) {
    try {
      const decoded = Buffer.from(numericId, 'base64').toString('utf-8');
      const parts = decoded.split(':');
      if (parts[1]) numericId = parts[1];
    } catch {}
  }
  const padded = numericId.padStart(12, '0');
  return `p1000001-0000-0000-0000-${padded}`;
}

function uuidToWpProductId(uuid: string): string {
  if (uuid.startsWith('p1000001-0000-0000-0000-')) {
    const padded = uuid.substring(24);
    const numericId = parseInt(padded, 10);
    return Buffer.from(`post:${numericId}`).toString('base64');
  }
  return uuid;
}

function wpPostIdToUuid(wpId: string | number): string {
  let numericId = String(wpId);
  if (numericId.includes('=')) {
    try {
      const decoded = Buffer.from(numericId, 'base64').toString('utf-8');
      const parts = decoded.split(':');
      if (parts[1]) numericId = parts[1];
    } catch {}
  }
  const padded = numericId.padStart(12, '0');
  return `b2000001-0000-0000-0000-${padded}`;
}

function uuidToWpPostId(uuid: string): string {
  if (uuid.startsWith('b2000001-0000-0000-0000-')) {
    const padded = uuid.substring(24);
    const numericId = parseInt(padded, 10);
    return Buffer.from(`post:${numericId}`).toString('base64');
  }
  return uuid;
}

// ─── Mappings to Bridge standard WPGraphQL to storefront schema ─────────────
function mapProduct(node: any) {
  if (!node) return null;
  const isSimple = node.__typename === 'SimpleProduct' || node.price !== undefined;
  
  // Clean currency symbols from price
  const cleanPrice = (val?: string) => {
    if (!val) return '0.00';
    return val.replace(/[^\d.]/g, '') || '0.00';
  };

  return {
    id: wpProductIdToUuid(node.id),
    slug: node.slug,
    title: node.name || '',
    description: node.description || node.shortDescription || '',
    price: cleanPrice(node.price),
    compareAtPrice: node.regularPrice ? cleanPrice(node.regularPrice) : null,
    imageUrl: node.image?.sourceUrl || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&q=80',
    galleryImages: (node.galleryImages?.nodes || []).map((img: any) => img.sourceUrl),
    stockStatus: node.stockStatus === 'IN_STOCK' || node.stockStatus === 'instock' ? 'IN_STOCK' : 'OUT_OF_STOCK',
    inventoryCount: node.stockQuantity || (node.stockStatus === 'instock' ? 10 : 0),
    category: node.productCategories?.nodes?.[0]?.name || 'Electronics',
    tags: (node.productTags?.nodes || []).map((t: any) => t.name),
    createdAt: node.date || new Date().toISOString(),
  };
}

function mapPost(node: any) {
  if (!node) return null;
  return {
    id: wpPostIdToUuid(node.id),
    slug: node.slug,
    title: node.title || '',
    excerpt: node.excerpt || '',
    content: node.content || '',
    imageUrl: node.featuredImage?.node?.sourceUrl || 'https://images.unsplash.com/photo-1541140532154-b024d705b90a?w=600&q=80',
    category: node.categories?.nodes?.[0]?.name || 'Tech Guides',
    tags: (node.tags?.nodes || []).map((t: any) => t.name),
    publishedAt: node.date || new Date().toISOString(),
    author: node.author?.node?.name || 'Tech Editorial',
  };
}

// ─── Fetch Helper for Local WordPress Subgraph ──────────────────────────────
async function fetchWordPress(query: string, variables: any = {}) {
  try {
    const res = await fetch(WP_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      timeout: 3000,
    });
    return await res.json();
  } catch (err) {
    console.warn('[WP Gateway] Connection failed. Using local mock fallback...');
    return null;
  }
}

// ─── Resolvers Implementation ───────────────────────────────────────────────
const resolvers = {
  Query: {
    // Users Subgraph Mock
    me: (_: any, __: any, context: any) => {
      if (context.token === MOCK_TOKEN) {
        return MOCK_USER;
      }
      return null;
    },

    // Products Subgraph (Live WordPress/WooCommerce with Fallback)
    products: async (_: any, { first, after, category, search }: any) => {
      const wpQuery = `
        query GetWPProducts($first: Int, $after: String, $search: String) {
          products(first: $first, after: $after, where: { search: $search }) {
            pageInfo {
              hasNextPage
              hasPreviousPage
              startCursor
              endCursor
            }
            edges {
              cursor
              node {
                id
                slug
                name
                description
                shortDescription
                image { sourceUrl }
                galleryImages { nodes { sourceUrl } }
                ... on SimpleProduct {
                  price
                  regularPrice
                  stockStatus
                  stockQuantity
                }
                productCategories { nodes { name } }
                productTags { nodes { name } }
                date
              }
            }
          }
        }
      `;

      const result = await fetchWordPress(wpQuery, { first: first || 10, after, search });
      if (result && result.data && result.data.products) {
        const wpProducts = result.data.products;
        const edges = (wpProducts.edges || []).map((edge: any) => ({
          cursor: edge.cursor,
          node: mapProduct(edge.node),
        }));
        
        let filteredEdges = edges;
        if (category) {
          filteredEdges = edges.filter((e: any) => e.node.category === category);
        }

        return {
          edges: filteredEdges,
          pageInfo: wpProducts.pageInfo,
          totalCount: filteredEdges.length,
        };
      }

      // Fallback
      let list = MOCK_PRODUCTS;
      if (search) {
        const q = search.toLowerCase();
        list = list.filter(p => p.title.toLowerCase().includes(q) || p.tags.some(t => t.includes(q)));
      }
      if (category) {
        list = list.filter(p => p.category === category);
      }
      return paginate(list, first || 10, after);
    },

    product: async (_: any, { id }: any) => {
      const wpId = uuidToWpProductId(id);
      const wpQuery = `
        query GetWPProduct($id: ID!) {
          product(id: $id, idType: ID) {
            id
            slug
            name
            description
            shortDescription
            image { sourceUrl }
            galleryImages { nodes { sourceUrl } }
            ... on SimpleProduct {
              price
              regularPrice
              stockStatus
              stockQuantity
            }
            productCategories { nodes { name } }
            productTags { nodes { name } }
            date
          }
        }
      `;
      const result = await fetchWordPress(wpQuery, { id: wpId });
      if (result && result.data && result.data.product) {
        return mapProduct(result.data.product);
      }

      // Fallback
      return MOCK_PRODUCTS.find(p => p.id === id || p.slug === id) || null;
    },

    featuredProducts: async (_: any, { limit }: any) => {
      const wpQuery = `
        query GetWPFeaturedProducts($first: Int) {
          products(first: $first) {
            edges {
              node {
                id
                slug
                name
                description
                shortDescription
                image { sourceUrl }
                galleryImages { nodes { sourceUrl } }
                ... on SimpleProduct {
                  price
                  regularPrice
                  stockStatus
                  stockQuantity
                }
                productCategories { nodes { name } }
                productTags { nodes { name } }
                date
              }
            }
          }
        }
      `;
      const result = await fetchWordPress(wpQuery, { first: limit || 3 });
      if (result && result.data && result.data.products) {
        return (result.data.products.edges || []).map((e: any) => mapProduct(e.node));
      }

      // Fallback
      return MOCK_PRODUCTS.slice(0, limit || 3);
    },

    // Posts Subgraph (Live WordPress with Fallback)
    posts: async (_: any, { first, after }: any) => {
      const wpQuery = `
        query GetWPPosts($first: Int, $after: String) {
          posts(first: $first, after: $after) {
            pageInfo {
              hasNextPage
              hasPreviousPage
              startCursor
              endCursor
            }
            edges {
              cursor
              node {
                id
                slug
                title
                excerpt
                content
                featuredImage { node { sourceUrl } }
                categories { nodes { name } }
                tags { nodes { name } }
                date
                author { node { name } }
              }
            }
          }
        }
      `;
      const result = await fetchWordPress(wpQuery, { first: first || 10, after });
      if (result && result.data && result.data.posts) {
        const wpPosts = result.data.posts;
        return {
          edges: (wpPosts.edges || []).map((e: any) => ({
            cursor: e.cursor,
            node: mapPost(e.node),
          })),
          pageInfo: wpPosts.pageInfo,
          totalCount: wpPosts.edges?.length || 0,
        };
      }

      // Fallback
      return paginate(MOCK_POSTS, first || 10, after);
    },

    post: async (_: any, { id }: any) => {
      const wpId = uuidToWpPostId(id);
      const wpQuery = `
        query GetWPPost($id: ID!) {
          post(id: $id, idType: ID) {
            id
            slug
            title
            excerpt
            content
            featuredImage { node { sourceUrl } }
            categories { nodes { name } }
            tags { nodes { name } }
            date
            author { node { name } }
          }
        }
      `;
      const result = await fetchWordPress(wpQuery, { id: wpId });
      if (result && result.data && result.data.post) {
        return mapPost(result.data.post);
      }

      // Fallback
      return MOCK_POSTS.find(p => p.id === id || p.slug === id) || null;
    },

    featuredPosts: async (_: any, { limit }: any) => {
      const wpQuery = `
        query GetWPFeaturedPosts($first: Int) {
          posts(first: $first) {
            edges {
              node {
                id
                slug
                title
                excerpt
                content
                featuredImage { node { sourceUrl } }
                categories { nodes { name } }
                tags { nodes { name } }
                date
                author { node { name } }
              }
            }
          }
        }
      `;
      const result = await fetchWordPress(wpQuery, { first: limit || 2 });
      if (result && result.data && result.data.posts) {
        return (result.data.posts.edges || []).map((e: any) => mapPost(e.node));
      }

      // Fallback
      return MOCK_POSTS.slice(0, limit || 2);
    },

    // Orders Mock
    myOrders: (_: any, { first, after }: any) => {
      return paginate(MOCK_ORDERS, first || 10, after);
    },

    order: (_: any, { id }: any) => {
      return MOCK_ORDERS.find(o => o.id === id) || null;
    },

    // AI Companion Mock
    myConversations: () => MOCK_CONVERSATIONS,
    conversation: (_: any, { id }: any) => MOCK_CONVERSATIONS.find(c => c.id === id) || null,
  },

  Mutation: {
    // Auth Mocks
    signIn: (_: any, { input }: any) => {
      if (input.email === 'gio@techallenge.dev') {
        return { token: MOCK_TOKEN, user: MOCK_USER };
      }
      throw new Error('Invalid credentials');
    },

    signUp: (_: any, { input }: any) => {
      const newUser = {
        ...MOCK_USER,
        name: input.name,
        email: input.email,
      };
      return { token: MOCK_TOKEN, user: newUser };
    },

    signOut: () => true,

    // Orders Mock with Idempotency
    createOrder: (_: any, { input }: any, context: any) => {
      const { items, shippingAddress, idempotencyKey } = input;
      const userKey = `${context.userId || 'anon'}:${idempotencyKey}`;
      
      if (idempotencyStore.has(userKey)) {
        return idempotencyStore.get(userKey);
      }

      const orderItems = items.map((item: any, index: number) => {
        // Resolve item from either MOCK or WordPress directly
        const product = MOCK_PRODUCTS.find(p => p.id === item.productId);
        const title = product?.title || 'Tech Product';
        const price = product?.price || '99.00';
        const img = product?.imageUrl || '';
        return {
          id: `oi-${index}-${Date.now()}`,
          productId: item.productId,
          productTitle: title,
          productImageUrl: img,
          quantity: item.quantity,
          unitPrice: price,
          subtotal: (parseFloat(price) * item.quantity).toFixed(2),
        };
      });

      const subtotal = orderItems.reduce((sum: number, oi: any) => sum + parseFloat(oi.subtotal), 0).toFixed(2);
      const newOrder = {
        id: `order-${Date.now()}`,
        userId: MOCK_USER.id,
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

      MOCK_ORDERS.unshift(newOrder);
      idempotencyStore.set(userKey, newOrder);
      return newOrder;
    },

    // Payments Mock with Idempotency
    processPayment: (_: any, { input }: any, context: any) => {
      const { orderId, idempotencyKey } = input;
      const userKey = `payment:${context.userId || 'anon'}:${idempotencyKey}`;

      if (idempotencyStore.has(userKey)) {
        return idempotencyStore.get(userKey);
      }

      const order = MOCK_ORDERS.find(o => o.id === orderId);
      const amount = order?.total || '0.00';

      const payment = {
        id: `pay-${Date.now()}`,
        orderId,
        status: 'CAPTURED',
        amount,
        currency: 'BRL',
        idempotencyKey,
        processedAt: new Date().toISOString(),
      };

      if (order) {
        order.status = 'PAID';
        order.payment = payment;
      }

      idempotencyStore.set(userKey, payment);
      return payment;
    },

    // AI Companion Mocks
    startConversation: () => {
      const conv = {
        id: `conv-${Date.now()}`,
        userId: MOCK_USER.id,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      MOCK_CONVERSATIONS.push(conv);
      return conv;
    },

    sendAIMessage: (_: any, { input }: any) => {
      const { conversationId, content } = input;
      let conv = MOCK_CONVERSATIONS.find(c => c.id === conversationId);
      if (!conv) {
        conv = {
          id: `conv-${Date.now()}`,
          userId: MOCK_USER.id,
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        MOCK_CONVERSATIONS.push(conv);
      }

      const userMsg = {
        id: `msg-user-${Date.now()}`,
        role: 'USER',
        content,
        toolInvocations: [],
        createdAt: new Date().toISOString(),
      };

      // Mocked response containing products dynamically from WordPress or locally
      const assistantMsg = {
        id: `msg-ai-${Date.now()}`,
        role: 'ASSISTANT',
        content: `I analyzed your question about "${content}". Based on the catalogue, I recommend checking out our **Wireless Noise-Cancelling Headphones** (R$ 1.299,90) or **Mechanical RGB Keyboard** (R$ 849,90) for high quality performance. Ready to add them to your cart?`,
        toolInvocations: [
          {
            toolName: 'search_products',
            arguments: JSON.stringify({ query: content }),
            result: JSON.stringify({ found: "Wireless Noise-Cancelling Headphones" }),
            status: 'SUCCESS',
          }
        ],
        createdAt: new Date().toISOString(),
      };

      conv.messages.push(userMsg);
      conv.messages.push(assistantMsg);
      conv.updatedAt = new Date().toISOString();

      return {
        message: assistantMsg,
        conversation: conv,
      };
    },
  },
};

// ─── Standalone Apollo Server Setup ──────────────────────────────────────────
const server = new ApolloServer({
  typeDefs,
  resolvers,
});

async function main() {
  const { url } = await startStandaloneServer(server, {
    context: async ({ req }) => {
      const auth = req.headers.authorization || '';
      const token = auth.replace('Bearer ', '');
      return { token, userId: token === MOCK_TOKEN ? MOCK_USER.id : null };
    },
    listen: { port: 4000 },
  });
  console.log(`🚀 Gateway ready at: ${url}`);
}

main().catch(err => {
  console.error('Fatal Gateway error:', err);
});
