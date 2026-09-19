# Preflight test evidence — 19 September 2026

Checked source: `a482a6ecca2b07b84bd08561a561f5800ea66bed` (clean source tree at execution).

Actual command, in the ZenJev repository:

```sh
env -i PATH="$PATH" node --test --test-reporter=tap checks/branding.test.mjs
```

Exit status: **0**. Four tests passed; zero failed, skipped or cancelled. Actual TAP output is retained in [branding-test.tap](branding-test.tap). The command used a credential-free environment containing only PATH.

The tests verify the exact PNG hash, signature, dimensions and decompression; README relative asset link and alt text; product/package identity; tracked PNG and absence of a Git content filter. Direct `cmp` also confirmed both the brief and image match the supplied attachment bytes.

These are source/asset checks only. Application startup, UI, database, durable worker, functional/security/provider contracts, browser tests, live integration tests and all SW acceptance behavior remain **not run / not implemented**. No screenshots of a working application exist yet.

Apple Container preflight failed with `Operation not permitted`. Wringer's standalone proposal parser validation passed, but its product gates have not run and the alternative route is awaiting owner selection. No contained build or software acceptance is claimed.
