'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { stockBadge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { useCart } from '../../context/CartContext';
import styles from './ProductCard.module.css';

export interface ProductCardData {
  id: string;
  slug: string;
  title: string;
  price: string;
  compareAtPrice?: string | null;
  imageUrl: string;
  stockStatus: string;
  inventoryCount: number;
  category: string;
}

interface ProductCardProps { product: ProductCardData; }

export function ProductCard({ product }: ProductCardProps) {
  const { addItem } = useCart();

  const discount = product.compareAtPrice
    ? Math.round((1 - parseFloat(product.price) / parseFloat(product.compareAtPrice)) * 100)
    : null;

  const formatPrice = (p: string) =>
    parseFloat(p).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <article className={`glass-card ${styles.card}`} id={`product-card-${product.id}`}>
      <Link href={`/catalogue/${product.id}`} className={styles.imageLink}>
        <div className={styles.imageWrapper}>
          <Image
            src={product.imageUrl}
            alt={product.title}
            fill
            sizes="(max-width: 768px) 100vw, 300px"
            className={styles.image}
            unoptimized
          />
          {discount && (
            <span className={styles.discountBadge}>-{discount}%</span>
          )}
          <div className={styles.stockOverlay}>
            {stockBadge(product.stockStatus)}
          </div>
        </div>
      </Link>

      <div className={styles.body}>
        <span className={styles.category}>{product.category}</span>
        <Link href={`/catalogue/${product.id}`}>
          <h3 className={styles.title}>{product.title}</h3>
        </Link>
        <div className={styles.pricing}>
          <span className={styles.price}>{formatPrice(product.price)}</span>
          {product.compareAtPrice && (
            <span className={styles.comparePrice}>{formatPrice(product.compareAtPrice)}</span>
          )}
        </div>
        <Button
          id={`add-to-cart-${product.id}`}
          fullWidth
          size="sm"
          disabled={product.stockStatus !== 'IN_STOCK'}
          onClick={() => addItem({
            id: product.id,
            title: product.title,
            price: product.price,
            imageUrl: product.imageUrl,
            stockStatus: product.stockStatus,
            inventoryCount: product.inventoryCount,
          })}
        >
          {product.stockStatus === 'IN_STOCK' ? 'Add to Cart' : 'Out of Stock'}
        </Button>
      </div>
    </article>
  );
}
