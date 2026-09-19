# ZenJev build status — 19 September 2026

> Historical offline-build baseline. See [live activation and release verification](release-verification.md) for the later Jev and publication phase and superseding verification results.

The application is implemented in this separate local repository: all six functional screens, persisted synthetic data, PostgreSQL/Prisma schema, independent durable worker, mock/Jev decisions, guarded GitHub/Zendesk adapters, exact approvals, audit, reconciliation, privacy, evaluation and operational scripts. See [actual test report](test-report.md) for completed checks and remaining verification; implementation alone is not a passing test result.

## Checked source and outcome

- Checked application/configuration commit: `29ca2c671e779fec93a2bee7bd9bca4043b3e3eb`, local `main`, clean at both harness run starts. Implementation parent: `2aa858ead23aa99651f40d67f53ddaf850f95cc0`.
- Wringer run `20260919-155421-529bca54`: fresh setup, branding, 52 contract/domain/smoke tests and 29 persistence/orchestration tests passed; required Chromium browser gate failed before page creation, with six subsequent cases not run.
- Wringer run `20260919-155502-8ad2b474`: separately selected lint, typecheck and production build all passed on the same source. Aggregate seven passed gates, one failed; no overall acceptance or successful Axe result.
- Both sealed bundles passed the unchanged harness's offline digest validation. Logs, results, launch trace and screenshots are retained under `evidence/`; the [manifest](../evidence/verification-manifest.json) binds application files and retained artifacts by SHA-256.
- Twelve recorded in-app browser review checks supplement the machine results. The five usability judgments and the agent's verdict are filled in [delegated review](delegated-review.md). Owner personal verdict remains null; `wringer.spec.yaml` remains unapproved and produces no fabricated acceptance report.

Resumable next verification: run the unchanged browser suite on a host that permits Chromium, then verify native PostgreSQL/Compose and the documented account-specific read-only smoke commands when live access is available. No paid smoke, real ticket processing, deployment or remote publication is needed to use the offline workbench.

## Observed environment and route

- Harness checkout `/Users/marc/Claude/wringer` was inspected at `7ca2fb58e4270ba70fc6f6fdf4a39e30d70d9cb4`; built Wringer alpha.14 / Bun1.4.2. No harness source was changed.
- Connected MCP workspace belonged to an unrelated reports demo. Its stopped jobs/reservations/approvals were not reused or changed.
- Apple Container1.3.1 `system status` and `image list` returned Operation not permitted. Containment and an ACP end-to-end journey remain unmeasured.
- The conversation's delegated-review instruction authorised the prepared direct-build route. Codex and coding-session subagents built the product; standalone trusted-local Wringer checks supply machine evidence. No human approval was fabricated.
- Node24.19.0, npm11.17.0, Next16.3.5, React19.3.0 and Prisma6.19.3 are locked. Native PostgreSQL17.10 initialization failed at shared-memory creation in the sandbox. The explicitly documented portable option persists PostgreSQL/WASM data with PGlite; native concurrency and Compose remain unverified here.
- Dependency reads later stalled before app code, including tiny-file reads with negligible CPU. A fresh `npm ci --ignore-scripts` from the unchanged lockfile recovered Next version startup to0.22s. The old dependency directory is retained ignored under `.local/dependencies-before-reinstall`; it contains reproducible dependencies, not customer data. Build CPU parallelism and Node heap are bounded for this host.
- Metadata-only Keychain diagnostics located the declared build-provider entries. No password was returned or injected into product code. GitHub preflight identity was verified as marcoakes; the intended repository lookup returned404. No remote repository was created.

## Delivery boundaries

No live Jev, Zendesk or application GitHub integration was contacted. No external ticket/issue mutation, paid provider smoke, separate API build worker, push, PR, visibility change or deployment occurred. Jev access remains pending. Mock metrics are simulation, not real model performance. Coding-app usage is not a measured Wringer provider bill.

The full original979-line brief and1254×1254 PNG are preserved unchanged. The README uses the canonical relative image link. Startup is documented, idempotent and credential-free. Agent review is recorded separately from the owner's personal usability verdict; only actual executed evidence in the report should be read as a test result.
