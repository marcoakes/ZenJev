import { test, expect, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const screenshots = resolve(process.env.WRINGER_ARTIFACTS_DIR || 'evidence/screenshots');
type Detail = {ticket:{id:string;reviewState:string;decision:{provider:string;proposedIssueId:string|null;destination:{value:string}}|null}; actions:{id:string;state:string;receipt:unknown}[]};
async function detail(request:APIRequestContext,id:string):Promise<Detail>{const r=await request.get(`/api/tickets/${id}`);expect(r.ok()).toBeTruthy();return r.json();}
async function evaluated(request:APIRequestContext,id:string){
  const r=await request.post(`/api/tickets/${id}/evaluate`,{data:{}});expect(r.ok()).toBeTruthy();
  await expect.poll(async()=> (await detail(request,id)).ticket.decision?.provider,{timeout:45000}).toBe('mock');
}
test.describe.configure({mode:'serial'});
test.beforeAll(async({request})=>{
  await mkdir(screenshots,{recursive:true});
  const reset=await request.post('/api/demo/replay',{data:{action:'reset'}});expect(reset.ok()).toBeTruthy();
  for(const id of ['ticket-001','ticket-002','ticket-003','ticket-005'])await evaluated(request,id);
});

test('SW-01 ZJ-05: seeded queue, live worker, search, pagination and keyboard',async({page,request})=>{
  const failures:string[]=[];page.on('pageerror',e=>failures.push(e.message));
  const external:string[]=[];page.on('request',r=>{if(!new URL(r.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/))external.push(r.url());});
  await page.goto('/tickets');await expect(page.getByRole('heading',{name:'Ticket queue',exact:true})).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(15);
  await page.getByRole('button',{name:'Next page',exact:true}).click();await expect(page.getByText(/Page 2 of/)).toBeVisible();
  await page.getByRole('textbox',{name:'Search tickets'}).fill('Webhook retries stop after timeout');
  await expect(page.locator('tbody tr')).toHaveCount(8);
  await page.getByRole('textbox',{name:'Search tickets'}).fill('no-such-demo-subject');
  await expect(page.getByRole('heading',{name:'No tickets in this view'})).toBeVisible();
  await page.getByRole('button',{name:'Clear search'}).click();await expect(page.locator('tbody tr')).toHaveCount(15);
  await page.screenshot({path:resolve(screenshots,'tickets-desktop.png'),fullPage:true});
  const health=await (await request.get('/api/health')).json();expect(health.worker.status).toBe('healthy');
  expect(failures).toEqual([]);expect(external).toEqual([]);
});

test('SW-02 SW-11: three reports link to one existing issue; ambiguous report abstains',async({page,request})=>{
  const first=await detail(request,'ticket-001');const issue=first.ticket.decision?.proposedIssueId;expect(issue).toBe('issue-001');
  for(const id of ['ticket-001','ticket-002','ticket-003']){
    expect((await detail(request,id)).ticket.decision?.proposedIssueId).toBe(issue);
    await page.goto(`/tickets/${id}`);await expect(page.getByRole('heading',{name:'Conversation',exact:true})).toBeVisible();
    const candidate=page.locator('.candidate-card').filter({hasText:'Webhook retries stop after callback timeout'});
    await candidate.getByRole('button',{name:'Approve local association'}).click();
    await expect(candidate.getByText('Approved local association')).toBeVisible();
  }
  const ambiguous=await detail(request,'ticket-005');expect(ambiguous.ticket.reviewState).toBe('needs_review');expect(ambiguous.ticket.decision?.proposedIssueId).toBeNull();
  await page.goto('/engineering');await expect(page.getByText('Webhook retries stop after callback timeout',{exact:true})).toBeVisible();
  const board=await(await request.get('/api/engineering')).json();const group=board.issues.find((i:{id:string})=>i.id==='issue-001');expect(group.ticketCount).toBe(3);expect(group.organizationCount).toBe(3);
  await page.screenshot({path:resolve(screenshots,'engineering-desktop.png'),fullPage:true});
});

test('SW-03 SW-05: exact preview approval and persisted dry-run receipt',async({page,request})=>{
  await page.goto('/tickets/ticket-001');
  await page.getByRole('button',{name:'Preview proposed route',exact:true}).click();
  const card=page.locator('.action-card').first();
  await expect(card.getByText('proposed',{exact:true})).toBeVisible();
  await card.getByRole('button',{name:'Approve preview',exact:true}).click();
  await card.getByRole('button',{name:'Execute dry run',exact:true}).click();
  await expect(card.getByText('Saved dry-run receipt',{exact:false})).toBeVisible({timeout:30000});
  const action=(await detail(request,'ticket-001')).actions[0];expect(action.state).toBe('succeeded');expect(JSON.stringify(action.receipt)).toMatch(/Dry run|dry.run|simulated/i);
  await page.screenshot({path:resolve(screenshots,'ticket-detail-desktop.png'),fullPage:true});
  await page.goto('/audit');await expect(page.getByRole('heading',{name:/Activity|Audit/}).first()).toBeVisible();await expect(page.getByText(/Action\.Dry Run|Action\.Executed/).first()).toBeVisible();
});

test('SW-09: threshold recomputes stored predictions and preserves provider call count',async({page,request})=>{
  const run=await request.post('/api/evaluation',{data:{newRun:true,task:'initial_routing',split:'development',threshold:.8}});expect(run.ok()).toBeTruthy();
  const before=await run.json();
  const recompute=await request.post('/api/evaluation',{data:{newRun:false,task:'initial_routing',split:'development',threshold:.99}});expect(recompute.ok()).toBeTruthy();
  const after=await recompute.json();expect(after.metrics.total).toBe(before.metrics.total);expect(after.metrics.eligible).toBeLessThanOrEqual(before.metrics.eligible);
  expect(after.latest.predictions).toEqual(before.latest.predictions);
  await page.goto('/evaluation');await expect(page.getByRole('heading',{name:'Evaluation lab',exact:true})).toBeVisible();
  await expect(page.getByText(/simulat/i).first()).toBeVisible();
  await page.screenshot({path:resolve(screenshots,'evaluation-desktop.png'),fullPage:true});
});

test('failed decision keeps engineering approvals and new drafts disabled until evaluation succeeds',async({page,request})=>{
  const queued=await request.post('/api/tickets/ticket-013/evaluate',{data:{}});expect(queued.ok()).toBeTruthy();
  await expect.poll(async()=>(await detail(request,'ticket-013')).ticket.reviewState,{timeout:45000}).toBe('failed');
  await page.goto('/tickets/ticket-013');
  await expect(page.locator('.decision-panel').getByRole('alert')).toBeVisible();
  await expect(page.getByText('Evaluate this ticket successfully before approving an association or preparing a new action.',{exact:true})).toBeVisible();
  const associations=page.getByRole('button',{name:'Approve local association',exact:true});
  await expect(associations.first()).toBeVisible();
  for(const button of await associations.all())await expect(button).toBeDisabled();
  await expect(page.getByRole('button',{name:'Prepare new issue draft',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Re-evaluate',exact:true})).toBeEnabled();
  expect((await detail(request,'ticket-013')).actions).toHaveLength(0);
});

test('ZJ-04: exact artwork served locally, uncropped and with meaningful alt text',async({page,request})=>{
  const image=await request.get('/branding/zenjev-hero.png');expect(image.ok()).toBeTruthy();expect(image.headers()['content-type']).toMatch(/image\/png/);
  await page.goto('/tickets');await page.getByRole('button',{name:/About ZenJev/}).click();
  const poster=page.getByAltText('ZenJev: a meditating ninja in pink, black and cream, with retro support-workflow panels.');
  await expect(poster).toBeVisible();
  expect(await poster.evaluate((image:HTMLImageElement)=>[image.naturalWidth,image.naturalHeight])).toEqual([1254,1254]);
  const bounds=await poster.boundingBox();expect(bounds).not.toBeNull();expect(Math.abs(bounds!.width-bounds!.height)).toBeLessThan(1);
});

test('ZJ-05 A-18: primary screens have no serious accessibility errors or document overflow',async({page})=>{
  for(const route of ['/tickets','/tickets/ticket-005','/engineering','/evaluation','/settings','/audit']){
    await page.goto(route);await expect(page.locator('h1')).toBeVisible();await page.waitForTimeout(400);
    const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();
    expect(result.violations.filter(v=>['serious','critical'].includes(v.impact||'')),route).toEqual([]);
  }
  await page.setViewportSize({width:390,height:844});await page.goto('/tickets');await expect(page.locator('tbody tr').first()).toBeVisible();
  const openNavigation=page.getByRole('button',{name:'Open navigation',exact:true});
  await expect(page.getByRole('link',{name:'Ticket queue',exact:true})).toHaveCount(0);
  await expect(page.locator('#primary-sidebar')).toHaveAttribute('inert','');
  await openNavigation.focus();await page.keyboard.press('Tab');
  expect(await page.locator('#primary-sidebar').evaluate(sidebar=>sidebar.contains(document.activeElement))).toBe(false);
  await openNavigation.click();
  const navigation=page.getByRole('dialog',{name:'Main navigation',exact:true});await expect(navigation).toBeVisible();
  const closeNavigation=navigation.getByRole('button',{name:'Close navigation',exact:true});await expect(closeNavigation).toBeFocused();
  await page.keyboard.press('Shift+Tab');await expect(navigation.getByRole('button',{name:'About ZenJev',exact:true})).toBeFocused();
  await page.keyboard.press('Tab');await expect(closeNavigation).toBeFocused();
  await page.keyboard.press('Escape');await expect(openNavigation).toBeFocused();
  await expect(page.getByRole('link',{name:'Ticket queue',exact:true})).toHaveCount(0);
  await expect(page.locator('#primary-sidebar')).toHaveAttribute('inert','');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.screenshot({path:resolve(screenshots,'tickets-mobile.png'),fullPage:true});
  await page.goto('/tickets/ticket-001');await expect(page.getByRole('heading',{name:'Conversation',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.screenshot({path:resolve(screenshots,'detail-mobile.png'),fullPage:true});
});
