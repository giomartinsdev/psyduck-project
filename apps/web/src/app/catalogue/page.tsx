import { gqlServerFetch } from '../../lib/graphql-server';
import { CatalogueClient } from './CatalogueClient';
import type { ProductCardData } from '../../components/molecules/ProductCard';

export const revalidate = 60;

interface ProductEdge { cursor: string; node: ProductCardData }
interface InitialData {
  products: {
    edges: ProductEdge[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    totalCount: number;
  };
}

const INITIAL_CATALOGUE_QUERY = `
  query InitialCatalogue {
    products(first: 6) {
      edges {
        cursor
        node {
          id slug title price compareAtPrice imageUrl stockStatus inventoryCount category
        }
      }
      pageInfo { hasNextPage endCursor }
      totalCount
    }
  }
`;

export default async function CataloguePage() {
  let initialProducts: InitialData['products'] = {
    edges: [],
    pageInfo: { hasNextPage: false, endCursor: null },
    totalCount: 0,
  };

  try {
    const data = await gqlServerFetch<InitialData>(INITIAL_CATALOGUE_QUERY);
    initialProducts = data.products;
  } catch {
    // Render with empty initial state; client will fetch on mount
  }

  return <CatalogueClient initialProducts={initialProducts} />;
}
