# ZenJev requirement-to-evidence map

Prepared 19 September 2026 from the complete [master build specification](../ASTRA_MASTER_BUILD.md). This map records the source/branding bootstrap, not a completed application. Application implementation has not started, product behavior checks have not run, and no live Jev, Zendesk or application GitHub integration has been verified.

The preflight recorded **4 passing Node branding tests** in [`checks/branding.test.mjs`](../checks/branding.test.mjs), run with `node --test checks/branding.test.mjs`. These cover only the repository portions of ZJ-01, PNG integrity/tracking in ZJ-02, and the relative README link in ZJ-03. They do not establish a working app, browser rendering, accessibility, provider connectivity, owner acceptance or publication. See [build status](build-status.md) for the observed harness/runtime prerequisites and [execution decision](execution-decision.md) for the unresolved route choice.

Each future verification record must identify the exact checked product source, Wringer route/version, command, exit status, assertion results, artifact paths, data/provider/write modes, and any failures or skips. Test source is an executable definition, not by itself a test result. Protected acceptance definitions must be reviewed and frozen before judging implementation; changing them to obtain a pass is not permitted.

## Wringer acceptance requirements

| ID | Required behavior | Current status | Evidence to produce |
|---|---|---|---|
| SW-01 | Fresh offline setup, migrations and idempotent seed work without external credentials. | Not implemented; unrun. | Clean documented setup log; database assertions before/after repeated seed; usable seeded app; no external-service requests. |
| SW-02 | Three differently worded synthetic reports propose the same known issue; an ambiguous report remains in review. | Not implemented; unrun. | Browser workflow trace plus saved decisions, candidate snapshots and approved local association records. |
| SW-03 | Synthetic data cannot cause real external writes even when credentials and write flags are present. | Not implemented; unrun. | Negative tests invoking server endpoints and worker policy directly; write-adapter call count remains zero. |
| SW-04 | Missing or failing live Jev never silently becomes a mock success. | Not implemented; unrun. | Contract/error-path and UI assertions; persisted failed runs retain requested provider/data mode and actionable error. |
| SW-05 | Edited previews and stale ticket snapshots invalidate existing approvals. | Not implemented; unrun. | Exact payload/destination/mode/snapshot/decision identity tests; stale or edited approval cannot execute. |
| SW-06 | Duplicate notifications, worker crashes, expired leases and uncertain writes do not cause blind repeated actions. | Not implemented; unrun. | Durable job/outbox state assertions, concurrent claim/restart tests, deduplication and reconciliation records. |
| SW-07 | Internal notes, secrets and disallowed customer data stay out of GitHub drafts and portable evidence. | Not implemented; unrun. | Fake-canary privacy/redaction tests; permitted-source and disclosure-boundary assertions; sanitized evidence inspection. |
| SW-08 | Held-out labels and information later than the decision timestamp never enter prediction context. | Not implemented; unrun. | Snapshot/context-builder, retrieval time-boundary and dataset-split tests, including related-incident grouping. |
| SW-09 | Threshold changes recompute metrics from saved predictions without model calls or live routing. | Not implemented; unrun. | Saved-prediction metric assertions, unchanged predictions, provider-call counts and action-policy assertions. |
| SW-10 | Non-allowlisted destinations, unsupported mutations and unauthorized requests are rejected server-side. | Not implemented; unrun. | Direct API/worker authorization tests; public-repository and unsupported-action negatives; verified current visibility before allowed write. |
| SW-11 | Reviewer can inspect ticket evidence, uncertainty, candidate and exact proposed action. | Not implemented; browser checks unrun; owner judgment pending. | Browser interactions and actual rendered screenshots; separately recorded genuine owner usability judgment. |
| SW-12 | Handoff names exact checked source, data/model modes, commands and unmet requirements. | Not implemented as a product handoff; bootstrap status only. | Source-bound structured evidence validation, actual outcomes/skips and reproducible fresh-clone startup/check instructions. |

## Branding acceptance requirements

| ID | Required outcome | Current status | Evidence available and remaining |
|---|---|---|---|
| ZJ-01 | Exact ZenJev README/UI/app identity and intended `marcoakes/ZenJev` target, separate from Wringer. | Repository portion passed; application identity not implemented or tested. | One Node check verifies README heading and package `zenjev`; repository boundary is recorded in preflight. Still inspect app metadata/navigation and final configured target. Intended remote naming is not evidence of remote creation/publication. |
| ZJ-02 | Original approved PNG at the canonical tracked path, unchanged. | Bootstrap integrity/tracking checks passed. | Two Node checks verify SHA-256 `12d814fe08a70d57764a0c8d27ad6b0bb43f9b7706407b79a6d05217c1a54d7d`, PNG signature/IHDR, 1254 × 1254 dimensions, bounded chunk structure, decompression, Git tracking and no content filter. Recheck against the final candidate source; browser behavior is ZJ-04. |
| ZJ-03 | Working root README relative image link without sandbox/chat dependencies. | Bootstrap check passed. | One Node check resolves `public/branding/zenjev-hero.png`, checks exact supplied alt text, and rejects `/mnt/data` or sandbox references. Preserve and recheck the relative link when updating the README. |
| ZJ-04 | App serves the image offline, undistorted, with usable desktop/narrow layouts. | Not implemented; browser checks unrun. | Local image HTTP response, decoded natural dimensions, exact alt text, aspect ratio, responsive screenshots and network assertions excluding external image requests. |
| ZJ-05 | Branded UI remains an accessible operational workbench with simulation/provenance labels. | Not implemented; browser checks unrun. | Actual queue/detail/engineering/evaluation screens; readable semantic tables, keyboard/focus/state-label checks, persistent mode badges and poster placement that does not block tickets. |

## Individually identified product acceptance tests

The A-series identifiers below name the eighteen acceptance rows in Part II §16 without replacing SW or ZJ requirements. Every A-series behavior remains unimplemented and unrun.

| ID | Source acceptance row | Passing behavior and evidence to produce | Current status |
|---|---|---|---|
| A-01 | No-credential startup | Fresh documented setup reaches a seeded usable app without Zendesk, GitHub or Jev credentials; retain setup/database/UI evidence. | Not implemented; unrun. |
| A-02 | Modes | Persistent UI badges and stored provenance distinguish synthetic/mock, synthetic/Jev and live/Jev; forbidden live/mock and synthetic-write combinations fail server-side. | Not implemented; unrun. |
| A-03 | Full demo workflow | Browser evaluates a ticket, inspects results, approves a local issue link, previews a dry-run route and inspects a persisted receipt. | Not implemented; unrun. |
| A-04 | Genuine model adapter | Mocked HTTP tests validate the current official native Jev request/response schema, validation and error behavior; optional real call is separately identified and approved. | Not implemented; unrun; live Jev unavailable. |
| A-05 | No silent fallback | A failed or unavailable live Jev call persists a failed live run and shows an error instead of producing synthetic success. | Not implemented; unrun. |
| A-06 | Candidate bounds | Model output cannot select a repository/issue outside the immutable stored candidate set and configured allowlist; retain malformed/out-of-set negative tests. | Not implemented; unrun. |
| A-07 | Abstention | Unknown routing, multiple plausible matches, incomplete context and malformed responses force review; retain decision/policy and UI assertions. | Not implemented; unrun. |
| A-08 | Visibility | Internal notes are visually distinct, excluded from model input by default, and prohibited from unauthorized disclosure; public-repository writes fail server-side. | Not implemented; unrun. |
| A-09 | Webhook verification | Valid raw-body signatures durably enqueue once; invalid, stale, oversized and replayed requests create no new work; retain signature and database assertions. | Not implemented; unrun. |
| A-10 | Durable sync | Pagination, transactional cursor progress, rate limits, worker restart and repeated events avoid lost/duplicated tickets and comments; retain fixture-server and recovery tests. | Not implemented; unrun. |
| A-11 | Authentication | Anonymous users cannot read real tickets, change settings, approve actions or invoke writes; roles, CSRF, bootstrap and loopback-only synthetic bypass are verified. | Not implemented; unrun. |
| A-12 | Approval integrity | Payload edits, unauthorized reviewers, mode changes, expiry and stale ticket/decision versions prevent execution; retain direct API and worker negatives. | Not implemented; unrun. |
| A-13 | Dry-run isolation | Dry runs persist intended changes and a clearly simulated receipt while invoking no provider write methods, even with credentials present. | Not implemented; unrun. |
| A-14 | Safe remote execution | Duplicate clicks/retries do not repeat mutations; uncertain outcomes enter reconciliation before any retry; retain durable action-state and adapter-call evidence. | Not implemented; unrun. |
| A-15 | Partial failure | Created remote issue identity remains recorded after a later Zendesk backlink failure; only the missing step may be retried or reviewed. | Not implemented; unrun. |
| A-16 | Evaluation integrity | Evaluator-only labels and future data never enter model/retrieval context; frozen saved predictions/settings drive metrics with documented denominators. | Not implemented; unrun. |
| A-17 | Honest presentation | Synthetic values, unavailable usage/latency/cost, incomplete/failed sync and untested live paths are explicitly labelled; visible counts derive from persisted records. | Not implemented; unrun. |
| A-18 | Browser quality | All main routes and primary interactions work without console errors, broken controls, unwanted overflow or inaccessible primary actions; retain desktop/narrow browser traces and screenshots. | Not implemented; unrun. |

## Additional cross-cutting evidence

The named gates do not reduce the complete specification. The final contract must also cover: worker/health behavior; all required migrations and uniqueness/transaction constraints; 100-ticket/20-issue/six-route/12-organization seed; controlled replay and reset; operator privacy acknowledgement and deletion/retention; Keychain fake-canary redaction; absence of Claude/Codex build credentials from the product, browser bundles, logs, traces and evidence; Jev/GitHub/Zendesk adapter schemas, permissions, pagination and rate limits; configurable rubric/threshold versions; keyword baseline and correct evaluation denominators; source timestamps and lossless external IDs; and documented reproducible scripts/configuration.

Paid development workers, optional provider smoke tests and later Jev evaluation are separate measurements. A Keychain metadata lookup, ACP handshake, API contract fixture or passing offline test is not proof of a successful provider model request. Live integration activation, application writes and build publication retain their separate approval gates.

## Genuine owner review and delivery

Owner review is **pending**. No approval event, usability verdict, signature, live activation or publication decision is recorded by this map. Automated checks and assistant-operated browser inspection cannot supply the owner's judgment.

After working software and machine evidence exist, present the real app through the selected review route for the owner to judge whether the queue is understandable, uncertainty is not misleading, internal/public content is visually distinct, action previews are clear enough to approve, and the application is useful. Record that actual review separately from software verification and model evaluation. Remote creation, push, pull request, visibility change or deployment requires its own genuine delivery decision; none is established by these branding tests.
