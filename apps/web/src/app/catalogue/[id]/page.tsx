import React from 'react';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { stockBadge } from '../../../components/atoms/Badge';
import { AddToCartButton } from '../../../components/atoms/AddToCartButton';
import { gqlServerFetch } from '../../../lib/graphql-server';
import type { Metadata } from 'next';

export const revalidate = 3600;

interface Product {
  id: string;
  slug: string;
  title: string;
  description: string;
  price: string;
  compareAtPrice?: string | null;
  imageUrl: string;
  galleryImages: string[];
  stockStatus: string;
  inventoryCount: number;
  category: string;
  tags: string[];
}

interface ProductData { product: Product | null }

const PRODUCT_QUERY = `
  query ProductDetail($id: UUID!) {
    product(id: $id) {
      id slug title description price compareAtPrice imageUrl galleryImages
      stockStatus inventoryCount category tags
    }
  }
`;

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  try {
    const data = await gqlServerFetch<ProductData>(PRODUCT_QUERY, { id }, 3600);
    const p = data.product;
    if (!p) return { title: 'Product Not Found' };
    return {
      title: p.title,
      description: p.description,
      openGraph: { title: p.title, description: p.description, images: [{ url: p.imageUrl }] },
    };
  } catch {
    return { title: 'Product' };
  }
}

export default async function ProductDetailPage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let product: Product | null = null;

  try {
    const data = await gqlServerFetch<ProductData>(PRODUCT_QUERY, { id }, 3600);
    product = data.product;
  } catch {
    notFound();
  }

  if (!product) notFound();

  const price = parseFloat(product.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const comparePrice = product.compareAtPrice
    ? parseFloat(product.compareAtPrice).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : null;

  return (
    <main className="container section">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-12)', alignItems: 'start' }}>
        {/* Image */}
        <div className="glass-card" style={{ overflow: 'hidden', borderRadius: 'var(--radius-2xl)', aspectRatio: '4/3', position: 'relative' }}>
          <Image
            src={product.imageUrl}
            alt={product.title}
            fill
            sizes="50vw"
            className="image"
            unoptimized
            style={{ objectFit: 'cover' }}
          />
        </div>

        {/* Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <div>
            <span style={{
              fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              color: 'var(--color-primary-light)',
            }}>
              {product.category}
            </span>
            <h1 className="heading-3" style={{ marginTop: 'var(--space-2)' }}>{product.title}</h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <span style={{ fontSize: 'var(--text-4xl)', fontWeight: 'var(--font-extrabold)' }}>{price}</span>
            {comparePrice && (
              <span style={{ fontSize: 'var(--text-xl)', color: 'var(--color-text-muted)', textDecoration: 'line-through' }}>
                {comparePrice}
              </span>
            )}
          </div>

          <div>{stockBadge(product.stockStatus)}</div>

          <p style={{ color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)' }}>
            {product.description}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {product.tags.map((tag) => (
              <span key={tag} style={{
                padding: '2px 10px', borderRadius: 'var(--radius-full)',
                background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)',
              }}>
                {tag}
              </span>
            ))}
          </div>

          {/* Client island — needs useCart */}
          <AddToCartButton product={{
            id: product.id,
            title: product.title,
            price: product.price,
            imageUrl: product.imageUrl,
            stockStatus: product.stockStatus,
            inventoryCount: product.inventoryCount,
          }} />
        </div>
      </div>
    </main>
  );
}
