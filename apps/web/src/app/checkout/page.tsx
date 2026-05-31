'use client';

import React, { useState, useEffect } from 'react';
import { useMutation, useApolloClient, gql } from '@apollo/client';
import { useRouter } from 'next/navigation';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/atoms/Button';
import { Input } from '../../components/atoms/Input';
import Link from 'next/link';

const CREATE_ORDER = gql`
  mutation createOrder($input: CreateOrderInput!) {
    createOrder(input: $input) { id status total createdAt }
  }
`;

const PROCESS_PAYMENT = gql`
  mutation processPayment($input: ProcessPaymentInput!) {
    processPayment(input: $input) { id status amount currency processedAt }
  }
`;

// Polled after processPayment returns INITIATED — waits for async consumer to CAPTURE
const POLL_ORDER = gql`
  query PollOrder($id: UUID!) {
    order(id: $id) { id status payment { id status amount currency processedAt } }
  }
`;

type Step = 'shipping' | 'payment' | 'success';

export default function CheckoutPage() {
  const { items, subtotal, clear } = useCart();
  const { user } = useAuth();
  const router = useRouter();
  const idempotencyKeyRef = React.useRef(
    typeof crypto !== 'undefined' ? crypto.randomUUID() : `idem-${Date.now()}`
  );

  const apolloClient = useApolloClient();
  const [step, setStep] = useState<Step>('shipping');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [paymentResult, setPaymentResult] = useState<{ amount: string; status: string } | null>(null);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [shipping, setShipping] = useState({ street: '', city: '', state: '', postalCode: '', country: 'Brasil' });

  const [createOrder, { loading: orderLoading }] = useMutation(CREATE_ORDER);
  const [processPayment, { loading: payLoading }] = useMutation(PROCESS_PAYMENT);

  const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  useEffect(() => {
    if (!user) router.push('/auth/signin?redirect=/checkout');
  }, [user, router]);

  if (items.length === 0 && step !== 'success') {
    return (
      <main className="container section" style={{ textAlign: 'center' }}>
        <h1 className="heading-3">No items in cart</h1>
        <Link href="/catalogue"><Button style={{ marginTop: 'var(--space-6)' }}>Browse Products</Button></Link>
      </main>
    );
  }

  const handleShippingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const { data } = await createOrder({
        variables: {
          input: {
            items: items.map(i => ({ productId: i.product.id, quantity: i.quantity })),
            shippingAddress: shipping,
            idempotencyKey: idempotencyKeyRef.current,
          },
        },
      });
      setOrderId(data.createOrder.id);
      setStep('payment');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handlePayment = async () => {
    if (!orderId) return;
    setError(null);
    try {
      const payKey = `${idempotencyKeyRef.current}-pay`;
      // processPayment returns INITIATED immediately — the async consumer captures it
      await processPayment({
        variables: { input: { orderId, idempotencyKey: payKey } },
      });

      // Poll order(id).payment.status until CAPTURED (consumer finishes async work)
      setPolling(true);
      let capturedResult: { amount: string; status: string } | null = null;
      for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise(r => setTimeout(r, 500));
        const { data } = await apolloClient.query({
          query: POLL_ORDER,
          variables: { id: orderId },
          fetchPolicy: 'network-only',
        });
        const payStatus = data?.order?.payment?.status;
        if (payStatus === 'CAPTURED') {
          capturedResult = { amount: data.order.payment.amount, status: payStatus };
          break;
        }
      }
      setPolling(false);
      if (!capturedResult) throw new Error('Payment confirmation timed out — please check your orders.');
      // Batch both updates so the success page renders with paymentResult already set
      setPaymentResult(capturedResult);
      clear();
      setStep('success');
    } catch (err) {
      setPolling(false);
      setError((err as Error).message);
    }
  };

  if (step === 'success') {
    return (
      <main className="container section" style={{ textAlign: 'center', paddingTop: 'var(--space-20)' }}>
        <div style={{ fontSize: '5rem', marginBottom: 'var(--space-6)', animation: 'scaleIn 0.5s both' }}>✅</div>
        <h1 className="heading-2" style={{ marginBottom: 'var(--space-4)' }}>Order Confirmed!</h1>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
          Payment of <strong>{fmt(parseFloat(paymentResult?.amount ?? '0'))}</strong> captured successfully.
        </p>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-8)' }}>
          Status: <span data-testid="payment-status" style={{ color: 'var(--color-success)' }}>{paymentResult?.status}</span>
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-4)', justifyContent: 'center' }}>
          <Link href="/orders"><Button size="lg" id="success-orders-btn">View My Orders</Button></Link>
          <Link href="/catalogue"><Button size="lg" variant="secondary">Continue Shopping</Button></Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container section">
      <h1 className="heading-2" style={{ marginBottom: 'var(--space-8)' }}>Checkout</h1>

      {/* Steps indicator */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-8)', fontSize: 'var(--text-sm)' }}>
        {(['shipping', 'payment'] as Step[]).map((s, i) => (
          <React.Fragment key={s}>
            <span style={{ fontWeight: step === s ? 'var(--font-semibold)' : undefined, color: step === s ? 'var(--color-primary-light)' : 'var(--color-text-muted)' }}>
              {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
            </span>
            {i < 1 && <span style={{ color: 'var(--color-text-muted)' }}>→</span>}
          </React.Fragment>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 'var(--space-8)', alignItems: 'start' }}>
        <div className="glass-card" style={{ padding: 'var(--space-8)' }}>
          {step === 'shipping' && (
            <form onSubmit={handleShippingSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-2)' }}>Shipping Address</h2>
              <Input id="shipping-street" label="Street" required value={shipping.street} onChange={e => setShipping(p => ({ ...p, street: e.target.value }))} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                <Input id="shipping-city" label="City" required value={shipping.city} onChange={e => setShipping(p => ({ ...p, city: e.target.value }))} />
                <Input id="shipping-state" label="State" required value={shipping.state} onChange={e => setShipping(p => ({ ...p, state: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                <Input id="shipping-postal" label="Postal Code" required value={shipping.postalCode} onChange={e => setShipping(p => ({ ...p, postalCode: e.target.value }))} />
                <Input id="shipping-country" label="Country" required value={shipping.country} onChange={e => setShipping(p => ({ ...p, country: e.target.value }))} />
              </div>
              {error && <p style={{ color: 'var(--color-error)', fontSize: 'var(--text-sm)' }}>{error}</p>}
              <Button type="submit" size="lg" fullWidth isLoading={orderLoading} id="checkout-continue-btn">Continue to Payment</Button>
            </form>
          )}

          {step === 'payment' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
              <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-semibold)' }}>Payment</h2>
              <div className="glass-card" style={{ padding: 'var(--space-4)', background: 'rgba(99,102,241,0.08)' }}>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)' }}>Idempotency Key</p>
                <code style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary-light)', wordBreak: 'break-all' }}>{idempotencyKeyRef.current}</code>
              </div>
              <div style={{ padding: 'var(--space-6)', border: '2px dashed var(--color-border)', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: 'var(--space-3)' }}>💳</div>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>Mock payment terminal — no real card required</p>
              </div>
              {error && <p style={{ color: 'var(--color-error)', fontSize: 'var(--text-sm)' }}>{error}</p>}
              <Button id="checkout-pay-btn" size="lg" fullWidth isLoading={payLoading || polling} onClick={handlePayment}>
                {polling ? 'Confirming payment…' : `Pay ${fmt(subtotal)}`}
              </Button>
            </div>
          )}
        </div>

        {/* Order summary sidebar */}
        <div className="glass-card" style={{ padding: 'var(--space-5)', position: 'sticky', top: 'calc(var(--nav-height) + var(--space-6))' }}>
          <h3 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-4)' }}>Order Summary</h3>
          {items.map(i => (
            <div key={i.product.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 'var(--space-2)' }}>{i.product.title} ×{i.quantity}</span>
              <span>{fmt(parseFloat(i.product.price) * i.quantity)}</span>
            </div>
          ))}
          <div className="divider" />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'var(--font-bold)', fontSize: 'var(--text-lg)' }}>
            <span>Total</span><span>{fmt(subtotal)}</span>
          </div>
        </div>
      </div>
    </main>
  );
}
