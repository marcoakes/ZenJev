import { test, expect, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { hashPassword } from '../../src/server/auth';

// A separate loopback server requires sessions even for synthetic fixtures.
// No recording may capture the temporary password, cookie, or CSRF token.
test.use({ baseURL: 'http://127.0.0.1:3001', trace: 'off', video: 'off', screenshot: 'off' });
test.describe.configure({ mode: 'serial' });

const db = new PrismaClient({ datasourceUrl: 'postgresql://demo:demo@127.0.0.1:55432/zenjev_demo?connection_limit=1', log: [] });
const accounts = (['reviewer', 'viewer'] as const).map(role => ({
  id: randomUUID(), username: `browser-${role}-${randomUUID()}`, role,
  password: randomBytes(32).toString('base64url'),
}));
const observations = new WeakMap<Page, { errors: string[]; external: string[] }>();
type Session = { actor: { id: string; role: string; demo: boolean; csrfToken: string } };

async function browserRequest(page: Page, path: string, body?: Record<string, unknown>, token?: string) {
  // Browser fetch preserves the real cookie without putting its value or request
  // headers into Playwright API-request failure logs.
  return page.evaluate(async input => {
    const response = await fetch(input.path, {
      method: input.body === undefined ? 'GET' : 'POST',
      headers: input.body === undefined ? undefined : { 'content-type': 'application/json', ...(input.token ? { 'x-csrf-token': input.token } : {}) },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      cache: 'no-store',
    });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  }, { path, body, token });
}

async function signIn(page: Page, account: (typeof accounts)[number]) {
  await page.goto('/tickets');
  await expect(page).toHaveURL('http://127.0.0.1:3001/login');
  await expect(page.getByRole('heading', { name: 'Welcome to ZenJev', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill(account.username);
  const password = page.getByLabel('Password', { exact: true });
  await expect(password).toHaveAttribute('type', 'password');
  // Using a native input event exercises the controlled form without a fill()
  // step whose timeout log could include the temporary password argument.
  await password.evaluate((input: HTMLInputElement, value: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, account.password);
  const [login] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/login' && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Sign in', exact: true }).click(),
  ]);
  let failureReason = 'Login must establish an authenticated session';
  if (!login.ok()) {
    const failure = await login.json().catch(() => null) as { error?: unknown } | null;
    const knownErrors = ['Cross-origin login rejected', 'Invalid credentials', 'Invalid login JSON', 'Username and password must have valid bounded lengths'];
    if (typeof failure?.error === 'string' && knownErrors.includes(failure.error)) failureReason = failure.error;
  }
  expect(login.status(), failureReason).toBe(200);
  await expect.poll(async () => (await page.context().cookies()).some(cookie => cookie.name === 'zenjev_session' && cookie.value.length > 0), { message: 'Successful login stores a session cookie (value never recorded)' }).toBe(true);
  await expect.poll(async () => {
    try { return await page.evaluate(async () => (await fetch('/api/auth/me', { cache: 'no-store' })).status); }
    catch { return 0; } // A full navigation can replace the document during this status-only probe.
  }, { message: 'The new session authenticates before checking destination navigation' }).toBe(200);
  await expect(page).toHaveURL('http://127.0.0.1:3001/tickets');
  await expect(page.locator('tbody tr')).toHaveCount(15);
  const current = await browserRequest(page, '/api/auth/me');
  expect(current.status).toBe(200);
  const { actor } = current.body as Session;
  expect({ id: actor.id, role: actor.role, demo: actor.demo }).toEqual({ id: account.id, role: account.role, demo: false });
  expect(actor.csrfToken.length > 0).toBe(true);
  return actor.csrfToken;
}

async function signOut(page: Page, account: (typeof accounts)[number]) {
  const [logout] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/logout' && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Sign out', exact: true }).click(),
  ]);
  expect(logout.status()).toBe(200);
  await expect(page).toHaveURL('http://127.0.0.1:3001/login');
  expect((await browserRequest(page, '/api/auth/me')).status).toBe(401);
  expect(await db.session.count({ where: { userId: account.id } })).toBe(0);
  expect((await page.context().cookies()).some(value => value.name === 'zenjev_session')).toBe(false);
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
  await page.goto('/tickets');
  await expect(page).toHaveURL('http://127.0.0.1:3001/login');
}

test.beforeAll(async ({ request }) => {
  // Fail before creating accounts if this is not the isolated synthetic fixture
  // database and the session-required application described by the CI helper.
  expect((await request.get('/api/settings')).status()).toBe(401);
  const settings = await db.workspaceSettings.findUniqueOrThrow({ where: { id: 'workspace' } });
  expect({ dataMode: settings.dataMode, jevMode: settings.jevMode, allowLiveWrites: settings.allowLiveWrites, allowLiveDataProcessing: settings.allowLiveDataProcessing })
    .toEqual({ dataMode: 'demo', jevMode: 'mock', allowLiveWrites: false, allowLiveDataProcessing: false });
  expect(await db.ticket.count({ where: { source: { not: 'synthetic' } } })).toBe(0);
  expect(await db.gitHubIssue.count({ where: { source: { not: 'synthetic' } } })).toBe(0);
  expect(await db.ticket.count()).toBe(100);
  for (const account of accounts) {
    await db.user.create({ data: { id: account.id, username: account.username, role: account.role, passwordHash: hashPassword(account.password) } });
  }
});

test.afterAll(async () => {
  try {
    // Session rows cascade when these exact test-owned users are removed.
    await db.user.deleteMany({ where: { id: { in: accounts.map(account => account.id) } } });
  } finally {
    accounts.forEach(account => { account.password = ''; });
    await db.$disconnect();
  }
});

test.beforeEach(async ({ page }) => {
  const observed = { errors: [] as string[], external: [] as string[] };
  observations.set(page, observed);
  page.on('pageerror', error => observed.errors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== 'http://127.0.0.1:3001') observed.external.push(url.origin);
  });
});
test.afterEach(async ({ page }) => {
  expect(observations.get(page)!.errors, 'No uncaught browser errors').toEqual([]);
  expect(observations.get(page)!.external, 'Session tests must remain on the synthetic loopback app').toEqual([]);
});

test('A-11: real reviewer login enforces session cookies, CSRF, admin boundary and logout on synthetic data', async ({ page }) => {
  const account = accounts[0];
  const token = await signIn(page, account);
  const cookie = (await page.context().cookies()).find(value => value.name === 'zenjev_session');
  expect(Boolean(cookie)).toBe(true);
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Strict');
  expect(cookie?.path).toBe('/');
  expect(await page.evaluate(() => document.cookie.includes('zenjev_session='))).toBe(false);

  for (const invalid of [undefined, 'intentionally-invalid-csrf']) {
    const denied = await browserRequest(page, '/api/tickets/ticket-006/evaluate', {}, invalid);
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe('CSRF token required');
  }
  const forbiddenSettings = await browserRequest(page, '/api/settings', { threshold: 0.81 }, token);
  expect(forbiddenSettings.status).toBe(403);
  expect(forbiddenSettings.body.error).toBe('Administrator role required');

  await page.goto('/tickets/ticket-006');
  await expect(page.getByRole('heading', { name: 'Conversation', exact: true })).toBeVisible();
  const [evaluation] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === '/api/tickets/ticket-006/evaluate' && response.request().method() === 'POST'),
    page.getByRole('button', { name: /^(?:Re-evaluate|Evaluate ticket)$/ }).click(),
  ]);
  expect(evaluation.status()).toBe(202);
  const queued = await evaluation.json() as { jobId: string };
  await expect(page.locator('.notice[role="status"]')).toContainText('Evaluation queued.');
  await expect.poll(async () => (await db.job.findUnique({ where: { id: queued.jobId } }))?.state, { timeout: 45000 }).toBe('succeeded');
  await expect.poll(async () => {
    const response = await browserRequest(page, '/api/tickets/ticket-006');
    const ticket = response.body.ticket as { source: string; decision?: { status: string; provider: string } };
    return { source: ticket.source, status: ticket.decision?.status, provider: ticket.decision?.provider };
  }, { timeout: 45000 }).toEqual({ source: 'synthetic', status: 'succeeded', provider: 'mock' });

  await signOut(page, account);
});

test('A-11: real viewer login can read synthetic tickets but cannot mutate or configure', async ({ page }) => {
  const token = await signIn(page, accounts[1]);
  const ticket = await browserRequest(page, '/api/tickets/ticket-001');
  expect(ticket.status).toBe(200);
  expect((ticket.body.ticket as { source: string }).source).toBe('synthetic');
  const denied = await browserRequest(page, '/api/tickets/ticket-001/evaluate', {}, token);
  expect(denied.status).toBe(403);
  expect(denied.body.error).toBe('Reviewer role required');
  await page.goto('/settings');
  await expect(page.getByText('Configuration changes require an administrator. Your current role is viewer.', { exact: true })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Destination review threshold', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save configuration', exact: true })).toBeDisabled();
  await signOut(page, accounts[1]);
});
