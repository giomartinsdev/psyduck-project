'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useCart } from '../../context/CartContext';
import { Button } from '../../components/atoms/Button';

export default function CartPage() {
  const { items, itemCount, subtotal, removeItem, setQuantity } = useCart();
  const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  if (itemCount === 0) {
    return (
      <main className="container section" style={{ textAlign: 'center', paddingTop: 'var(--space-24)' }}>
        <div style={{ fontSize: '4rem', marginBottom: 'var(--space-6)' }}>🛒</div>
        <h1 className="heading-3" style={{ marginBottom: 'var(--space-4)' }}>Your cart is empty</h1>
        <p className="text-muted" style={{ marginBottom: 'var(--space-8)' }}>Looks like you haven't added anything yet.</p>
        <Link href="/catalogue"><Button size="lg" id="cart-browse-btn">Browse Products</Button></Link>
      </main>
    );
  }

  return (
    <main className="container section">
      <h1 className="heading-2" style={{ marginBottom: 'var(--space-8)' }}>Your Cart</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 'var(--space-8)', alignItems: 'start' }}>
        {/* Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {items.map(({ product, quantity }) => (
            <div key={product.id} id={`cart-item-${product.id}`} className="glass-card" style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: 'var(--space-4)', padding: 'var(--space-4)', alignItems: 'center' }}>
              <div style={{ position: 'relative', aspectRatio: '1', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <Image src={product.imageUrl} alt={product.title} fill sizes="80px" unoptimized style={{ objectFit: 'cover' }} />
              </div>
              <div>
                <p style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-1)' }}>{product.title}</p>
                <p style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', color: 'var(--color-primary-light)' }}>
                  {fmt(parseFloat(product.price) * quantity)}
                </p>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{fmt(parseFloat(product.price))} each</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--space-3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  <button onClick={() => setQuantity(product.id, quantity - 1)} style={{ width: '32px', height: '32px', background: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 'var(--text-lg)' }} aria-label="Decrease quantity">−</button>
                  <span style={{ minWidth: '24px', textAlign: 'center', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)' }}>{quantity}</span>
                  <button onClick={() => setQuantity(product.id, quantity + 1)} style={{ width: '32px', height: '32px', background: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 'var(--text-lg)' }} aria-label="Increase quantity">+</button>
                </div>
                <button onClick={() => removeItem(product.id)} style={{ fontSize: 'var(--text-xs)', color: 'var(--color-error)', background: 'none', cursor: 'pointer' }} id={`remove-item-${product.id}`}>Remove</button>
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="glass-card" style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', position: 'sticky', top: 'calc(var(--nav-height) + var(--space-6))' }}>
          <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-semibold)' }}>Order Summary</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              <span>Subtotal ({itemCount} items)</span><span>{fmt(subtotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              <span>Shipping</span><span style={{ color: 'var(--color-success)' }}>Free</span>
            </div>
            <div className="divider" style={{ margin: 0 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)' }}>
              <span>Total</span><span>{fmt(subtotal)}</span>
            </div>
          </div>
          <Link href="/checkout">
            <Button id="cart-checkout-btn" size="lg" fullWidth>Proceed to Checkout</Button>
          </Link>
          <Link href="/catalogue" style={{ textAlign: 'center' }}>
            <Button variant="ghost" size="sm" fullWidth>Continue Shopping</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
