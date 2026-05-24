import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export function Input({ label, error, helperText, id, className = '', ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {label && (
        <label htmlFor={inputId} style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)' }}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={className}
        style={{
          padding: 'var(--space-3) var(--space-4)',
          background: 'var(--color-surface)',
          border: `1px solid ${error ? 'var(--color-error)' : 'var(--color-border-strong)'}`,
          borderRadius: 'var(--radius-md)',
          color: 'var(--color-text-primary)',
          fontSize: 'var(--text-sm)',
          outline: 'none',
          transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
          width: '100%',
        }}
        {...props}
      />
      {error && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-error)' }}>{error}</span>}
      {helperText && !error && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{helperText}</span>}
    </div>
  );
}
