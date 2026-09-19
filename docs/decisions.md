# Implementation decisions — 19 September 2026

ZenJev lives in its own Git repository. Wringer is the development/verification harness, not the application runtime. The supplied master specification and poster remain byte-for-byte originals. No archive was available: the two supplied files formed the self-contained handoff.

## Execution and review

The owner delegated engineering decisions and review in the conversation ("i want you to act as the human and review and fill everything out"). Codex proceeded with the prepared direct-build route, using the current coding session and three coding subagents. This is delegated agent review, not evidence of Marc's physical presence, personal usability verdict, or signature. No Wringer human approval was populated. The unrelated reports controller was left untouched.

The attempt was bounded to three hours from 13:55:02 UTC, three concurrent coding subagents, no separate paid API workers, no provider connectivity/smoke requests, and at most three repairs for an unchanged failing acceptance group. This does not measure or cap coding-app billing. No repository was published and no provider data was mutated.

Wringer standalone `trusted_local` verification is explicit. Apple Container inspection failed with `Operation not permitted`; we did not invent a measured image digest or claim containment. The harness checkout remains unchanged at `7ca2fb58e4270ba70fc6f6fdf4a39e30d70d9cb4`, binary alpha.14. Standalone gate results are machine evidence; they do not establish a red-first contained ACP journey or owner acceptance.

## Runtime

Pinned Node 24 / Next 16 / React 19 / TypeScript / Prisma 6, PostgreSQL schema and independent durable worker. Tailwind and local reusable components implement the pink, ink, cream and white design. System fonts and bundled assets keep the demo independent of remote assets.

Default demo uses native PostgreSQL 17, project-local binaries, or the separately started Compose service. Native startup was attempted but this sandbox denied PostgreSQL shared memory (`shmget`, Operation not permitted). The explicitly selected `demo:portable` mode uses PGlite's PostgreSQL WASM engine and a local wire-protocol server. It persists real schema/data and runs the same queries; its single-engine multiplexing cannot prove native multi-session concurrency. Native recovery/concurrency remains an external verification obligation. Portable prepared statements require `pgbouncer=true&statement_cache_size=0&connection_limit=1`; startup alone clears stale session statements before migrations.

Dependencies were installed with lifecycle scripts disabled and exact versions locked. `npm run setup` restores only in-package PostgreSQL library symlinks after path validation and generates Prisma. It does not invoke arbitrary install scripts. Demo/tests strip inherited build/API keys and set explicit synthetic/mock/write-off modes. Watch polling avoids this sandbox's file-descriptor limit in Next development mode.

## Decisions and persistence

Mock classification uses ticket text, not expected labels or fixture IDs. Every successful/failed decision retains provenance; there is no live-to-mock fallback. Context contains only permitted time-bounded messages; evaluator labels are stored separately. All cutoffs start as unvalidated policies. Saved predictions and labels are frozen for threshold recomputation; it does not call Jev or route tickets.

An exact action approval binds payload, destination, ticket snapshot/version, decision, mode and provider, expires after 30 minutes, and is invalidated on edit or changed context. The worker revalidates current authorisation and ticket state. Outbox leases, per-ticket locks, deduplication and explicit uncertain states prevent blind write retries. Issue creation and backlink notes are separately approved actions with retained parent receipts. Audit updates/deletes are rejected by a database trigger.

Local loopback synthetic data permits a clearly named demo reviewer. Live configuration requires proper database credentials, session secret, authenticated roles, CSRF and both environment and workspace processing/write flags. Private repository visibility is checked at execution. Internal notes never flow into GitHub drafts; all external mutations have exact previews. The retention CLI is count-only by default and requires explicit `--apply`; audit receipts remain.

## Provider contracts and limits

Official documentation was rechecked during implementation: native Jev `jev-1.13.0` typed decision API, GitHub REST version `2026-03-10`, Zendesk cursor incremental export and HMAC webhook verification. See integrations for links, exact scopes, retries and disclosure rules. HTTP fixtures test schemas and failures; no live Jev, Zendesk or application GitHub integration was contacted. The only authenticated GitHub request was preflight identity/repository visibility via the existing CLI helper.

Jev access is pending. Usage absent from a provider response stays null; mock latency is local processing time and mock metrics are simulated. No real calibration, provider cost, production readiness or live-account success is claimed. Deployment, external mutations and publication remain separate decisions.
