# ZenJev verification report — 19 September 2026

**Observed result:** 76 application tests and four branding checks pass; the production build succeeds; an empty portable database accepts all five migrations and two identical seed passes. The production application and independent worker run locally. Headless Playwright is blocked by the host before page creation: one launch failure, five cases not run. Automated accessibility checks have therefore **not passed**. The separate manual browser review is delegated agent review.

## Candidate and environment

These results concern the implemented ZenJev working tree, not the earlier bootstrap-only source. At this report update, `HEAD` was `18224325c1b817cf1f961078677ad5e173a1c8b1` with the application and documentation still uncommitted. That commit alone does **not** identify the tested application. A final source-bound Wringer result is **pending** and must name the resulting candidate commit; no clean-commit or blanket acceptance claim is made here.

The checked runtime is macOS arm64, Node 24.19.0, Next.js 16.3.5, Prisma 6.19.3, and Vitest 5.0.1. Native PostgreSQL initialization was denied at shared-memory creation. Actual database evidence uses persisted PGlite PostgreSQL/WASM through a loopback wire-protocol server: demo port 55432, isolated test port 55433, and an independently owned fresh-setup database on port 55435. This verifies the exercised SQL, persistence, and application transitions; it does not establish native PostgreSQL multi-session concurrency, crash recovery, or production load behavior.

The unchanged Wringer checkout is `/Users/marc/Claude/wringer` at `7ca2fb58e4270ba70fc6f6fdf4a39e30d70d9cb4`, built as alpha.14 using Bun 1.4.2. The selected route is standalone `trusted_local` verification, documented in [execution decision](execution-decision.md). Apple Container preflight was denied. Contained ACP execution and a red-first build journey were not demonstrated.

## Executed checks

Commands below are the repository's reproducible canonical invocations. The actual underlying checks used `scripts/check.mjs test`, `scripts/check.mjs build`, and `scripts/check-fresh-setup.mjs`. Check launchers construct a credential-free child environment and force synthetic/mock/dry-run modes. The database suite used the isolated `zenjev_test` URL; no conditional persistence tests were skipped.

| Check | Command | Actual outcome | Retained evidence |
|---|---|---|---|
| Domain, provider, backend, orchestration | `npm test` | Exit 0; **76 passed**, four files, no failed or skipped cases; 11.67 seconds. Domain 20, providers 27, backend 23, orchestration 6. | [tests-recovered.log](../evidence/checks/tests-recovered.log) |
| Canonical artwork and identity | `npm run check:branding` | Exit 0; **4 passed**, zero failed, skipped, or cancelled. | [branding-final.tap](../evidence/checks/branding-final.tap); original preflight [branding-test.tap](branding-test.tap) |
| Production compilation | `npm run build` | Exit 0; compiled in 16.0 seconds, TypeScript completed in 6.7 seconds, nine static pages generated; dynamic API/ticket routes and middleware emitted. | [build-reviewed.log](../evidence/checks/build-reviewed.log) |
| Empty database and idempotent setup | `npm run check:fresh-setup` | Exit 0; all five migrations applied; two seed passes preserve counts and every source snapshot. | [fresh-setup-final.log](../evidence/checks/fresh-setup-final.log) |
| Production startup and worker | `npm run demo:portable:production` | Ready on `127.0.0.1:3000`; separate worker started; synthetic/mock/dry-run identity logged. No pending migrations. This is a running-process observation, not a load test. | [production-app-reviewed.log](../evidence/checks/production-app-reviewed.log) |
| Headless browser suite | `npm run test:browser` | **Failed at browser launch:** one failed, five did not run; zero product browser assertions completed. | [browser-production.log](../evidence/checks/browser-production.log), [browser-results.json](../evidence/browser-launch/browser-results-before-final-run.json), [launch-failure trace](../evidence/browser-launch/trace-before-final-run.zip) |
| Standalone Wringer verification | `WRINGER_BINARY=/Users/marc/Claude/wringer/dist/wring npm run verify:wringer` | **Pending final candidate run.** Gate definitions and `proves` labels are not a pass result. | [.wringer.yaml](../.wringer.yaml), [launcher](../scripts/verify.mjs) |

The fresh check begins with no public tables, migrates, seeds, inspects, seeds again, and compares the complete inspected result. It records **100 synthetic tickets, 300 comments, 20 issues, 12 organisations, 200 evaluator-only labels, 400 unchanged source snapshots, 13 jobs, and zero proposed actions**. Settings remain demo/mock with live processing, live writes, and internal-note inclusion disabled. Its temporary database is removed after the check. This is an empty-database setup test using installed dependencies, not a fresh-clone installation test.

The four branding assertions verify the supplied PNG's SHA-256 `12d814fe08a70d57764a0c8d27ad6b0bb43f9b7706407b79a6d05217c1a54d7d`, PNG signature and full decompression, 1254 × 1254 dimensions, Git tracking without a content filter, README relative path and alt text, and product/package identity. The image remains unchanged at `public/branding/zenjev-hero.png`.

## What the application tests establish

Passing suites exercise persisted local association, exact preview approval, dry-run receipts, duplicate execution suppression, lease/reconciliation states, separately approved app tags/internal notes/backlinks, invalid/stale/mode-changed approvals, and deliberately interleaved edit/approval races. They assert internal-note exclusion, candidate/repository bounds, authenticated role/CSRF enforcement, login input/cache bounds, append-only audit rejection with unchanged records, and the retention CLI's dry-run/apply behavior.

Provider requests are intercepted. Tests validate the typed native Jev contract, provenance, no silent fallback, OAuth/comment/export/webhook boundaries, cursor recovery, durable export throttling, Retry-After scheduling, private-repository rechecks, Zendesk safe updates, and uncertain mutation reconciliation without blind retries. Supplied “credentials” in isolation tests are **fake canaries**. Evaluation uses frozen synthetic predictions and evaluator-only labels; tests cover time/split leakage, denominators and zero-new-call threshold changes, not real model accuracy or calibration. The [requirement matrix](requirement-evidence.md) gives assertion names and scope.

## Manual browser review and actual screenshots

The reviewer was **Codex acting under delegated review authority**, using the running local application through computer-use browser controls. Marc's personal usability verdict is **null / not provided**. No human-presence event, owner signature, or owner's external-action approval was fabricated. These observations supplement the server tests; they do not convert the blocked Playwright/Axe suite into a pass.

| Observed interaction | Actual observation | Screenshot |
|---|---|---|
| Queue, search and pagination | Fifteen rows per page; page two inspected; search returned eight matching rows. Source/provider/dry-run indicators are visible. | [tickets desktop](../evidence/screenshots/tickets-desktop.png) |
| Ticket evidence and decisions | Conversation, internal evidence distinction, saved probabilities and candidates inspected. | [ticket detail](../evidence/screenshots/ticket-detail-desktop.png), [ticket evidence](../evidence/screenshots/ticket-evidence-desktop.png) |
| Route approval and execution | Exact preview approved and executed locally; action `f5b04298-d65c-49d7-b38c-729fbc9e9212` saved a dry-run receipt with `externalCalls: 0`. | [ticket detail](../evidence/screenshots/ticket-detail-desktop.png), [audit](../evidence/screenshots/audit-desktop.png) |
| Shared issue and abstention | Tickets 1, 2 and 3 linked to issue #241 across three organisations. Ticket 5 showed unknown destination at 40% and required review. | [engineering](../evidence/screenshots/engineering-desktop.png), [ambiguous ticket](../evidence/screenshots/ambiguous-desktop.png) |
| Saved evaluation | Held-out total 24; routing threshold 80% yielded eight eligible records, 99% yielded zero, using saved predictions. | [evaluation](../evidence/screenshots/evaluation-desktop.png) |
| Settings persistence | Retention changed to 31, saved and survived reload; restored to 30. | [Settings](../evidence/screenshots/settings-desktop.png). |
| Provider failure | Ticket 13 disabled all ten candidate association controls and issue drafting after the missing-output guard repair. Failure remains distinct from a successful decision. | [provider failure](../evidence/screenshots/provider-failure-desktop.png) |
| Artwork and dialog keyboard behavior | About displayed the original square 1254-pixel image. Tab focus cycled within the dialog; Escape closed it and returned focus to its trigger. | [About artwork](../evidence/screenshots/about-artwork.png) |
| Narrow layout | At a 390-pixel viewport both queue and detail document widths were 375 pixels, with no document overflow. The mobile drawer hides closed links and supports modal focus trapping, Escape and trigger focus restoration. | [mobile queue](../evidence/screenshots/tickets-mobile.png), [mobile detail](../evidence/screenshots/detail-mobile.png) |

These are captures of the running app, distinct from the supplied branding poster. They do not establish all-route keyboard coverage, screen-reader usability, or an automated accessibility result. No Axe scan completed in the blocked headless run.

## Observed failures and repairs

- **Review/worker race:** source review found an edit or rejection could invalidate approval after execution started. Mutations now lock and recheck action state; approval rechecks payload and current ticket/decision; worker reservation rechecks context. Two controlled-interleaving backend regressions pass. Native simultaneous-session behavior remains unverified.
- **Unbounded login memory:** arbitrary usernames could grow the failure map, and the login body was unbounded. Login now streams at most 16 KiB, enforces 128/1024-character field limits, expires entries, caps the map at 1000 and reserves before database awaits. Its concurrent-username/input-bounds regression passes.
- **Portable audit-error transport:** an earlier run failed when the PGlite socket closed on a deliberately rejected mutation, recorded in [persistence-recheck.log](../evidence/checks/persistence-recheck.log). The current assertion catches the SQL exception inside PostgreSQL, verifies the exact append-only error, and checks unchanged data. The final backend run passes.
- **Dependency reads:** Next and Vitest temporarily stalled before app code; tiny reads took seconds with negligible CPU, and Bun also stalled. Reinstalling from the unchanged lockfile with `npm ci --ignore-scripts` recovered normal startup. The reviewed build and full test run then completed. The underlying host/filesystem cause was not established.
- **Fresh-check timestamps:** the verifier now compares UTC SQL epochs, avoiding a PGlite JavaScript decoder/BST offset. Its final empty-database run confirms 400 unchanged snapshots across both seeds.
- **Failure-state controls:** manual browser review found issue drafting offered without valid decision output. The UI guard was repaired, the failure screen rechecked, and the production build rerun.
- **Browser restriction remains:** Chromium aborts at `bootstrap_check_in ... MachPortRendezvousServer: Permission denied (1100)` before opening a page. Its trace is a launch failure. Five remaining Playwright cases and their accessibility assertions did not run.

## Evidence and approval boundaries

Inspected text artifacts and source use synthetic data and fake credential canaries; no real credential disclosure was observed in that inspection. Launchers exclude build/product keys, and live response bodies are excluded from error logs. This is scoped review and exercised redaction behavior, not proof every possible secret can be detected. No real Keychain value was returned. Product suites have no dedicated stubbed macOS Keychain lookup regression.

No live Jev inference, Zendesk ingestion/write, application GitHub write, paid provider smoke, separate API build worker, repository creation, push, pull request, publication, visibility change, or deployment occurred. Live contracts, native PostgreSQL concurrency/recovery, deployment-specific authentication/privacy, a successful browser/Axe run, and Marc's personal usability verdict remain unverified. Wringer's final source-bound result remains pending. Local dry-run approvals authorise only exact simulated actions; they are not release or publication approval.

Portable copies of executed logs are retained in `evidence/checks/`, launch-failure evidence in `evidence/browser-launch/`, and actual screenshots in `evidence/screenshots/`. The structured [browser observations](../evidence/browser-review.json) and [saved API records](../evidence/demo-observations.json) preserve the delegated review. The two saved evaluation records have identical prediction hashes. A test listing or screenshot cannot substitute for a missing gate result.
