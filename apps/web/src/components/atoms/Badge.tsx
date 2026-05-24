import React from 'react';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface BadgeProps { variant?: BadgeVariant; children: React.ReactNode; }

const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
  success: { background: 'var(--color-success-bg)', color: 'var(--color-success)', border: '1px solid rgba(16,185,129,0.25)' },
  warning: { background: 'var(--color-warning-bg)', color: 'var(--color-warning)', border: '1px solid rgba(245,158,11,0.25)' },
  error:   { background: 'var(--color-error-bg)',   color: 'var(--color-error)',   border: '1px solid rgba(244,63,94,0.25)' },
  info:    { background: 'rgba(99,102,241,0.12)',    color: 'var(--color-primary-light)', border: '1px solid rgba(99,102,241,0.25)' },
  neutral: { background: 'var(--color-surface)',     color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' },
};

export function Badge({ variant = 'neutral', children }: BadgeProps) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 10px',
      borderRadius: 'var(--radius-full)',
      fontSize: 'var(--text-xs)',
      fontWeight: 'var(--font-semibold)',
      letterSpacing: '0.03em',
      ...variantStyles[variant],
    }}>
      {children}
    </span>
  );
}

export function stockBadge(status: string) {
  if (status === 'IN_STOCK') return <Badge variant="success">In Stock</Badge>;
  if (status === 'OUT_OF_STOCK') return <Badge variant="error">Out of Stock</Badge>;
  return <Badge variant="warning">Backorder</Badge>;
}

export function orderStatusBadge(status: string) {
  const map: Record<string, BadgeVariant> = {
    PENDING: 'warning', PROCESSING: 'info', PAID: 'success',
    FULFILLED: 'success', CANCELLED: 'error', REFUNDED: 'neutral',
  };
  return <Badge variant={map[status] ?? 'neutral'}>{status}</Badge>;
}
