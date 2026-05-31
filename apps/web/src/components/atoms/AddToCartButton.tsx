'use client';

import React from 'react';
import { Button } from './Button';
import { useCart } from '../../context/CartContext';

interface CartProduct {
  id: string;
  title: string;
  price: string;
  imageUrl: string;
  stockStatus: string;
  inventoryCount: number;
}

export function AddToCartButton({ product }: { product: CartProduct }) {
  const { addItem, items } = useCart();
  const inCart = items.find(i => i.product.id === product.id);
  const outOfStock = product.stockStatus !== 'IN_STOCK';

  return (
    <>
      <Button
        id={`detail-add-to-cart-${product.id}`}
        size="lg"
        fullWidth
        disabled={outOfStock}
        onClick={() => addItem({
          id: product.id,
          title: product.title,
          price: product.price,
          imageUrl: product.imageUrl,
          stockStatus: product.stockStatus,
          inventoryCount: product.inventoryCount,
        })}
      >
        {inCart
          ? `In Cart (${inCart.quantity}) — Add More`
          : outOfStock ? 'Out of Stock' : 'Add to Cart'}
      </Button>
      {inCart && (
        <p style={{ textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--color-success)' }}>
          ✓ {inCart.quantity} item{inCart.quantity > 1 ? 's' : ''} in cart
        </p>
      )}
    </>
  );
}
