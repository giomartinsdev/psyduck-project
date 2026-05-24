import React from 'react';

interface SpinnerProps { size?: number; color?: string; }

export function Spinner({ size = 24, color = 'var(--color-primary)' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        border: `2px solid rgba(255,255,255,0.1)`,
        borderTopColor: color,
        animation: 'spin 0.7s linear infinite',
        flexShrink: 0,
      }}
    />
  );
}

export function PageSpinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}>
      <Spinner size={40} />
    </div>
  );
}
