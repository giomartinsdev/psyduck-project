'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAI } from '../../context/AIContext';
import { PageSpinner } from '../../components/atoms/Spinner';

export default function AIPage() {
  const router = useRouter();
  const { openDrawer } = useAI();

  useEffect(() => {
    openDrawer();
    router.replace('/');
  }, [openDrawer, router]);

  return (
    <main className="container section" style={{ textAlign: 'center', paddingTop: 'var(--space-20)' }}>
      <PageSpinner />
      <p style={{ marginTop: 'var(--space-4)', color: 'var(--color-text-secondary)' }}>
        Opening AI Shopping Companion...
      </p>
    </main>
  );
}
