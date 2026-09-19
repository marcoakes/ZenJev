# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> A-11: real reviewer login enforces session cookies, CSRF, admin boundary and logout on synthetic data
- Location: tests/browser/auth.spec.ts:121:1

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected: "http://127.0.0.1:3001/tickets"
Received: "http://127.0.0.1:3001/login"
Timeout:  15000ms

Call log:
  - Expect "toHaveURL" with timeout 15000ms
    34 × locator resolved to <html lang="en">…</html>
       - unexpected value "http://127.0.0.1:3001/login"

```

```yaml
- link "Skip to main content":
  - /url: "#main-content"
- complementary "Main navigation":
  - link "ZenJev home":
    - /url: /tickets
    - text: Z ZenJev SUPPORT, IN SYNC.
  - text: ZJ
  - strong: Support operations
  - text: Synthetic workspace WORKBENCH
  - navigation:
    - link "Ticket queue":
      - /url: /tickets
    - link "Engineering":
      - /url: /engineering
    - link "Evaluation lab":
      - /url: /evaluation
    - link "Activity & audit":
      - /url: /audit
  - strong: Review comes first.
  - paragraph: Decisions are suggestions. Every action has a preview and an audit trail.
  - text: HUMAN-IN-THE-LOOP
  - link "Settings":
    - /url: /settings
  - button "About ZenJev"
  - text: L
  - strong: 2d3f289b-bf85-41a9-940e-ff5e70ad81c4
  - text: reviewer session
- text: Workspace /
- strong: ZenJev
- text: Synthetic data Mock decisions Dry run only
- main:
  - text: AUTHENTICATED WORKSPACE
  - heading "Welcome to ZenJev" [level=1]
  - paragraph: Sign in with the local account created by your workspace administrator.
  - text: Username
  - textbox "Username": browser-reviewer-a0b0a19e-60d1-4b31-998a-43bd509851fd
  - text: Password
  - textbox "Password"
  - button "Sign in"
  - paragraph: No shared default password. Ask your administrator to use the documented account bootstrap command.
- contentinfo: Database connected · Worker healthy ZenJev / Less noise. Smarter support.
- alert
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
  50  |   let failureReason = 'Login must establish an authenticated session';
  51  |   if (!login.ok()) {
  52  |     const failure = await login.json().catch(() => null) as { error?: unknown } | null;
  53  |     const knownErrors = ['Cross-origin login rejected', 'Invalid credentials', 'Invalid login JSON', 'Username and password must have valid bounded lengths'];
  54  |     if (typeof failure?.error === 'string' && knownErrors.includes(failure.error)) failureReason = failure.error;
  55  |   }
  56  |   expect(login.status(), failureReason).toBe(200);
> 57  |   await expect(page).toHaveURL('http://127.0.0.1:3001/tickets');
      |                      ^ Error: expect(page).toHaveURL(expected) failed
  58  |   await expect(page.locator('tbody tr')).toHaveCount(15);
  59  |   const current = await browserRequest(page, '/api/auth/me');
  60  |   expect(current.status).toBe(200);
  61  |   const { actor } = current.body as Session;
  62  |   expect({ id: actor.id, role: actor.role, demo: actor.demo }).toEqual({ id: account.id, role: account.role, demo: false });
  63  |   expect(actor.csrfToken.length > 0).toBe(true);
  64  |   return actor.csrfToken;
  65  | }
  66  | 
  67  | async function signOut(page: Page, account: (typeof accounts)[number]) {
  68  |   const [logout] = await Promise.all([
  69  |     page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/logout' && response.request().method() === 'POST'),
  70  |     page.getByRole('button', { name: 'Sign out', exact: true }).click(),
  71  |   ]);
  72  |   expect(logout.status()).toBe(200);
  73  |   await expect(page).toHaveURL('http://127.0.0.1:3001/login');
  74  |   expect((await browserRequest(page, '/api/auth/me')).status).toBe(401);
  75  |   expect(await db.session.count({ where: { userId: account.id } })).toBe(0);
  76  |   expect((await page.context().cookies()).some(value => value.name === 'zenjev_session')).toBe(false);
  77  |   await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
  78  |   await page.goto('/tickets');
  79  |   await expect(page).toHaveURL('http://127.0.0.1:3001/login');
  80  | }
  81  | 
  82  | test.beforeAll(async ({ request }) => {
  83  |   // Fail before creating accounts if this is not the isolated synthetic fixture
  84  |   // database and the session-required application described by the CI helper.
  85  |   expect((await request.get('/api/settings')).status()).toBe(401);
  86  |   const settings = await db.workspaceSettings.findUniqueOrThrow({ where: { id: 'workspace' } });
  87  |   expect({ dataMode: settings.dataMode, jevMode: settings.jevMode, allowLiveWrites: settings.allowLiveWrites, allowLiveDataProcessing: settings.allowLiveDataProcessing })
  88  |     .toEqual({ dataMode: 'demo', jevMode: 'mock', allowLiveWrites: false, allowLiveDataProcessing: false });
  89  |   expect(await db.ticket.count({ where: { source: { not: 'synthetic' } } })).toBe(0);
  90  |   expect(await db.gitHubIssue.count({ where: { source: { not: 'synthetic' } } })).toBe(0);
  91  |   expect(await db.ticket.count()).toBe(100);
  92  |   for (const account of accounts) {
  93  |     await db.user.create({ data: { id: account.id, username: account.username, role: account.role, passwordHash: hashPassword(account.password) } });
  94  |   }
  95  | });
  96  | 
  97  | test.afterAll(async () => {
  98  |   try {
  99  |     // Session rows cascade when these exact test-owned users are removed.
  100 |     await db.user.deleteMany({ where: { id: { in: accounts.map(account => account.id) } } });
  101 |   } finally {
  102 |     accounts.forEach(account => { account.password = ''; });
  103 |     await db.$disconnect();
  104 |   }
  105 | });
  106 | 
  107 | test.beforeEach(async ({ page }) => {
  108 |   const observed = { errors: [] as string[], external: [] as string[] };
  109 |   observations.set(page, observed);
  110 |   page.on('pageerror', error => observed.errors.push(error.message));
  111 |   page.on('request', request => {
  112 |     const url = new URL(request.url());
  113 |     if (['http:', 'https:'].includes(url.protocol) && url.origin !== 'http://127.0.0.1:3001') observed.external.push(url.origin);
  114 |   });
  115 | });
  116 | test.afterEach(async ({ page }) => {
  117 |   expect(observations.get(page)!.errors, 'No uncaught browser errors').toEqual([]);
  118 |   expect(observations.get(page)!.external, 'Session tests must remain on the synthetic loopback app').toEqual([]);
  119 | });
  120 | 
  121 | test('A-11: real reviewer login enforces session cookies, CSRF, admin boundary and logout on synthetic data', async ({ page }) => {
  122 |   const account = accounts[0];
  123 |   const token = await signIn(page, account);
  124 |   const cookie = (await page.context().cookies()).find(value => value.name === 'zenjev_session');
  125 |   expect(Boolean(cookie)).toBe(true);
  126 |   expect(cookie?.httpOnly).toBe(true);
  127 |   expect(cookie?.sameSite).toBe('Strict');
  128 |   expect(cookie?.path).toBe('/');
  129 |   expect(await page.evaluate(() => document.cookie.includes('zenjev_session='))).toBe(false);
  130 | 
  131 |   for (const invalid of [undefined, 'intentionally-invalid-csrf']) {
  132 |     const denied = await browserRequest(page, '/api/tickets/ticket-006/evaluate', {}, invalid);
  133 |     expect(denied.status).toBe(403);
  134 |     expect(denied.body.error).toBe('CSRF token required');
  135 |   }
  136 |   const forbiddenSettings = await browserRequest(page, '/api/settings', { threshold: 0.81 }, token);
  137 |   expect(forbiddenSettings.status).toBe(403);
  138 |   expect(forbiddenSettings.body.error).toBe('Administrator role required');
  139 | 
  140 |   await page.goto('/tickets/ticket-006');
  141 |   await expect(page.getByRole('heading', { name: 'Conversation', exact: true })).toBeVisible();
  142 |   const [evaluation] = await Promise.all([
  143 |     page.waitForResponse(response => new URL(response.url()).pathname === '/api/tickets/ticket-006/evaluate' && response.request().method() === 'POST'),
  144 |     page.getByRole('button', { name: /^(?:Re-evaluate|Evaluate ticket)$/ }).click(),
  145 |   ]);
  146 |   expect(evaluation.status()).toBe(202);
  147 |   const queued = await evaluation.json() as { jobId: string };
  148 |   await expect(page.locator('.notice[role="status"]')).toContainText('Evaluation queued.');
  149 |   await expect.poll(async () => (await db.job.findUnique({ where: { id: queued.jobId } }))?.state, { timeout: 45000 }).toBe('succeeded');
  150 |   await expect.poll(async () => {
  151 |     const response = await browserRequest(page, '/api/tickets/ticket-006');
  152 |     const ticket = response.body.ticket as { source: string; decision?: { status: string; provider: string } };
  153 |     return { source: ticket.source, status: ticket.decision?.status, provider: ticket.decision?.provider };
  154 |   }, { timeout: 45000 }).toEqual({ source: 'synthetic', status: 'succeeded', provider: 'mock' });
  155 | 
  156 |   await signOut(page, account);
  157 | });
```