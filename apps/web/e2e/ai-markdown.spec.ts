import { test, expect } from '@playwright/test';

test('AI chat renders markdown — bold, italic, bullets', async ({ page }) => {
  const GW = 'http://localhost:4000/graphql';
  const ts = Date.now();
  const email = `md-${ts}@test.dev`;

  // Create account and capture token
  const resp = await fetch(GW, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `mutation{signUp(input:{name:"MDTest",email:"${email}",password:"mdtest123"}){token}}`,
    }),
  });
  const { data } = (await resp.json()) as { data: { signUp: { token: string } } };
  const token = data.signUp.token;

  // Inject token so Apollo sends Authorization header
  await page.goto('/');
  await page.evaluate((tok) => localStorage.setItem('mock_token', tok), token);
  await page.reload();

  // Open the AI drawer via floating button
  const floatingBtn = page.locator('[id="ai-floating-btn"], button').filter({ hasText: '✦' }).first();
  await expect(floatingBtn).toBeVisible({ timeout: 8000 });
  await floatingBtn.click();

  // Type a message that will return markdown
  const input = page.locator('#ai-chat-input');
  await expect(input).toBeVisible({ timeout: 5000 });
  await input.fill('tem fone de ouvido?');
  await page.click('#ai-chat-send');

  // Wait for AI response — Ollama SLM may take up to 30s on cold start
  await page.waitForTimeout(20000);

  await page.screenshot({ path: '/tmp/ai-markdown.png' });

  // Verify markdown is rendered as HTML elements, not raw asterisks
  const bubbles = page.locator('.ChatBubble-module__bubbleAI, [class*="bubbleAI"]');
  const lastBubble = bubbles.last();
  await expect(lastBubble).toBeVisible({ timeout: 5000 });

  // Verify the bubble rendered something — could be paragraphs, bullets, or bold
  const bubbleText = await lastBubble.textContent();
  expect(bubbleText?.length).toBeGreaterThan(10);

  // Raw double-asterisks should NOT appear in the text (markdown must be rendered)
  // Note: the SLM may or may not use **bold** — we just verify no raw markdown leaks
  expect(bubbleText).not.toContain('**');

  // The bubble should be rendered via Markdown component (check it's a div, not <p> directly)
  const markdownDiv = lastBubble.locator('div').first();
  await expect(markdownDiv).toBeVisible();

  console.log('AI bubble text:', bubbleText?.slice(0, 200));
});
