'use client';

import React, { useState } from 'react';
import { useQuery, gql } from '@apollo/client';
import { ProductCard, ProductCardFragment } from '../../components/molecules/ProductCard';
import type { ProductCardData } from '../../components/molecules/ProductCard';
import { Button } from '../../components/atoms/Button';
import { PageSpinner } from '../../components/atoms/Spinner';

const CATALOGUE_QUERY = gql`
  query CatalogueProducts($first: Int, $after: String, $category: String, $search: String) {
    products(first: $first, after: $after, category: $category, search: $search) {
      edges {
        cursor
        node { ...ProductCard }
      }
      pageInfo { hasNextPage endCursor }
      totalCount
    }
  }
  ${ProductCardFragment}
`;

const PAGE_SIZE = 6;
const CATEGORIES = ['All', 'Electronics', 'Peripherals', 'Displays', 'Furniture', 'Accessories'];

interface ProductEdge { cursor: string; node: ProductCardData }
interface ProductsConnection {
  edges: ProductEdge[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  totalCount: number;
}

interface Props {
  initialProducts: ProductsConnection;
}

export function CatalogueClient({ initialProducts }: Props) {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const isFiltered = selectedCategory !== 'All' || search !== '';

  const { data, loading, fetchMore } = useQuery(CATALOGUE_QUERY, {
    variables: {
      first: PAGE_SIZE,
      after: null,
      category: selectedCategory === 'All' ? null : selectedCategory,
      search: search || null,
    },
    skip: !isFiltered,
  });

  const activeProducts: ProductsConnection = isFiltered
    ? (data?.products ?? { edges: [], pageInfo: { hasNextPage: false, endCursor: null }, totalCount: 0 })
    : initialProducts;

  const handleLoadMore = async () => {
    const endCursor = activeProducts.pageInfo.endCursor;
    if (!endCursor) return;
    await fetchMore({ variables: { after: endCursor } });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const handleCategory = (cat: string) => {
    setSelectedCategory(cat);
    setSearch('');
    setSearchInput('');
  };

  const hasNextPage = activeProducts.pageInfo.hasNextPage;
  const total = activeProducts.totalCount;

  return (
    <main className="container section">
      <header style={{ marginBottom: 'var(--space-8)' }}>
        <h1 className="heading-2" style={{ marginBottom: 'var(--space-2)' }}>Product Catalogue</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>{total} products</p>
      </header>

      {/* Search */}
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
        <input
          id="catalogue-search"
          className="input"
          type="text"
          placeholder="Search products..."
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          style={{
            flex: 1, padding: 'var(--space-3) var(--space-4)',
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)', color: 'var(--color-text-primary)',
            fontSize: 'var(--text-sm)',
          }}
        />
        <Button type="submit" variant="secondary" size="md">Search</Button>
        {search && <Button variant="ghost" size="md" onClick={() => { setSearch(''); setSearchInput(''); }}>Clear</Button>}
      </form>

      {/* Category Tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-8)' }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            id={`category-${cat.toLowerCase()}`}
            onClick={() => handleCategory(cat)}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              borderRadius: 'var(--radius-full)',
              border: '1px solid',
              borderColor: selectedCategory === cat ? 'var(--color-primary)' : 'var(--color-border)',
              background: selectedCategory === cat ? 'rgba(99,102,241,0.15)' : 'transparent',
              color: selectedCategory === cat ? 'var(--color-primary-light)' : 'var(--color-text-secondary)',
              fontSize: 'var(--text-sm)', cursor: 'pointer', transition: 'all var(--transition-fast)',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? <PageSpinner /> : (
        <>
          <div className="grid-products">
            {activeProducts.edges.map(({ node }) => (
              <ProductCard key={node.id} product={node} />
            ))}
          </div>
          {activeProducts.edges.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', padding: 'var(--space-16) 0' }}>
              No products found.
            </p>
          )}
          {hasNextPage && (
            <div style={{ textAlign: 'center', marginTop: 'var(--space-10)' }}>
              <Button id="load-more-btn" variant="secondary" onClick={handleLoadMore}>Load More</Button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
