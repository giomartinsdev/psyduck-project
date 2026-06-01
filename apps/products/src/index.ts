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

  type Query {
    products(first: Int, after: String, category: String, search: String): ProductConnection!
    product(id: UUID!): Product
    featuredProducts(limit: Int): [Product!]!
  }
`;

// ─── Mock fallback ────────────────────────────────────────────────────────────
// Products live in WooCommerce (seeded by infra/wp-bootstrap.sh on startup).
// This empty array is the fallback when WordPress is unreachable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MOCK_PRODUCTS: any[] = [];


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

function productUuidToWpId(uuid: string): string {
  if (!uuid.startsWith('p1000001-0000-0000-0000-')) return uuid;
  return Buffer.from(`product:${parseInt(uuid.substring(24), 10)}`).toString('base64');
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
    compareAtPrice: (() => { const r = node['regularPrice'] ? clean(node['regularPrice'] as string) : null; const p = clean(node['price'] as string | undefined); return r && r !== p ? r : null; })(),
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        list = list.filter((p: any) => p.title?.toLowerCase().includes(q) || (p.tags ?? []).some((t: string) => t.includes(q)));
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (category) list = list.filter((p: any) => p.category === category);
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

  },

  Product: {
    async __resolveReference(ref: { id: string }) {
      if (ref.id.startsWith('p1000001-0000-0000-0000-')) {
        const wpId = productUuidToWpId(ref.id);
        const result = await fetchWP(
          `query($id:ID!){product(id:$id,idType:ID){id slug name description shortDescription image{sourceUrl}galleryImages{nodes{sourceUrl}}...on SimpleProduct{price regularPrice stockStatus stockQuantity}productCategories{nodes{name}}productTags{nodes{name}}date}}`,
          { id: wpId },
        );
        if (result?.data?.['product']) return mapProduct(result.data['product'] as Record<string, unknown>);
      }
      return MOCK_PRODUCTS.find((p) => p.id === ref.id) ?? null;
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
