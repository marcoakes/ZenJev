# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> A-11: real reviewer login enforces session cookies, CSRF, admin boundary and logout on synthetic data
- Location: tests/browser/auth.spec.ts:100:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 403
```

# Test source

```ts
  1   | import { test, expect, type Page } from '@playwright/test';
  2   | import { PrismaClient } from '@prisma/client';
  3   | import { randomBytes, randomUUID } from 'node:crypto';
  4   | import { hashPassword } from '../../src/server/auth';
  5   | 
  6   | // A separate loopback server requires sessions even for synthetic fixtures.
  7   | // No recording may capture the temporary password, cookie, or CSRF token.
  8   | test.use({ baseURL: 'http://127.0.0.1:3001', trace: 'off', video: 'off', screenshot: 'off' });
  9   | test.describe.configure({ mode: 'serial' });
  10  | 
  11  | const db = new PrismaClient({ datasourceUrl: 'postgresql://demo:demo@127.0.0.1:55432/zenjev_demo?connection_limit=1', log: [] });
  12  | const accounts = (['reviewer', 'viewer'] as const).map(role => ({
  13  |   id: randomUUID(), username: `browser-${role}-${randomUUID()}`, role,
  14  |   password: randomBytes(32).toString('base64url'),
  15  | }));
  16  | const observations = new WeakMap<Page, { errors: string[]; external: string[] }>();
  17  | type Session = { actor: { id: string; role: string; demo: boolean; csrfToken: string } };
  18  | 
  19  | async function browserRequest(page: Page, path: string, body?: Record<string, unknown>, token?: string) {
  20  |   // Browser fetch preserves the real cookie without putting its value or request
  21  |   // headers into Playwright API-request failure logs.
  22  |   return page.evaluate(async input => {
  23  |     const response = await fetch(input.path, {
  24  |       method: input.body === undefined ? 'GET' : 'POST',
  25  |       headers: input.body === undefined ? undefined : { 'content-type': 'application/json', ...(input.token ? { 'x-csrf-token': input.token } : {}) },
  26  |       body: input.body === undefined ? undefined : JSON.stringify(input.body),
  27  |       cache: 'no-store',
  28  |     });
  29  |     return { status: response.status, body: await response.json() as Record<string, unknown> };
  30  |   }, { path, body, token });
  31  | }
  32  | 
  33  | async function signIn(page: Page, account: (typeof accounts)[number]) {
  34  |   await page.goto('/tickets');
  35  |   await expect(page).toHaveURL('http://127.0.0.1:3001/login');
  36  |   await expect(page.getByRole('heading', { name: 'Welcome to ZenJev', exact: true })).toBeVisible();
  37  |   await page.getByRole('textbox', { name: 'Username', exact: true }).fill(account.username);
  38  |   const password = page.getByLabel('Password', { exact: true });
  39  |   await expect(password).toHaveAttribute('type', 'password');
  40  |   // Using a native input event exercises the controlled form without a fill()
  41  |   // step whose timeout log could include the temporary password argument.
  42  |   await password.evaluate((input: HTMLInputElement, value: string) => {
  43  |     Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  44  |     input.dispatchEvent(new Event('input', { bubbles: true }));
  45  |   }, account.password);
  46  |   const [login] = await Promise.all([
  47  |     page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/login' && response.request().method() === 'POST'),
  48  |     page.getByRole('button', { name: 'Sign in', exact: true }).click(),
  49  |   ]);
> 50  |   expect(login.status()).toBe(200);
      |                          ^ Error: expect(received).toBe(expected) // Object.is equality
  51  |   await expect(page).toHaveURL('http://127.0.0.1:3001/tickets');
  52  |   await expect(page.locator('tbody tr')).toHaveCount(15);
  53  |   const current = await browserRequest(page, '/api/auth/me');
  54  |   expect(current.status).toBe(200);
  55  |   const { actor } = current.body as Session;
  56  |   expect({ id: actor.id, role: actor.role, demo: actor.demo }).toEqual({ id: account.id, role: account.role, demo: false });
  57  |   expect(actor.csrfToken.length > 0).toBe(true);
  58  |   return actor.csrfToken;
  59  | }
  60  | 
  61  | test.beforeAll(async ({ request }) => {
  62  |   // Fail before creating accounts if this is not the isolated synthetic fixture
  63  |   // database and the session-required application described by the CI helper.
  64  |   expect((await request.get('/api/settings')).status()).toBe(401);
  65  |   const settings = await db.workspaceSettings.findUniqueOrThrow({ where: { id: 'workspace' } });
  66  |   expect({ dataMode: settings.dataMode, jevMode: settings.jevMode, allowLiveWrites: settings.allowLiveWrites, allowLiveDataProcessing: settings.allowLiveDataProcessing })
  67  |     .toEqual({ dataMode: 'demo', jevMode: 'mock', allowLiveWrites: false, allowLiveDataProcessing: false });
  68  |   expect(await db.ticket.count({ where: { source: { not: 'synthetic' } } })).toBe(0);
  69  |   expect(await db.gitHubIssue.count({ where: { source: { not: 'synthetic' } } })).toBe(0);
  70  |   expect(await db.ticket.count()).toBe(100);
  71  |   for (const account of accounts) {
  72  |     await db.user.create({ data: { id: account.id, username: account.username, role: account.role, passwordHash: hashPassword(account.password) } });
  73  |   }
  74  | });
  75  | 
  76  | test.afterAll(async () => {
  77  |   try {
  78  |     // Session rows cascade when these exact test-owned users are removed.
  79  |     await db.user.deleteMany({ where: { id: { in: accounts.map(account => account.id) } } });
  80  |   } finally {
  81  |     accounts.forEach(account => { account.password = ''; });
  82  |     await db.$disconnect();
  83  |   }
  84  | });
  85  | 
  86  | test.beforeEach(async ({ page }) => {
  87  |   const observed = { errors: [] as string[], external: [] as string[] };
  88  |   observations.set(page, observed);
  89  |   page.on('pageerror', error => observed.errors.push(error.message));
  90  |   page.on('request', request => {
  91  |     const url = new URL(request.url());
  92  |     if (['http:', 'https:'].includes(url.protocol) && url.origin !== 'http://127.0.0.1:3001') observed.external.push(url.origin);
  93  |   });
  94  | });
  95  | test.afterEach(async ({ page }) => {
  96  |   expect(observations.get(page)!.errors, 'No uncaught browser errors').toEqual([]);
  97  |   expect(observations.get(page)!.external, 'Session tests must remain on the synthetic loopback app').toEqual([]);
  98  | });
  99  | 
  100 | test('A-11: real reviewer login enforces session cookies, CSRF, admin boundary and logout on synthetic data', async ({ page }) => {
  101 |   const account = accounts[0];
  102 |   const token = await signIn(page, account);
  103 |   const cookie = (await page.context().cookies()).find(value => value.name === 'zenjev_session');
  104 |   expect(Boolean(cookie)).toBe(true);
  105 |   expect(cookie?.httpOnly).toBe(true);
  106 |   expect(cookie?.sameSite).toBe('Strict');
  107 |   expect(cookie?.path).toBe('/');
  108 |   expect(await page.evaluate(() => document.cookie.includes('zenjev_session='))).toBe(false);
  109 | 
  110 |   for (const invalid of [undefined, 'intentionally-invalid-csrf']) {
  111 |     const denied = await browserRequest(page, '/api/tickets/ticket-006/evaluate', {}, invalid);
  112 |     expect(denied.status).toBe(403);
  113 |     expect(denied.body.error).toBe('CSRF token required');
  114 |   }
  115 |   const forbiddenSettings = await browserRequest(page, '/api/settings', { threshold: 0.81 }, token);
  116 |   expect(forbiddenSettings.status).toBe(403);
  117 |   expect(forbiddenSettings.body.error).toBe('Administrator role required');
  118 | 
  119 |   await page.goto('/tickets/ticket-006');
  120 |   await expect(page.getByRole('heading', { name: 'Conversation', exact: true })).toBeVisible();
  121 |   const [evaluation] = await Promise.all([
  122 |     page.waitForResponse(response => new URL(response.url()).pathname === '/api/tickets/ticket-006/evaluate' && response.request().method() === 'POST'),
  123 |     page.getByRole('button', { name: /^(?:Re-evaluate|Evaluate ticket)$/ }).click(),
  124 |   ]);
  125 |   expect(evaluation.status()).toBe(202);
  126 |   const queued = await evaluation.json() as { jobId: string };
  127 |   await expect(page.locator('.notice[role="status"]')).toContainText('Evaluation queued.');
  128 |   await expect.poll(async () => (await db.job.findUnique({ where: { id: queued.jobId } }))?.state, { timeout: 45000 }).toBe('succeeded');
  129 |   await expect.poll(async () => {
  130 |     const response = await browserRequest(page, '/api/tickets/ticket-006');
  131 |     const ticket = response.body.ticket as { source: string; decision?: { status: string; provider: string } };
  132 |     return { source: ticket.source, status: ticket.decision?.status, provider: ticket.decision?.provider };
  133 |   }, { timeout: 45000 }).toEqual({ source: 'synthetic', status: 'succeeded', provider: 'mock' });
  134 | 
  135 |   const logout = await browserRequest(page, '/api/auth/logout', {}, token);
  136 |   expect(logout.status).toBe(200);
  137 |   expect((await browserRequest(page, '/api/auth/me')).status).toBe(401);
  138 |   expect(await db.session.count({ where: { userId: account.id } })).toBe(0);
  139 |   expect((await page.context().cookies()).some(value => value.name === 'zenjev_session')).toBe(false);
  140 |   await page.goto('/tickets');
  141 |   await expect(page).toHaveURL('http://127.0.0.1:3001/login');
  142 | });
  143 | 
  144 | test('A-11: real viewer login can read synthetic tickets but cannot mutate or configure', async ({ page }) => {
  145 |   const token = await signIn(page, accounts[1]);
  146 |   const ticket = await browserRequest(page, '/api/tickets/ticket-001');
  147 |   expect(ticket.status).toBe(200);
  148 |   expect((ticket.body.ticket as { source: string }).source).toBe('synthetic');
  149 |   const denied = await browserRequest(page, '/api/tickets/ticket-001/evaluate', {}, token);
  150 |   expect(denied.status).toBe(403);
```