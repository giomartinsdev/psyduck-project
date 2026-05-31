'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery, gql } from '@apollo/client';
import { ProductCard, ProductCardFragment } from '../components/molecules/ProductCard';
import { PostCard, PostCardFragment } from '../components/molecules/PostCard';
import { Button } from '../components/atoms/Button';
import { PageSpinner } from '../components/atoms/Spinner';

const HOME_QUERY = gql`
  query HomePageData {
    featuredProducts(limit: 3) {
      ...ProductCard
    }
    featuredPosts(limit: 2) {
      ...PostCard
    }
  }
  ${ProductCardFragment}
  ${PostCardFragment}
`;

export default function HomePage() {
  const { data, loading } = useQuery(HOME_QUERY);

  return (
    <main>
      {/* ─── Hero ─────────────────────────────────────────────────── */}
      <section className="section" style={{ paddingTop: 'var(--space-20)', paddingBottom: 'var(--space-20)' }}>
        <div className="container">
          <div style={{ maxWidth: '680px', animation: 'slideUp 0.6s both' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
              padding: 'var(--space-1) var(--space-4)', borderRadius: 'var(--radius-full)',
              background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
              fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)',
              color: 'var(--color-primary-light)', marginBottom: 'var(--space-6)',
            }}>
              <span>✦</span> AI-Powered Shopping Experience
            </div>
            <h1 className="heading-1" style={{ marginBottom: 'var(--space-6)', letterSpacing: '-0.03em' }}>
              Premium Tech Gear,{' '}
              <span className="text-gradient">Curated for You</span>
            </h1>
            <p style={{ fontSize: 'var(--text-xl)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)', marginBottom: 'var(--space-8)' }}>
              Discover a world-class selection of electronics and accessories, with an intelligent AI companion to guide every purchase decision.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
              <Link href="/catalogue">
                <Button size="lg" id="hero-browse-btn">Browse Catalogue</Button>
              </Link>
              <Link href="/ai">
                <Button size="lg" variant="secondary" id="hero-ai-btn">✦ Ask the AI</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Stats ────────────────────────────────────────────────── */}
      <section className="container" style={{ marginBottom: 'var(--space-16)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-4)' }}>
          {[
            { label: 'Products', value: '500+' },
            { label: 'Happy Customers', value: '12k+' },
            { label: 'Avg Rating', value: '4.9 ★' },
            { label: 'Fast Delivery', value: '2 days' },
          ].map(stat => (
            <div key={stat.label} className="glass-card" style={{ padding: 'var(--space-5)', textAlign: 'center' }}>
              <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 'var(--font-extrabold)', background: 'linear-gradient(135deg, var(--color-primary-light), var(--color-accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{stat.value}</div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Featured Products ────────────────────────────────────── */}
      <section className="section container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-8)' }}>
          <h2 className="heading-3">Featured Products</h2>
          <Link href="/catalogue"><Button variant="ghost" size="sm">View All →</Button></Link>
        </div>
        {loading ? <PageSpinner /> : (
          <div className="grid-products">
            {data?.featuredProducts?.map((p: Parameters<typeof ProductCard>[0]['product']) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>

      {/* ─── AI Companion Banner ──────────────────────────────────── */}
      <section className="container section">
        <div className="glass-card" style={{
          padding: 'var(--space-12)',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(6,182,212,0.1) 100%)',
          display: 'grid', gridTemplateColumns: '1fr auto', gap: 'var(--space-8)', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: '3rem', marginBottom: 'var(--space-4)' }}>✦</div>
            <h2 className="heading-3" style={{ marginBottom: 'var(--space-4)' }}>Meet Your AI Shopping Companion</h2>
            <p style={{ color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-relaxed)', maxWidth: '500px' }}>
              Powered by federated MCP tools, our AI can search products, check orders, and make personalised recommendations — all in natural language, all within your authenticated session.
            </p>
          </div>
          <Link href="/ai">
            <Button size="lg" id="banner-ai-btn">Start Chatting</Button>
          </Link>
        </div>
      </section>

      {/* ─── Latest Posts ─────────────────────────────────────────── */}
      <section className="section container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-8)' }}>
          <h2 className="heading-3">From the Blog</h2>
        </div>
        {loading ? <PageSpinner /> : (
          <div className="grid-posts">
            {data?.featuredPosts?.map((p: Parameters<typeof PostCard>[0]['post']) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
