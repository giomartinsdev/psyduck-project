'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import { Button } from '../../../components/atoms/Button';
import { Input } from '../../../components/atoms/Input';

function SignInForm() {
  const { signIn } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') ?? '/';

  const [email, setEmail] = useState('gio@techallenge.dev');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
      router.push(redirect);
    } catch (err) {
      setError((err as Error).message || 'Invalid credentials. Try gio@techallenge.dev');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 'var(--space-6)' }}>
      <div className="glass-card animate-scale-in" style={{ width: '100%', maxWidth: '400px', padding: 'var(--space-10)' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 'var(--space-4)' }}>◈</div>
          <h1 className="heading-4" style={{ marginBottom: 'var(--space-2)' }}>Welcome back</h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>Sign in to your TechStore account</p>
        </div>

        {/* Demo hint */}
        <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-6)', fontSize: 'var(--text-xs)', color: 'var(--color-success)' }}>
          <strong>Demo credentials pre-filled.</strong> Just click Sign In!
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Input id="signin-email" label="Email" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
          <Input id="signin-password" label="Password" type="password" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
          {error && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-error)', textAlign: 'center' }}>{error}</p>}
          <Button type="submit" size="lg" fullWidth isLoading={loading} id="signin-submit-btn">Sign In</Button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 'var(--space-6)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          Don&apos;t have an account?{' '}
          <Link href="/auth/register" style={{ color: 'var(--color-primary-light)', fontWeight: 'var(--font-semibold)' }}>Register</Link>
        </p>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <React.Suspense fallback={<div style={{ textAlign: 'center', padding: 'var(--space-20)' }}>Loading authentication...</div>}>
      <SignInForm />
    </React.Suspense>
  );
}
