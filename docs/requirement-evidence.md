# ZenJev requirement-to-evidence map

This maps the unchanged [master specification](../ASTRA_MASTER_BUILD.md) to implemented behavior and actual evidence. The final [CI run 35462754472](https://github.com/marcoakes/ZenJev/actions/runs/35462754472) **passed all ten gates and 109 counted cases** on source `8ea4f2730365b180214c221ad5325c97e6e6a7bf`, including native PostgreSQL recovery, production workbench journeys and repaired authenticated navigation.

The [final seal audit](../evidence/ci/35462754472/seal-audit.json) verifies four bundles, all digests and clean exact-source identity. The historical baseline [35458763894](https://github.com/marcoakes/ZenJev/actions/runs/35458763894) passed nine gates and 105 cases; its [seal audit](../evidence/ci/35458763894/seal-audit.json) remains available. The [test report](test-report.md) separates that baseline, two failed authentication attempts and the final passing source.

## Evidence boundaries

- Application/database/browser assertions below ran in Linux CI. Provider contract tests intercepted HTTP and used synthetic inputs. The separate successful [live Jev smoke](../evidence/live/jev-smoke-20260919.json) made one fixed synthetic request only.
- Native PostgreSQL 17.11 tests used independent processes and real locks. Fresh portable setup used PGlite explicitly. These are distinct evidence sources; neither establishes production load or arbitrary crash recovery.
- The original macOS Chromium launch failed; later Linux Chromium/Axe checks passed. Original failure records remain retained. Authenticated-browser coverage passed on the final repaired source.
- The [private product repository](https://github.com/marcoakes/ZenJev) exists. A separate [app GitHub metadata smoke](../evidence/live/github-smoke-20260919-active-helper.json) succeeded with one GET, confirming it is private; zero retries, issue reads, customer data, model calls or mutations occurred. The [earlier credential-lookup failure](../evidence/live/github-smoke-20260919.json) remains historical. Metadata access does not establish GitHub issue retrieval/ingestion or write permissions; those and Zendesk remain unverified.
- Review is delegated agent review. Marc's personal verdict is null. No human-presence approval or blanket requirement acceptance is manufactured from a gate label.

## SW-01 through SW-12

| ID | Implemented behavior and concrete checks | Observed evidence and limit |
|---|---|---|
| SW-01 | Versioned migrations, repeatable seed, credential-free launcher, independent worker and health. [Fresh check](../scripts/check-fresh-setup.mjs); backend idempotent-seed assertion; queue/worker browser assertion. | Fresh setup and browser gates passed. Five migrations; 100 tickets, 300 comments, 20 issues, 12 organisations, 200 labels, 400 stable snapshots. A new isolated synthetic Mac preview passed production build/health checks; [provenance](../evidence/local-runtime/provenance.json) records it. Original offloaded database remains preserved and unrecovered. |
| SW-02 | Three differently worded webhook reports select the same issue; ambiguous sign-in remains in review; three approved associations group by issue. [Domain](../tests/domain.test.ts), backend SW-02, browser SW-02. | Baseline domain/backend/browser checks passed, plus recorded manual associations. Synthetic behavior, not measured Jev matching accuracy. |
| SW-03 | Synthetic tickets remain dry-run despite supplied fake credentials/write flags. Exact previews produce local receipts. Provider writes reject synthetic/dry-run bindings before HTTP. | Backend SW-03, provider negative tests and browser approval journey passed. No real ticket or issue mutation. |
| SW-04 | Real-adapter failures persist as Jev failures, without mock fallback. UI disables preparation after a failed decision. | Backend missing-key and provider authentication/schema negatives passed; failure-state browser case passed. One real synthetic Jev success is separately recorded. |
| SW-05 | Exact approval hashes bind payload, destination, ticket/snapshot/decision, mode and provider. Edits invalidate approval; stale context blocks execution. | Domain hashes, backend edit/stale/interleaving tests, browser edit/reapprove flow and native approval/edit race passed. Final authenticated navigation also passed. |
| SW-06 | Durable leases, deduplication, guarded attempts and explicit reconciliation; created-issue identity survives backlink failure. | Persistence/orchestration tests and four native-process concurrency/recovery cases passed. Remote outcomes are injected fixtures; real provider reconciliation is unverified. |
| SW-07 | Internal notes excluded by default and from GitHub drafts; supplied identities/secret-like text redacted; launchers strip unrelated keys. | Domain/backend/privacy, fake-canary isolation and nine Keychain smoke safety tests passed. Redaction is bounded, not a guarantee for every possible secret. |
| SW-08 | Evaluator-only labels, incident splits, frozen source snapshots and time-bounded issue retrieval prevent tested label/time leakage. | Domain leakage, backend frozen prediction and ingestion orchestration tests passed. No unseen live dataset evaluated. |
| SW-09 | Threshold simulation recomputes metrics from frozen predictions without model calls, approvals or automatic routing. | Backend call-count assertions, denominator/policy domain tests and browser saved-evaluation case passed. Thresholds remain unvalidated for production decisions. |
| SW-10 | Session/role/CSRF/origin enforcement, fixed teams/candidates, repository allowlist, private-only writes and Zendesk safe updates. | API/provider negative tests passed. The authenticated-browser gate exposed two failures, then passed on the final repaired source. Live GitHub metadata access is verified; issue retrieval/write and Zendesk permissions are unverified. |
| SW-11 | Reviewable conversation, private evidence, omissions, saved probabilities/policy, candidates, exact payload, approval and receipt/history. | Final browser journeys, six-route Axe case and delegated review passed within their scope. Marc's personal usability verdict remains null. |
| SW-12 | Reproducible commands, CI/native services, unchanged pinned Wringer, source-bound evidence, integration/activation guides and this matrix. | Clean-install CI and final seal audit passed; private repository published. New isolated local preview readiness is recorded separately from the preserved, unrecovered original database. |

Assertion sources: [backend](../tests/backend.test.ts), [domain](../tests/domain.test.ts), [providers](../tests/providers.test.ts), [orchestration](../tests/provider-integration-orchestration.test.ts), [native concurrency](../tests/native-concurrency.test.ts), [workbench browser](../tests/browser/workbench.spec.ts), [authenticated browser](../tests/browser/auth.spec.ts), [Keychain safety](../tests/keychain-jev.test.ts).

## ZJ-01 through ZJ-05

| ID | Evidence | Qualification |
|---|---|---|
| ZJ-01 | Exact ZenJev README/package/UI identity; branding assertion; separate private `marcoakes/ZenJev` repository. | Repository publication is observed. The unchanged Wringer harness remains separate. |
| ZJ-02 | Canonical [PNG](../public/branding/zenjev-hero.png), 1254 × 1254, SHA-256 `12d814fe08a70d57764a0c8d27ad6b0bb43f9b7706407b79a6d05217c1a54d7d`; bytes, decompression, tracking and no-filter checks passed. | Original supplied image, no derivative substitution. |
| ZJ-03 | [Branding test](../checks/branding.test.mjs) resolves the exact relative README embed and alt text. | Passed in the final branding gate. |
| ZJ-04 | Browser fetched local artwork and checked alt text, natural dimensions and uncropped square bounds; About inspected manually. | Final browser case passed. The poster is distinct from captured app screenshots. |
| ZJ-05 | Pink/black/cream workbench, readable evidence, persistent provenance, keyboard controls, mobile layout and six-route Axe checks. | Final browser checks passed and an actual CI queue screenshot was visually reviewed. This is not complete accessibility certification. |

## Part II section 16: A-01 through A-18

These labels preserve the original table's row order and supplement the SW/ZJ mappings.

| ID | Acceptance row | Actual evidence / remaining qualification |
|---|---|---|
| A-01 | No-credential startup | Clean CI installation, migration, seed, production readiness and fresh portable setup passed. New isolated Mac preview passed HTTP/worker readiness; the original offloaded database remains preserved and unrecovered. |
| A-02 | Modes | Synthetic/mock/dry-run boundaries and provenance tested. Actual synthetic/Jev smoke succeeded. No live/customer-data workspace was activated. |
| A-03 | Full demo workflow | Persisted association → exact preview → approval → dry-run receipt passed through backend and browser. |
| A-04 | Genuine model adapter | Typed native Jev contract tests plus one actual six-question response from `jev-1.13.0`. Matching and broader evaluation remain unmeasured. |
| A-05 | No silent fallback | Missing-key/authentication/schema failures and failed-decision UI controls passed. |
| A-06 | Candidate bounds | Invented/foreign/future candidates rejected; stored-candidate and repository boundaries tested. No live retrieval completeness claim. |
| A-07 | Abstention | Ambiguous/multi-problem/insufficient inputs require review; browser ambiguous case passed. Mock probabilities are simulated. |
| A-08 | Visibility | Internal-note exclusion, draft privacy and private-repository recheck tests passed. No public-repository mutation. |
| A-09 | Webhook verification | Signature, clock, account, size and durable duplicate-enqueue assertions passed with computed fixtures. No real Zendesk delivery. |
| A-10 | Durable sync | Cursor recovery, bounded comments/export, author/visibility handling, rate scheduling and customer-marker attacks tested. Live account export remains unverified. |
| A-11 | Authentication | Server session/CSRF/role/input-limit tests passed. Added browser login/logout/role coverage passed on the final navigation-repair source. |
| A-12 | Approval integrity | Exact hashes, stale/edit/mode checks, native approval race and separate tags/note/backlink approvals passed. App approval is not owner-presence or release approval. |
| A-13 | Dry-run isolation | Fake live credentials/flags still yield zero external calls for synthetic actions; browser saved receipt passed. |
| A-14 | Safe remote execution | Native claims/worker recovery and guarded execution tests passed. HTTP conflicts/timeouts/retries are fixture-tested; real writes remain unverified. |
| A-15 | Partial failure | Simulated uncertain creation/backlink failures retain issue identity and suppress duplicates. No real external failure was induced. |
| A-16 | Evaluation integrity | Frozen predictions/labels, split/time boundaries, denominator/policy calculations and zero-call simulation passed. No real model calibration claim. |
| A-17 | Honest presentation | Persisted counts/provenance, explicit failures, unknown usage and synthetic labels checked. Live Jev measurements are recorded separately from mock metrics. |
| A-18 | Browser quality | Seven workbench cases, six-route Axe checks and desktop/narrow artifacts passed in final CI. Final auth navigation passed; complete screen-reader and all-state coverage are not claimed. |

## Additional controls and handoff

The executed suites also cover editable fixed-team criteria/policy, append-only audit rejection with unchanged data, retention CLI dry-run/apply behavior, large external integer IDs, bounded retries and server Retry-After deadlines. [Bounded integration-smoke tests](../tests/integration-smoke.test.ts) verify explicit scope/target/flags, exact read sequences and safe output. The separate live GitHub smoke verified repository metadata access with the existing active-account helper. Its earlier lookup failure remains retained; no issue retrieval/ingestion or write access was exercised.

Historical local manifests and failed launch traces remain source-bound records. Later successful CI runs do not rewrite the originals. The final outcome is bound to its recorded source and retained artifacts. [Release verification](release-verification.md) and [test report](test-report.md) are the current summaries.
