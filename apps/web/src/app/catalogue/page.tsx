'use client';

import React, { useState } from 'react';
import { useQuery, gql } from '@apollo/client';
import { ProductCard } from '../../components/molecules/ProductCard';
import { Button } from '../../components/atoms/Button';
import { PageSpinner } from '../../components/atoms/Spinner';

const CATALOGUE_QUERY = gql`
  query CatalogueProducts($first: Int, $after: String, $category: String, $search: String) {
    products(first: $first, after: $after, category: $category, search: $search) {
      edges {
        cursor
        node { id slug title price compareAtPrice imageUrl stockStatus inventoryCount category }
      }
      pageInfo { hasNextPage endCursor }
      totalCount
    }
  }
`;

const PAGE_SIZE = 6;
const CATEGORIES = ['All', 'Electronics', 'Peripherals', 'Displays', 'Furniture', 'Accessories'];

export default function CataloguePage() {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const { data, loading, fetchMore } = useQuery(CATALOGUE_QUERY, {
    variables: {
      first: PAGE_SIZE,
      after: null,
      category: selectedCategory === 'All' ? null : selectedCategory,
      search: search || null,
    },
  });

  const handleLoadMore = async () => {
    const endCursor = data?.products?.pageInfo?.endCursor;
    if (!endCursor) return;
    await fetchMore({ variables: { after: endCursor } });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const handleCategory = (cat: string) => {
    setSelectedCategory(cat);
  };

  const hasNextPage = data?.products?.pageInfo?.hasNextPage;
  const total = data?.products?.totalCount ?? 0;

  return (
    <main className="container section">
      <header style={{ marginBottom: 'var(--space-8)' }}>
        <h1 className="heading-2" style={{ marginBottom: 'var(--space-2)' }}>Product Catalogue</h1>
        <p className="text-muted">{total} products found</p>
      </header>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', marginBottom: 'var(--space-8)', alignItems: 'center' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 'var(--space-2)', flex: 1, minWidth: '260px' }}>
          <input
            id="catalogue-search"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search products..."
            style={{ flex: 1, padding: 'var(--space-2) var(--space-4)', background: 'var(--color-surface)', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)', outline: 'none' }}
          />
          <Button type="submit" size="sm" id="catalogue-search-btn">Search</Button>
        </form>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              id={`filter-${cat.toLowerCase()}`}
              onClick={() => handleCategory(cat)}
              style={{
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--font-semibold)',
                cursor: 'pointer',
                border: `1px solid ${selectedCategory === cat ? 'var(--color-primary)' : 'var(--color-border)'}`,
                background: selectedCategory === cat ? 'rgba(99,102,241,0.12)' : 'transparent',
                color: selectedCategory === cat ? 'var(--color-primary-light)' : 'var(--color-text-secondary)',
                transition: 'all var(--transition-fast)',
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading && !data ? (
        <PageSpinner />
      ) : (
        <>
          <div className="grid-products">
            {(data?.products?.edges ?? []).map((e: any) => (
              <ProductCard key={e.node.id} product={e.node} />
            ))}
          </div>
          {hasNextPage && (
            <div style={{ textAlign: 'center', marginTop: 'var(--space-10)' }}>
              <Button id="load-more-btn" variant="secondary" isLoading={loading} onClick={handleLoadMore}>
                Load More
              </Button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
