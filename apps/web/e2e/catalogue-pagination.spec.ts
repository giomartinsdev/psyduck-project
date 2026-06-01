import { test, expect } from '@playwright/test';

test('catalogue loads 6 products and Load More fetches the next page', async ({ page }) => {
  await page.goto('/catalogue');

  // Initial ISR render — 6 products
  const cards = page.locator('[id^="product-card-"]');
  await expect(cards).toHaveCount(6, { timeout: 10_000 });

  // "Load More" button must be visible (hasNextPage = true with 100 products)
  const loadMore = page.locator('#load-more-btn');
  await expect(loadMore).toBeVisible();

  // Click Load More → should append 6 more (total 12)
  await loadMore.click();
  await expect(cards).toHaveCount(12, { timeout: 15_000 });

  // Click again → 18
  await expect(page.locator('#load-more-btn')).toBeVisible();
  await page.locator('#load-more-btn').click();
  await expect(cards).toHaveCount(18, { timeout: 15_000 });

  await page.screenshot({ path: '/tmp/catalogue-pagination.png' });
});
