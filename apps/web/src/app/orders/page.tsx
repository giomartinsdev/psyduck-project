'use client';

import React from 'react';
import { useQuery, gql } from '@apollo/client';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { OrderRow, OrderRowFragment } from '../../components/molecules/OrderRow';
import { PageSpinner } from '../../components/atoms/Spinner';
import Link from 'next/link';
import { Button } from '../../components/atoms/Button';

const MY_ORDERS = gql`
  query MyOrders {
    myOrders(first: 20) {
      edges {
        node { ...OrderRow }
      }
    }
  }
  ${OrderRowFragment}
`;

export default function OrdersPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const { data, loading } = useQuery(MY_ORDERS, { skip: !user });

  useEffect(() => {
    if (!isLoading && !user) router.push('/auth/signin?redirect=/orders');
  }, [user, isLoading, router]);

  if (isLoading || loading) return <PageSpinner />;

  const orders = data?.myOrders?.edges?.map((e: { node: unknown }) => e.node) ?? [];

  return (
    <main className="container section">
      <h1 className="heading-2" style={{ marginBottom: 'var(--space-8)' }}>My Orders</h1>
      {orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-16) 0' }}>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)' }}>You haven't placed any orders yet.</p>
          <Link href="/catalogue"><Button id="orders-shop-btn">Start Shopping</Button></Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {orders.map((order: Parameters<typeof OrderRow>[0]['order']) => (
            <OrderRow key={order.id} order={order} />
          ))}
        </div>
      )}
    </main>
  );
}
