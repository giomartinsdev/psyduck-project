'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import { Button } from '../../../components/atoms/Button';
import { Input } from '../../../components/atoms/Input';

export default function RegisterPage() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signUp(name, email, password);
      router.push('/auth/signin');
    } catch (err) {
      setError((err as Error).message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 'var(--space-6)' }}>
      <div className="glass-card animate-scale-in" style={{ width: '100%', maxWidth: '400px', padding: 'var(--space-10)' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 'var(--space-4)' }}>◈</div>
          <h1 className="heading-4" style={{ marginBottom: 'var(--space-2)' }}>Create Account</h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>Join TechStore today</p>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Input id="register-name" label="Full Name" required value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
          <Input id="register-email" label="Email" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
          <Input id="register-password" label="Password" type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} helperText="At least 8 characters" autoComplete="new-password" />
          {error && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-error)', textAlign: 'center' }}>{error}</p>}
          <Button type="submit" size="lg" fullWidth isLoading={loading} id="register-submit-btn">Create Account</Button>
        </form>
        <p style={{ textAlign: 'center', marginTop: 'var(--space-6)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          Already have an account?{' '}
          <Link href="/auth/signin" style={{ color: 'var(--color-primary-light)', fontWeight: 'var(--font-semibold)' }}>Sign In</Link>
        </p>
      </div>
    </main>
  );
}
