import { test, expect } from '@playwright/test';
import { SignJWT } from 'jose';

const SECRET = process.env.JWT_SECRET_KEY ?? 'visual-regression-test-secret';
const MERCHANT =
  process.env.MERCHANT_ADDRESS ?? 'GCALKSGAZRJLSUEJT3M5W6LN4R7XQOLIRCOS6ZA6EDZVTZDBIIPPFKJ6';

async function sessionCookie() {
  const token = await new SignJWT({ publicKey: MERCHANT })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(SECRET));
  return {
    name: 'accensa_session',
    value: token,
    domain: '127.0.0.1',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax' as const,
  };
}

const SAMPLE_PAYMENTS = {
  payments: [
    {
      tx_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ledger: 1001,
      payer: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567AAAAAAAAAA',
      amount: '15000000',
      asset: 'native',
      ts: '2026-08-01T12:00:00.000Z',
      route: '/api/resource',
      method: 'GET',
    },
  ],
  sync: { lastLedger: 1002, updatedAt: '2026-08-01T12:05:00.000Z' },
};

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('Merchant Dashboard - empty state', async ({ page, context }) => {
  await context.addCookies([await sessionCookie()]);
  await page.route('**/api/payments**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ payments: [], sync: null }),
    });
  });
  await page.goto('/dashboard');
  await expect(page.locator('main')).toHaveScreenshot('dashboard-empty.png', { mask: [page.locator('time')] });
});

test('Merchant Dashboard - payments table', async ({ page, context }) => {
  await context.addCookies([await sessionCookie()]);
  await page.route('**/api/payments**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SAMPLE_PAYMENTS),
    });
  });
  await page.goto('/dashboard');
  await expect(page.locator('main')).toHaveScreenshot('dashboard-payments.png', { mask: [page.locator('time')] });
});

test('Checkout Modal', async ({ page }) => {
  await page.goto('/checkout/demo');
  await expect(page.locator('body')).toHaveScreenshot('checkout-modal.png');
});

test('Dispute Flow', async ({ page, context }) => {
  await context.addCookies([await sessionCookie()]);
  await page.goto('/dashboard/disputes');
  await expect(page.locator('main')).toHaveScreenshot('dispute-flow.png');
});

test('POS Terminal', async ({ page, context }) => {
  await context.addCookies([await sessionCookie()]);
  await page.goto('/pos');
  await expect(page.locator('main')).toHaveScreenshot('pos-terminal.png');
});
