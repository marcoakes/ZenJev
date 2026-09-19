# ZenJev build status — 19 September 2026

ZenJev is implemented and published in the separate private [marcoakes/ZenJev repository](https://github.com/marcoakes/ZenJev). It includes six functional screens, persistent synthetic data, Prisma migrations, an independent durable worker, mock/Jev decisions, guarded GitHub/Zendesk adapters, exact approvals, audit, reconciliation, privacy controls and evaluation.

## Final verified source

The final [Linux run 35462754472](https://github.com/marcoakes/ZenJev/actions/runs/35462754472) **passed all ten gates and 109 counted cases** on `8ea4f2730365b180214c221ad5325c97e6e6a7bf`. It verifies native PostgreSQL 17.11 concurrency/recovery, production Chromium workbench journeys, authenticated sessions and roles, and Axe checks across six routes.

The [final seal audit](../evidence/ci/35462754472/seal-audit.json) verified four sealed bundles, their digests and clean exact-source identity. The historical baseline passed nine gates and 105 cases on `873b3d91faeaf4eba5cda3f60570b5b5f5d2ebe6`. Two intervening authentication attempts failed before the final repair passed. Their source-bound records remain in the [test report](test-report.md).

One bounded synthetic Jev request succeeded: `jev-1.13.0`, 747 input / 193 output tokens, zero retries. Its [safe result](../evidence/live/jev-smoke-20260919.json) is separate from mock evaluation and CI. The [app GitHub metadata smoke](../evidence/live/github-smoke-20260919-active-helper.json) also succeeded: one GET confirmed the repository is private, with zero retries, issue reads, model calls or mutations. The earlier credential-lookup failure remains historical evidence. GitHub issue retrieval/ingestion, Zendesk and all external ticket/issue writes remain unverified.

## Runtime and repository boundaries

The harness remains the unchanged `marcoakes/wringer` checkout at `7ca2fb58e4270ba70fc6f6fdf4a39e30d70d9cb4`, Wringer alpha.14 / Bun 1.4.2. The product uses Node 24, Next 16.3.5 and Prisma 6.19.3. CI runs trusted-local commands against a clean application checkout; it is not a contained ACP build or a demonstrated red-first history.

On the original Mac, Apple Container and native PostgreSQL startup were blocked by OS policy, and headless Chromium failed at Mach bootstrap. Those historical failures are retained. Linux CI later supplied successful native/browser evidence; it did not alter the host's restrictions. The fresh portable setup check still uses PGlite and is explicitly distinguished from native concurrency testing.

Dependency-read stalls previously recovered after reinstalling from the unchanged lockfile. The original Documents installation now has offloaded/dataless files and its database remains preserved and unrecovered. A **new isolated synthetic preview** is running at http://127.0.0.1:3000 from `/private/tmp/zenjev-runtime-iy3rBO/app` on the exact final tested source. Production build and HTTP/health checks passed; database is connected, worker is healthy and all 13 seed jobs completed. The queue rendered 100 tickets. Prior local actions, associations and history were not migrated. [Runtime provenance](../evidence/local-runtime/provenance.json) records the new database and preserved original.

## Delivery and review

The 979-line original brief and 1254 × 1254 PNG remain unchanged, including the relative README image link. The private GitHub repository is published; no hosted deployment or visibility change is included. No real customer data or provider write has been used for verification.

The usability review is filled by **Codex as a delegated agent**. Marc's personal verdict remains null and no human-presence approval is fabricated. The [release record](release-verification.md), [actual test report](test-report.md) and [requirement evidence](requirement-evidence.md) are the current handoff references. The older local manifest and sealed bundles remain historical, source-bound records, not evidence for later commits.
