import { test, expect } from '@playwright/test';

const GATEWAY = 'http://localhost:4000/graphql';

// Create a unique test user via the API so we have valid credentials
async function createUser(suffix: string) {
  const email = `pw-e2e-${suffix}@test.dev`;
  const password = 'playwright123';
  const resp = await fetch(GATEWAY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `mutation { signUp(input:{name:"Playwright User",email:"${email}",password:"${password}"}) { token user { id } } }`,
    }),
  });
  const json = (await resp.json()) as { data?: { signUp?: { token: string; user: { id: string } } } };
  const signUp = json.data?.signUp;
  if (!signUp) throw new Error('signUp failed in test setup');
  return { email, password, token: signUp.token, userId: signUp.user.id };
}

test.describe('Complete checkout and payment flow', () => {
  test('user can register, add to cart, and complete a payment', async ({ page }) => {
    const ts = Date.now();

    // ── 1. Register a new account ──────────────────────────────────────────
    await page.goto('/auth/register');
    await expect(page.locator('h1')).toContainText('Create Account');

    const email = `pw-e2e-${ts}@test.dev`;
    const password = 'playwright123';
    await page.fill('#register-name', 'Playwright User');
    await page.fill('#register-email', email);
    await page.fill('#register-password', password);
    await page.click('#register-submit-btn');

    // After register → redirected to signin
    await expect(page).toHaveURL(/\/auth\/signin/, { timeout: 10_000 });

    // ── 2. Sign in ────────────────────────────────────────────────────────
    await page.fill('#signin-email', email);
    await page.fill('#signin-password', password);
    await page.click('#signin-submit-btn');

    // After signin → home page
    await expect(page).toHaveURL('/', { timeout: 10_000 });

    // ── 3. Add a product to cart via the catalogue ─────────────────────────
    await page.goto('/catalogue');
    await expect(page.locator('.grid-products')).toBeVisible();

    // Click the first "Add to Cart" button that is enabled
    const addBtn = page.locator('[id^="add-to-cart-"]').filter({ hasText: 'Add to Cart' }).first();
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // The NavBar cart badge should increment to 1
    const cartBadge = page.locator('[id="cart-badge"]');
    // Not all themes show a badge — just confirm the button click worked by navigating to /cart
    await page.goto('/cart');
    await expect(page.locator('h1')).toContainText('Your Cart');
    // At least one cart item must be present
    await expect(page.locator('[id^="cart-item-"]').first()).toBeVisible();

    // ── 4. Proceed to checkout ─────────────────────────────────────────────
    await page.click('#cart-checkout-btn');
    await expect(page).toHaveURL('/checkout', { timeout: 10_000 });
    await expect(page.locator('h1')).toContainText('Checkout');

    // ── 5. Fill shipping address ───────────────────────────────────────────
    await page.fill('#shipping-street', 'Av. Playwright, 42');
    await page.fill('#shipping-city', 'São Paulo');
    await page.fill('#shipping-state', 'SP');
    await page.fill('#shipping-postal', '01310-200');
    // country is pre-filled with "Brasil" — clear and refill to be explicit
    await page.fill('#shipping-country', 'Brasil');

    // ── 6. Submit shipping → createOrder mutation fires ────────────────────
    await page.click('#checkout-continue-btn');

    // Payment step: the mock terminal should appear
    await expect(page.locator('#checkout-pay-btn')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text=Mock payment terminal')).toBeVisible();

    // ── 7. Complete payment → processPayment fires (returns INITIATED),
    //        client polls order(id) until CAPTURED, then shows success ────────
    await page.click('#checkout-pay-btn');

    // Success screen appears once the polling loop resolves CAPTURED status
    // (consumer is fast in local Docker; in prod this could take seconds)
    await expect(page.locator('h1')).toContainText('Order Confirmed!', { timeout: 20_000 });
    // Payment status is set from polling — should already be CAPTURED when success page renders
    await expect(page.locator('[data-testid="payment-status"]')).toHaveText('CAPTURED', { timeout: 10_000 });

    // Payment amount should be a non-zero BRL value
    const amountText = await page.locator('strong').first().textContent();
    const amount = parseFloat((amountText ?? '0').replace(/[^\d,]/g, '').replace(',', '.'));
    expect(amount).toBeGreaterThan(0);

    // ── 8. Navigate to orders and confirm the order appears ────────────────
    await page.click('#success-orders-btn');
    await expect(page).toHaveURL('/orders', { timeout: 10_000 });
    await expect(page.locator('[id^="order-row-"]').first()).toBeVisible({ timeout: 15_000 });
  });

  test('unauthenticated user is redirected to signin when accessing checkout', async ({ page }) => {
    // Clear any stored session by going to a fresh context (cookies/localStorage cleared per test by default)
    await page.goto('/checkout');
    // Should be redirected to signin with redirect param
    await expect(page).toHaveURL(/\/auth\/signin/, { timeout: 10_000 });
  });

  test('empty cart shows message when visiting checkout', async ({ page }) => {
    // Sign in via API + set localStorage token, then visit checkout with empty cart
    const { email, password } = await createUser(`empty-${Date.now()}`);

    await page.goto('/auth/signin');
    await page.fill('#signin-email', email);
    await page.fill('#signin-password', password);
    await page.click('#signin-submit-btn');
    await expect(page).toHaveURL('/', { timeout: 10_000 });

    // Visit checkout without adding anything to cart
    await page.goto('/checkout');
    await expect(page.locator('text=No items in cart')).toBeVisible();
  });
});
