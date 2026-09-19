# ZenJev release verification

The separate [marcoakes/ZenJev repository](https://github.com/marcoakes/ZenJev) exists and is private. Repository creation and pushes were authorised by the owner. No hosted deployment, repository visibility change, customer-data processing or ticket/issue mutation is implied by that publication.

## Final verified source

The final [CI run 35462754472](https://github.com/marcoakes/ZenJev/actions/runs/35462754472) **passed all ten gates and 109 counted cases** on source `8ea4f2730365b180214c221ad5325c97e6e6a7bf`. It ran the unchanged Wringer harness, native PostgreSQL 17 services, a production Next.js build, Chromium/Axe and the repaired authenticated-navigation coverage.

| Field | Observed value |
|---|---|
| Final CI run | [35462754472](https://github.com/marcoakes/ZenJev/actions/runs/35462754472) |
| Final tested application source | `8ea4f2730365b180214c221ad5325c97e6e6a7bf` |
| Final CI verdict | **Success** |
| Verified scope | Ten gates; 109 cases: 61 contracts, 31 persistence, four native, four branding, seven workbench browser and two authenticated browser. |
| Evidence integrity | Four sealed bundles; all source identities, clean-source checks and digests verified in the [final seal audit](../evidence/ci/35462754472/seal-audit.json). |

The historical baseline [35458763894](https://github.com/marcoakes/ZenJev/actions/runs/35458763894) passed nine gates and 105 cases on `873b3d91faeaf4eba5cda3f60570b5b5f5d2ebe6`; its [seal audit](../evidence/ci/35458763894/seal-audit.json) remains unchanged. Later attempts are preserved: [35458834078](../evidence/ci/35458834078/github-run.json) failed on an origin check; [35460894235](../evidence/ci/35460894235/github-run.json) established login/session success but remained on the cached login route. The final run verifies the repairs on its own source.

## What has been verified

- Native PostgreSQL **17.11** CI services and independent database connections, including approval/edit races, atomic job claims, killed-worker lease recovery and reconciliation after interrupted execution.
- Fresh dependency installation, Prisma generation and migrations, idempotent synthetic seed, production compilation, lint and type checks under the pinned harness.
- Seven workbench browser cases, including the actual dry-run approval journey, saved evaluation, failure-state controls, original artwork, narrow layout and Axe checks for serious/critical WCAG 2 A/AA findings across six routes; two authenticated browser cases cover login/logout, sessions and role restrictions.
- One actual synthetic Jev request, described below, and one read-only GitHub metadata GET confirming the private repository. No broader live model evaluation, issue retrieval or external mutation is claimed.

These are bounded software checks. They are not production load/availability certification, an exhaustive accessibility audit or a human-presence approval.

## Actual live Jev request

On 19 September 2026, `node scripts/keychain-jev.mjs --allow-one-paid-request` succeeded using only service `typesafe-api-key`, account `zenjev`. The trusted launcher captured the key in memory and passed it only to the clean Jev child environment. No key value was recorded or supplied in command arguments; Keychain access controls were unchanged.

Requested/reported model: **`jev-1.13.0`**. Provider latency: **653 ms**; total smoke duration: **664 ms**. Reported usage: **747 input / 193 output tokens**. The fixed fictional billing input used six typed questions, no candidates, one request, zero retries and a 15-second deadline. See the [live result and source hashes](../evidence/live/jev-smoke-20260919.json) and [nine offline safety tests](../evidence/live/keychain-tests.log).

This establishes connectivity and schema handling for that request. Matching, real customer data, accuracy/calibration, and additional paid evaluations remain outside this result. The ordinary application stays synthetic/mock/dry-run.

## Remaining boundaries

The [application GitHub metadata smoke](../evidence/live/github-smoke-20260919-active-helper.json) succeeded against `marcoakes/ZenJev`: exactly one GET returned private-repository metadata, with a 15-second deadline, zero retries and no issue reads, customer data, model calls or mutations. The existing active-account helper supplied the credential only through trusted process memory and the clean child environment; its value was never printed, persisted or passed in arguments. The [earlier attempt](../evidence/live/github-smoke-20260919.json) failed during credential lookup before HTTP and remains historical evidence. No source change, alternate credential store or new scope was needed. GitHub issue retrieval/ingestion and all writes remain unverified; publication and metadata access do not establish those permissions.

Zendesk live OAuth, ingestion, exports, webhook delivery and all external ticket/issue writes remain unverified. Deployment-specific authentication, networking, privacy and operational load remain to be assessed for an actual deployment. Authenticated browser checks passed in the final run; deployment-specific controls still require validation in their actual environment.

The local preview is running at http://127.0.0.1:3000 from the final tested source in `/private/tmp/zenjev-runtime-iy3rBO/app`. Production build and HTTP readiness passed; health reports a connected database and healthy worker. SQL confirmed 100 synthetic tickets, 20 issues, 12 organisations, 200 labels, all 13 seed jobs complete and zero live rows. The root agent also rendered the 100-ticket queue and its healthy synthetic/mock/dry-run footer. This is a **new isolated synthetic database**. The original offloaded Documents installation/database is preserved and unrecovered; prior actions, associations and history were not migrated. See [runtime provenance](../evidence/local-runtime/provenance.json). The temporary runtime is a local preview and may be removed by operating-system temporary-file cleanup.

Review is **Codex delegated agent review**. Marc's personal usability verdict remains `null`; no owner signature or controller human-presence event has been fabricated. [Test report](test-report.md), [requirement matrix](requirement-evidence.md) and [delegated review](delegated-review.md) separate these facts from the historical macOS limitations.
