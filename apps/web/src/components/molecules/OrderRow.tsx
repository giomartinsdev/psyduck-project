import React from 'react';
import { orderStatusBadge } from '../atoms/Badge';

export interface OrderRowData {
  id: string;
  status: string;
  total: string;
  createdAt: string;
  items: Array<{ productTitle: string; quantity: number }>;
}

export function OrderRow({ order }: { order: OrderRowData }) {
  const date = new Date(order.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  const total = parseFloat(order.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const summary = order.items.map(i => `${i.productTitle} ×${i.quantity}`).join(', ');

  return (
    <article style={{
      display: 'grid', gridTemplateColumns: '1fr auto auto',
      alignItems: 'center', gap: 'var(--space-4)',
      padding: 'var(--space-4) var(--space-5)',
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      transition: 'border-color var(--transition-fast)',
    }}
    id={`order-row-${order.id}`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 0 }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
          #{order.id.slice(0, 8).toUpperCase()}
        </span>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {summary}
        </span>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{date}</span>
      </div>
      <span style={{ fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>{total}</span>
      {orderStatusBadge(order.status)}
    </article>
  );
}
