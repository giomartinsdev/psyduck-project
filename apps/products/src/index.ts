import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { gql } from 'graphql-tag';
import fetch from 'node-fetch';

const WP_GRAPHQL_URL = process.env['WP_GRAPHQL_URL'] ?? 'http://localhost:8080/graphql';

// ─── Federated SDL ────────────────────────────────────────────────────────────
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

  enum StockStatus {
    IN_STOCK
    OUT_OF_STOCK
    ON_BACKORDER
  }

  type Product @key(fields: "id") {
    id: UUID!
    slug: String!
    title: String!
    description: String!
    price: Decimal!
    compareAtPrice: Decimal
    imageUrl: String!
    galleryImages: [String!]!
    stockStatus: StockStatus!
    inventoryCount: Int!
    category: String!
    tags: [String!]!
    createdAt: DateTime!
  }

  type ProductEdge {
    cursor: String!
    node: Product!
  }

  type ProductConnection {
    edges: [ProductEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type Post @key(fields: "id") {
    id: UUID!
    slug: String!
    title: String!
    excerpt: String!
    content: String!
    imageUrl: String!
    category: String!
    tags: [String!]!
    publishedAt: DateTime!
    author: String!
  }

  type PostEdge {
    cursor: String!
    node: Post!
  }

  type PostConnection {
    edges: [PostEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type Query {
    products(first: Int, after: String, category: String, search: String): ProductConnection!
    product(id: UUID!): Product
    featuredProducts(limit: Int): [Product!]!
    posts(first: Int, after: String, category: String): PostConnection!
    post(id: UUID!): Post
    featuredPosts(limit: Int): [Post!]!
  }
`;

// ─── Mock fallback data ───────────────────────────────────────────────────────
const MOCK_PRODUCTS = [
  {
    id: 'p1000001-0000-0000-0000-000000000001',
    slug: 'wireless-noise-cancelling-headphones',
    title: 'Wireless Noise-Cancelling Headphones',
    description: 'Premium over-ear headphones with active noise cancellation and 30-hour battery.',
    price: '1299.90',
    compareAtPrice: '1799.90',
    imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&q=80',
    galleryImages: [] as string[],
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
    description: 'Compact 75% layout mechanical keyboard with hot-swappable switches.',
    price: '849.90',
    compareAtPrice: null as string | null,
    imageUrl: 'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?w=600&q=80',
    galleryImages: [] as string[],
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
    description: '34-inch curved ultra-wide monitor with 3440×1440, 144Hz, HDR.',
    price: '3499.00',
    compareAtPrice: '4199.00',
    imageUrl: 'https://images.unsplash.com/photo-1527443224154-c4a573d5f000?w=600&q=80',
    galleryImages: [] as string[],
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
    excerpt: 'Tactile feedback and key precision can dramatically improve your workflow.',
    content: 'Mechanical keyboards offer tactile feedback and precision switches.',
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
    excerpt: "Here's our curated guide to the best ergonomic and display gear.",
    content: 'Transform your home workspace with high-end ergonomic gear.',
    imageUrl: 'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=600&q=80',
    category: 'Buying Guides',
    tags: ['home-office', 'setup', 'ergonomics'],
    publishedAt: '2026-05-14T09:00:00Z',
    author: 'Tech Editorial',
  },
];

// ─── Cursor pagination helpers ────────────────────────────────────────────────
const encodeCursor = (offset: number) => Buffer.from(`offset:${offset}`).toString('base64');
const decodeCursor = (cursor: string) => {
  try {
    return parseInt(Buffer.from(cursor, 'base64').toString().split(':')[1] ?? '0', 10);
  } catch {
    return 0;
  }
};

function paginate<T>(items: T[], first = 10, after?: string | null) {
  const start = after ? decodeCursor(after) + 1 : 0;
  const slice = items.slice(start, start + first);
  const edges = slice.map((node, i) => ({ cursor: encodeCursor(start + i), node }));
  return {
    edges,
    pageInfo: {
      hasNextPage: start + first < items.length,
      hasPreviousPage: start > 0,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges[edges.length - 1]?.cursor ?? null,
    },
    totalCount: items.length,
  };
}

// ─── WP ID ↔ UUID helpers ─────────────────────────────────────────────────────
function wpIdToProductUuid(wpId: string | number): string {
  let numeric = String(wpId);
  if (numeric.includes('=')) {
    try {
      const dec = Buffer.from(numeric, 'base64').toString();
      numeric = dec.split(':')[1] ?? numeric;
    } catch {}
  }
  return `p1000001-0000-0000-0000-${numeric.padStart(12, '0')}`;
}

function wpIdToPostUuid(wpId: string | number): string {
  let numeric = String(wpId);
  if (numeric.includes('=')) {
    try {
      const dec = Buffer.from(numeric, 'base64').toString();
      numeric = dec.split(':')[1] ?? numeric;
    } catch {}
  }
  return `b2000001-0000-0000-0000-${numeric.padStart(12, '0')}`;
}

function productUuidToWpId(uuid: string): string {
  if (!uuid.startsWith('p1000001-0000-0000-0000-')) return uuid;
  return Buffer.from(`post:${parseInt(uuid.substring(24), 10)}`).toString('base64');
}

function postUuidToWpId(uuid: string): string {
  if (!uuid.startsWith('b2000001-0000-0000-0000-')) return uuid;
  return Buffer.from(`post:${parseInt(uuid.substring(24), 10)}`).toString('base64');
}

// ─── WP response mappers ──────────────────────────────────────────────────────
function mapProduct(node: Record<string, unknown>) {
  const clean = (v?: string) => (v ? v.replace(/[^\d.]/g, '') || '0.00' : '0.00');
  return {
    id: wpIdToProductUuid(node['id'] as string),
    slug: node['slug'] as string,
    title: (node['name'] as string) || '',
    description: (node['description'] as string) || (node['shortDescription'] as string) || '',
    price: clean((node['price'] as string | undefined)),
    compareAtPrice: node['regularPrice'] ? clean(node['regularPrice'] as string) : null,
    imageUrl:
      ((node['image'] as Record<string, string> | undefined)?.['sourceUrl']) ||
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&q=80',
    galleryImages: ((node['galleryImages'] as { nodes: { sourceUrl: string }[] } | undefined)?.nodes ?? []).map(
      (img) => img.sourceUrl,
    ),
    stockStatus:
      node['stockStatus'] === 'IN_STOCK' || node['stockStatus'] === 'instock'
        ? 'IN_STOCK'
        : 'OUT_OF_STOCK',
    inventoryCount: (node['stockQuantity'] as number | undefined) ?? 0,
    category:
      ((node['productCategories'] as { nodes: { name: string }[] } | undefined)?.nodes?.[0]?.name) || 'Electronics',
    tags: ((node['productTags'] as { nodes: { name: string }[] } | undefined)?.nodes ?? []).map((t) => t.name),
    createdAt: (node['date'] as string | undefined) || new Date().toISOString(),
  };
}

function mapPost(node: Record<string, unknown>) {
  return {
    id: wpIdToPostUuid(node['id'] as string),
    slug: node['slug'] as string,
    title: (node['title'] as string) || '',
    excerpt: (node['excerpt'] as string) || '',
    content: (node['content'] as string) || '',
    imageUrl:
      ((node['featuredImage'] as { node: { sourceUrl: string } } | undefined)?.node?.sourceUrl) ||
      'https://images.unsplash.com/photo-1541140532154-b024d705b90a?w=600&q=80',
    category:
      ((node['categories'] as { nodes: { name: string }[] } | undefined)?.nodes?.[0]?.name) || 'Tech Guides',
    tags: ((node['tags'] as { nodes: { name: string }[] } | undefined)?.nodes ?? []).map((t) => t.name),
    publishedAt: (node['date'] as string | undefined) || new Date().toISOString(),
    author: ((node['author'] as { node: { name: string } } | undefined)?.node?.name) || 'Tech Editorial',
  };
}

async function fetchWP(query: string, variables: Record<string, unknown> = {}) {
  try {
    const res = await fetch(WP_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    return (await res.json()) as { data?: Record<string, unknown> };
  } catch {
    console.warn('[Products] WP unavailable, using mock fallback');
    return null;
  }
}

// ─── Resolvers ────────────────────────────────────────────────────────────────
const resolvers = {
  Query: {
    products: async (_: unknown, { first, after, category, search }: Record<string, unknown>) => {
      const result = await fetchWP(
        `query($first:Int,$after:String,$search:String){products(first:$first,after:$after,where:{search:$search}){pageInfo{hasNextPage hasPreviousPage startCursor endCursor}edges{cursor node{id slug name description shortDescription image{sourceUrl}galleryImages{nodes{sourceUrl}}...on SimpleProduct{price regularPrice stockStatus stockQuantity}productCategories{nodes{name}}productTags{nodes{name}}date}}}}`,
        { first: first ?? 10, after, search },
      );
      if (result?.data?.['products']) {
        const wp = result.data['products'] as { edges: { cursor: string; node: Record<string, unknown> }[]; pageInfo: unknown };
        let edges = wp.edges.map((e) => ({ cursor: e.cursor, node: mapProduct(e.node) }));
        if (category) edges = edges.filter((e) => e.node.category === category);
        return { edges, pageInfo: wp.pageInfo, totalCount: edges.length };
      }
      let list = MOCK_PRODUCTS;
      if (search) {
        const q = (search as string).toLowerCase();
        list = list.filter((p) => p.title.toLowerCase().includes(q) || p.tags.some((t) => t.includes(q)));
      }
      if (category) list = list.filter((p) => p.category === category);
      return paginate(list, (first as number | undefined) ?? 10, after as string | undefined);
    },

    product: async (_: unknown, { id }: { id: string }) => {
      const wpId = productUuidToWpId(id);
      const result = await fetchWP(
        `query($id:ID!){product(id:$id,idType:ID){id slug name description shortDescription image{sourceUrl}galleryImages{nodes{sourceUrl}}...on SimpleProduct{price regularPrice stockStatus stockQuantity}productCategories{nodes{name}}productTags{nodes{name}}date}}`,
        { id: wpId },
      );
      if (result?.data?.['product']) return mapProduct(result.data['product'] as Record<string, unknown>);
      return MOCK_PRODUCTS.find((p) => p.id === id || p.slug === id) ?? null;
    },

    featuredProducts: async (_: unknown, { limit }: { limit?: number }) => {
      const result = await fetchWP(
        `query($first:Int){products(first:$first){edges{node{id slug name description shortDescription image{sourceUrl}galleryImages{nodes{sourceUrl}}...on SimpleProduct{price regularPrice stockStatus stockQuantity}productCategories{nodes{name}}productTags{nodes{name}}date}}}}`,
        { first: limit ?? 3 },
      );
      if (result?.data?.['products']) {
        const wp = result.data['products'] as { edges: { node: Record<string, unknown> }[] };
        return wp.edges.map((e) => mapProduct(e.node));
      }
      return MOCK_PRODUCTS.slice(0, limit ?? 3);
    },

    posts: async (_: unknown, { first, after }: Record<string, unknown>) => {
      const result = await fetchWP(
        `query($first:Int,$after:String){posts(first:$first,after:$after){pageInfo{hasNextPage hasPreviousPage startCursor endCursor}edges{cursor node{id slug title excerpt content featuredImage{node{sourceUrl}}categories{nodes{name}}tags{nodes{name}}date author{node{name}}}}}}`,
        { first: first ?? 10, after },
      );
      if (result?.data?.['posts']) {
        const wp = result.data['posts'] as { edges: { cursor: string; node: Record<string, unknown> }[]; pageInfo: unknown };
        return { edges: wp.edges.map((e) => ({ cursor: e.cursor, node: mapPost(e.node) })), pageInfo: wp.pageInfo, totalCount: wp.edges.length };
      }
      return paginate(MOCK_POSTS, (first as number | undefined) ?? 10, after as string | undefined);
    },

    post: async (_: unknown, { id }: { id: string }) => {
      const wpId = postUuidToWpId(id);
      const result = await fetchWP(
        `query($id:ID!){post(id:$id,idType:ID){id slug title excerpt content featuredImage{node{sourceUrl}}categories{nodes{name}}tags{nodes{name}}date author{node{name}}}}`,
        { id: wpId },
      );
      if (result?.data?.['post']) return mapPost(result.data['post'] as Record<string, unknown>);
      return MOCK_POSTS.find((p) => p.id === id || p.slug === id) ?? null;
    },

    featuredPosts: async (_: unknown, { limit }: { limit?: number }) => {
      const result = await fetchWP(
        `query($first:Int){posts(first:$first){edges{node{id slug title excerpt content featuredImage{node{sourceUrl}}categories{nodes{name}}tags{nodes{name}}date author{node{name}}}}}}`,
        { first: limit ?? 2 },
      );
      if (result?.data?.['posts']) {
        const wp = result.data['posts'] as { edges: { node: Record<string, unknown> }[] };
        return wp.edges.map((e) => mapPost(e.node));
      }
      return MOCK_POSTS.slice(0, limit ?? 2);
    },
  },

  Product: {
    __resolveReference(ref: { id: string }) {
      return MOCK_PRODUCTS.find((p) => p.id === ref.id) ?? null;
    },
  },

  Post: {
    __resolveReference(ref: { id: string }) {
      return MOCK_POSTS.find((p) => p.id === ref.id) ?? null;
    },
  },
};

// ─── Server bootstrap ─────────────────────────────────────────────────────────
const server = new ApolloServer({
  schema: buildSubgraphSchema({ typeDefs, resolvers }),
});

async function main() {
  const port = Number(process.env['PORT'] ?? 4002);
  const { url } = await startStandaloneServer(server, { listen: { port } });
  console.log(`🛍️  Products subgraph running at: ${url}`);
}

main().catch((err) => {
  console.error('Fatal error in Products subgraph:', err);
  process.exit(1);
});
