# ZenJev verification report — 19 September 2026

**Final result: ten gates and 109 counted cases passed.** [CI run 35462754472](https://github.com/marcoakes/ZenJev/actions/runs/35462754472) verified application source `8ea4f2730365b180214c221ad5325c97e6e6a7bf` through the unchanged Wringer harness. Native PostgreSQL, production workbench browser/Axe and the repaired authenticated-navigation checks ran successfully in Linux CI. One separate live Jev request also succeeded on synthetic input, and one GitHub metadata GET confirmed the private repository.

The earlier nine-gate/105-case baseline and two failed authenticated-browser attempts remain historical evidence. The final repaired source has its own passing run; earlier failures have not been rewritten.

The repository exists privately at [marcoakes/ZenJev](https://github.com/marcoakes/ZenJev). Publication is verified separately from integration access and no hosted deployment is claimed.

## Source-bound execution record

| Run/source | Actual outcome | Retained evidence |
|---|---|---|
| Local `29ca2c671e779fec93a2bee7bd9bca4043b3e3eb` | Seven gates passed; required browser gate failed before page creation. 81 application tests and four branding checks passed. Database evidence was portable PGlite only. | [First bundle](../evidence/wringer/wringer-final.json), [remaining gates](../evidence/wringer/wringer-remaining.json), [browser launch trace](../evidence/browser-launch/trace-final.zip) |
| CI `873b3d91faeaf4eba5cda3f60570b5b5f5d2ebe6`, run 35458763894 | **Nine gates / 105 cases passed**; native PostgreSQL 17.11, production server and Chromium. | [Run record](../evidence/ci/35458763894/github-run.json), [raw log](../evidence/ci/35458763894/github-run.log), [seal audit](../evidence/ci/35458763894/seal-audit.json) |
| CI `88afc37003b2f6e12339ea8f1156bd62e3d8a34e`, run 35458834078 | Failed added authenticated-browser coverage: request rejected by origin validation (403). | [Run record](../evidence/ci/35458834078/github-run.json), [log](../evidence/ci/35458834078/github-run.log) |
| CI `e86ec5753787ee7d53cc0fa8070ff90e6df42f95`, run 35460894235 | Failed authenticated navigation: login returned 200 with cookie/session, but the browser stayed on the cached login route. | [Run record](../evidence/ci/35460894235/github-run.json) |
| Final CI `8ea4f2730365b180214c221ad5325c97e6e6a7bf`, run 35462754472 | **Ten gates / 109 cases passed**, including repaired authenticated navigation. | [Run record](../evidence/ci/35462754472/github-run.json), [raw log](../evidence/ci/35462754472/github-run.log), [seal audit](../evidence/ci/35462754472/seal-audit.json) |

The harness is unchanged Wringer alpha.14 at `7ca2fb58e4270ba70fc6f6fdf4a39e30d70d9cb4`, using Bun 1.4.2. CI checks out the exact application source, installs dependencies, runs commands through Wringer, retains failures/artifacts and verifies that the source remains clean. The final independent audit validated four sealed bundles, all digests and clean exact-source identity. This audits recorded evidence; it is not another product-test execution. The [workflow](../.github/workflows/verify.yml) and [launcher](../scripts/ci-verify.mjs) define the reproducible environment.

## Final passing run: ten gates

| Gate | Actual outcome on source `8ea4f273…` | Scope |
|---|---|---|
| `fresh-offline-setup` | Passed | Empty PGlite database; five migrations; two seed passes with identical snapshots/counts. |
| `branding` | Four passed | Exact PNG bytes/dimensions/decompression, tracked asset, identity and relative README link. |
| `domain-provider-contracts` | 61 passed | Domain 20, providers 27, bounded integration smoke five, Keychain/Jev safety nine. HTTP and keys are simulated in these tests. |
| `persistence-workflow` | 31 passed | Backend 25 and orchestration six against the isolated native CI test database. |
| `native-concurrency` | Four passed | Separate processes/connections, real SQL lock barriers, atomic claims, killed-worker lease recovery and interrupted-action reconciliation. |
| `browser` | Seven passed | Production workbench journeys, failed-decision controls, original artwork, desktop/mobile layout and Axe across six routes. |
| `browser-auth` | Two passed | Actual login/logout, authenticated navigation, session controls and viewer/reviewer restrictions. |
| `lint` | Passed | Declared ESLint command, no allowed warnings. |
| `typecheck` | Passed | Declared TypeScript check. |
| `production-build` | Passed | Next production compilation before browser startup. |

Counts include branding and browser cases: **61 + 31 + 4 + 4 + 7 + 2 = 109**. The fresh setup, lint, typecheck and build gates are not invented extra test cases. The historical 105-case baseline is retained in the source-bound record above.

The fresh portable check observed **100 synthetic tickets, 300 comments, 20 issues, 12 organisations, 200 evaluator-only labels, 400 unchanged source snapshots, 13 jobs and zero actions**. All five migrations applied; two seeds preserved every inspected snapshot. Mock mode, disabled live writes/processing and default internal-note exclusion were asserted. CI additionally exercised native PostgreSQL **17.11** with distinct backend PIDs and a clean dependency installation. Neither result is a production load or disaster-recovery certification.

Axe rejected serious/critical WCAG 2 A/AA findings on the six inspected routes; that case passed in CI. This is a bounded automated scan, not full accessibility certification or complete screen-reader coverage.

## Live integration evidence

| Integration | Observed result | Boundary |
|---|---|---|
| Jev | One successful request: requested/reported `jev-1.13.0`, 653 ms provider latency, 664 ms total, 747 input / 193 output tokens. | Fixed fictional invoice question, six typed questions, zero candidates, 15-second deadline, zero retries; no customer data or writes. [Result and source hashes](../evidence/live/jev-smoke-20260919.json). |
| Application GitHub adapter | Succeeded: exactly one repository metadata GET confirmed `marcoakes/ZenJev` is private. | Existing active-account helper; 15-second deadline, zero retries, issue reads, customer data, model calls or mutations. [Result and source hashes](../evidence/live/github-smoke-20260919-active-helper.json). The [earlier credential-lookup failure](../evidence/live/github-smoke-20260919.json) remains historical; no HTTP request occurred in that attempt. |
| Zendesk | No live verification. | OAuth, comments, export, webhooks and guarded writes are implemented and tested with intercepted HTTP. |
| External ticket/issue writes | None performed. | All exercised application mutations were synthetic dry runs or intercepted provider contracts. |

The Keychain launcher selects only service `typesafe-api-key`, account `zenjev`, captures the key in memory and supplies only the Jev child. Nine offline tests verify exact lookup, credential isolation, cancelled/malformed lookup handling, reflected-key redaction, bounded output/deadlines and no retries. Real values are absent from recorded logs, source, command arguments and screenshots. The successful Jev smoke is connectivity/schema evidence; accuracy, matching and broader live evaluation remain unmeasured.

## Delegated review and local runtime

Codex performed the recorded browser review under delegated authority. Queue search/pagination, three reports linked to issue #241, uncertain ownership, exact route approval, saved dry-run receipts, settings persistence, threshold simulation, poster and mobile focus behavior were exercised. [Browser observations](../evidence/browser-review.json), [API records](../evidence/demo-observations.json) and [screenshots](../evidence/screenshots/workbench-final.png) retain those observations. The root agent also inspected an actual CI queue screenshot and found the supplied visual identity and operational layout intact.

The completed [delegated review](delegated-review.md) gives the agent's judgment. Marc's personal verdict remains **null**; no signature, owner-presence event or release approval has been fabricated.

A **new isolated synthetic preview** is running at http://127.0.0.1:3000 from `/private/tmp/zenjev-runtime-iy3rBO/app`, exact final source `8ea4f2730365b180214c221ad5325c97e6e6a7bf`. Production build passed; page and health endpoints returned 200, database was connected and worker healthy. SQL confirmed 100 tickets, 20 issues, 12 organisations, 200 labels, 13 completed seed jobs and zero live rows. The root agent rendered the 100-ticket queue with its healthy synthetic/mock/dry-run footer. [Runtime provenance](../evidence/local-runtime/provenance.json) and accompanying logs retain those checks. The original Documents installation/database remains offloaded, preserved and unrecovered; prior actions, associations and history were not migrated.

## Historical failures and repairs

- The original host blocked Apple Container, native PostgreSQL shared memory and Chromium's Mach bootstrap. Later CI supplied native/browser execution; it did not turn the earlier failures into passes.
- Review found action edit/rejection races and unbounded login inputs/failure-map growth. Lock/recheck changes and bounded login handling were added with regression tests; native CI later exercised independent-process approval races.
- An early portable audit test encountered a socket closure on a deliberately rejected mutation. The assertion now catches the SQL exception inside PostgreSQL, verifies its exact append-only error and checks unchanged records.
- Dependency reads stalled before application code. Reinstallation from the unchanged lockfile recovered the earlier run; later offloading is being handled separately. No root-cause claim is made for the host filesystem behavior.
- Browser review repaired drafting after a failed decision and the closed mobile drawer remaining keyboard-accessible. The workbench CI cases passed after those repairs.
- Initial Wringer verification refused duplicate `proves` assignments. Unique criterion ownership repaired configuration without deleting gate commands or assertions.
- The added authenticated-browser gate found origin handling and then cached login navigation problems. Its final repair passed in run 35462754472 on the source recorded above.

## Remaining limits

Live Zendesk access, GitHub issue retrieval/ingestion, real ticket/issue writes, broader Jev evaluation and deployment-specific networking/privacy/load remain unverified. The repository is private and published; no hosted service is deployed. Contained ACP execution and red-first build history were not demonstrated. Historical manifests remain bound to their recorded sources and must not be read as certificates for later commits.
