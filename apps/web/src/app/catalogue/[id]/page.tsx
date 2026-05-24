'use client';

import React from 'react';
import { useQuery, gql } from '@apollo/client';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { Button } from '../../../components/atoms/Button';
import { stockBadge } from '../../../components/atoms/Badge';
import { PageSpinner } from '../../../components/atoms/Spinner';
import { useCart } from '../../../context/CartContext';

const PRODUCT_QUERY = gql`
  query ProductDetail($id: UUID!) {
    product(id: $id) {
      id slug title description price compareAtPrice imageUrl stockStatus inventoryCount category tags
    }
  }
`;

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { addItem, items } = useCart();
  const { data, loading } = useQuery(PRODUCT_QUERY, { variables: { id } });
  const product = data?.product;

  if (loading) return <PageSpinner />;
  if (!product) return <main className="container section"><p>Product not found.</p></main>;

  const inCart = items.find(i => i.product.id === product.id);
  const price = parseFloat(product.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const comparePrice = product.compareAtPrice
    ? parseFloat(product.compareAtPrice).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : null;

  return (
    <main className="container section">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-12)', alignItems: 'start' }}>
        {/* Image */}
        <div className="glass-card" style={{ overflow: 'hidden', borderRadius: 'var(--radius-2xl)', aspectRatio: '4/3', position: 'relative' }}>
          <Image src={product.imageUrl} alt={product.title} fill sizes="50vw" className="image" unoptimized style={{ objectFit: 'cover' }} />
        </div>

        {/* Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <div>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-primary-light)' }}>
              {product.category}
            </span>
            <h1 className="heading-3" style={{ marginTop: 'var(--space-2)' }}>{product.title}</h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <span style={{ fontSize: 'var(--text-4xl)', fontWeight: 'var(--font-extrabold)' }}>{price}</span>
            {comparePrice && <span style={{ fontSize: 'var(--text-xl)', color: 'var(--color-text-muted)', textDecoration: 'line-through' }}>{comparePrice}</span>}
          </div>

          <div>{stockBadge(product.stockStatus)}</div>

          <p style={{ color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)' }}>{product.description}</p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {product.tags.map((tag: string) => (
              <span key={tag} style={{ padding: '2px 10px', borderRadius: 'var(--radius-full)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                {tag}
              </span>
            ))}
          </div>

          <Button
            id={`detail-add-to-cart-${product.id}`}
            size="lg"
            fullWidth
            disabled={product.stockStatus !== 'IN_STOCK'}
            onClick={() => addItem({
              id: product.id, title: product.title, price: product.price,
              imageUrl: product.imageUrl, stockStatus: product.stockStatus, inventoryCount: product.inventoryCount,
            })}
          >
            {inCart ? `In Cart (${inCart.quantity}) — Add More` : product.stockStatus === 'IN_STOCK' ? 'Add to Cart' : 'Out of Stock'}
          </Button>

          {inCart && (
            <p style={{ textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--color-success)' }}>
              ✓ {inCart.quantity} item{inCart.quantity > 1 ? 's' : ''} in cart
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
