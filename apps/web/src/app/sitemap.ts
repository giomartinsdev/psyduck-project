import type { MetadataRoute } from 'next';
import { gqlServerFetch } from '../lib/graphql-server';

const SITE_URL = process.env['NEXT_PUBLIC_SITE_URL'] ?? 'http://localhost:3000';

interface ProductNode { id: string }
interface ProductEdge { node: ProductNode }
interface ProductsData { products: { edges: ProductEdge[] } }

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/catalogue`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/ai`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
  ];

  try {
    const data = await gqlServerFetch<ProductsData>(
      `query SitemapProducts { products(first: 100) { edges { node { id } } } }`,
      undefined,
      3600,
    );
    const productRoutes: MetadataRoute.Sitemap = (data.products.edges ?? []).map(({ node }) => ({
      url: `${SITE_URL}/catalogue/${node.id}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));
    return [...staticRoutes, ...productRoutes];
  } catch {
    return staticRoutes;
  }
}
