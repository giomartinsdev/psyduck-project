import { test, expect } from '@playwright/test';

test('AI companion product names are clickable and navigate to product page', async ({ page }) => {
  const GW = 'http://localhost:4000/graphql';
  const ts = Date.now();

  // Create account
  const resp = await fetch(GW, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `mutation{signUp(input:{name:"LinkTest",email:"link-${ts}@t.dev",password:"link12345"}){token}}`,
    }),
  });
  const { data } = (await resp.json()) as { data: { signUp: { token: string } } };
  const token = data.signUp.token;

  await page.goto('/');
  await page.evaluate((tok) => localStorage.setItem('mock_token', tok), token);
  await page.reload();

  // Open AI drawer
  const fab = page.locator('button').filter({ hasText: '✦' }).first();
  await expect(fab).toBeVisible({ timeout: 8000 });
  await fab.click();

  // Ask for headphones
  const input = page.locator('#ai-chat-input');
  await expect(input).toBeVisible({ timeout: 5000 });
  await input.fill('show me headphones');
  await page.click('#ai-chat-send');

  // Wait for response with product links
  await page.waitForTimeout(12000);
  await page.screenshot({ path: '/tmp/ai-product-links.png' });

  // Find a product link in the AI response
  const productLink = page.locator('[class*="bubbleAI"] a[href^="/catalogue/"]').first();
  await expect(productLink).toBeVisible({ timeout: 5000 });

  const href = await productLink.getAttribute('href');
  console.log('Product link href:', href);
  expect(href).toMatch(/^\/catalogue\/p/);

  // Click the product link — should navigate to the product detail page
  await productLink.click();
  await expect(page).toHaveURL(/\/catalogue\/p/, { timeout: 10000 });

  // Product detail page should show some content
  await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
  const title = await page.locator('h1').textContent();
  console.log('Product page title:', title);

  await page.screenshot({ path: '/tmp/ai-product-page.png' });
});
