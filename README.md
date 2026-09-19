# ZenJev

![ZenJev: a meditating ninja in pink, black and cream, with retro support-workflow panels.](public/branding/zenjev-hero.png)

**Less noise. Smarter support.**

A Zendesk-to-issue-tracker support workbench, supporting GitHub and GitLab, for inspecting evidence, reviewing uncertain decisions, associating related reports and approving exact handoff previews. Includes 100 synthetic tickets, 20 issues, 12 fictional organisations, a durable worker and a saved-prediction evaluation lab.

The separate repository is published privately at [marcoakes/ZenJev](https://github.com/marcoakes/ZenJev). No hosted deployment is included. The supplied artwork and its relative README link are unchanged.

## Verification status

The final [Linux CI run 35462754472](https://github.com/marcoakes/ZenJev/actions/runs/35462754472) **passed all ten Wringer gates and 109 counted cases** on source `8ea4f2730365b180214c221ad5325c97e6e6a7bf`, including native PostgreSQL 17 concurrency/recovery, production browser journeys, authenticated login/logout and role checks, and Axe checks across six routes. One live Jev request also succeeded on fixed synthetic input. A separate application GitHub metadata read also succeeded. Zendesk, GitHub issue retrieval/ingestion and all external writes remain unverified.

The final run verifies the repaired authentication/navigation flow. The earlier green baseline and two intervening failed authentication attempts remain recorded in the [test report](docs/test-report.md) and [release verification](docs/release-verification.md).

## Start the offline demo

Requires Node.js **24**, npm and a modern browser. Installation downloads pinned dependencies; the running demo needs no provider credentials.

```sh
npm ci --ignore-scripts
npm run setup
npm run demo:portable
```

Open **http://127.0.0.1:3000/tickets**. Startup migrates and idempotently seeds the database. Keep the terminal running; Ctrl+C stops only owned processes. Persistent development data lives in ignored `.local/`. Use the app's explicitly confirmed synthetic reset for a repeatable walkthrough.

The portable option uses persistent PGlite PostgreSQL/WASM on loopback ports 55432 (demo) and 55433 (tests). For native PostgreSQL use `npm run demo` on a supported host after setup, or the reviewed native services in CI. Native multi-process tests require a separate PostgreSQL 17 `zenjev_test` service on loopback port 55433. PGlite is not a substitute for that concurrency gate.

For a production-mode local preview, stop the development server, run `npm run build`, then `npm run demo:portable:production`. This remains a synthetic local preview.

**Current Mac preview is running** at http://127.0.0.1:3000 from the final tested source in `/private/tmp/zenjev-runtime-iy3rBO/app`. This is a new isolated synthetic database: health checks report a connected database and healthy worker, with all 13 seed jobs complete. The original offloaded Documents installation and database remain preserved and unrecovered; prior actions, associations and history were not migrated. [Runtime provenance](evidence/local-runtime/provenance.json) records this distinction. The preview data is under `/private/tmp` and can be removed by operating-system temporary-file cleanup; the repository and evidence remain in the delivered workspace.

## Use it

The [demo script](docs/demo-script.md) walks through three reports matching one issue, abstention, exact previews, invalidated approvals, dry-run receipts and threshold simulation. All six screens are implemented: tickets, detail, engineering, evaluation, settings and audit. The full square poster appears in About; the pink, black and cream workbench keeps evidence readable.

Defaults are **Synthetic data / Mock decisions / Dry run only**. Synthetic data cannot produce an external write. Real ticket mutations require enabled server controls, real Jev provenance, an authenticated reviewer, an allowlisted destination and a current exact approval. Live provider failures remain explicit failures; there is no mock fallback. Ordinary demo and verification launchers strip inherited credentials.

## Verify

With the portable demo running, use another terminal:

```sh
npm run db:test:prepare
npm run check:fresh-setup
npm run check:branding
npm run lint
npm run typecheck
npm test
npm run test:browser -- tests/browser/workbench.spec.ts
```

If needed, `npx --no-install playwright install chromium` downloads the pinned browser. Browser tests reset only synthetic demo state. Native concurrency and authenticated-browser checks have additional dedicated service prerequisites; the complete reproducible setup is in [the CI workflow](.github/workflows/verify.yml) and [CI launcher](scripts/ci-verify.mjs). Never point test configuration at live data.

The unchanged [Wringer harness](https://github.com/marcoakes/wringer) is pinned at `7ca2fb58e4270ba70fc6f6fdf4a39e30d70d9cb4`. With its reviewed binary and all declared service prerequisites available:

```sh
WRINGER_BINARY=/absolute/path/to/wringer/dist/wring npm run verify:wringer
```

This runs declared trusted-local commands. It does not manufacture owner approval. [Requirement evidence](docs/requirement-evidence.md) maps each check to its limits; [delegated review](docs/delegated-review.md) records the agent's actual usability judgment. Marc's personal verdict remains null.

## Integrations and operations

The live Jev smoke made one request with zero retries: requested/reported `jev-1.13.0`, 747 input tokens, 193 output tokens. It verifies connectivity and schema handling on synthetic input, not model accuracy or customer-data processing. [Activation instructions](docs/jev-activation.md) use a narrowly selected Keychain item without printing the key.

The [app GitHub smoke](evidence/live/github-smoke-20260919-active-helper.json) succeeded using the existing active-account helper: exactly one metadata GET confirmed `marcoakes/ZenJev` is private, with zero retries, model calls, issue reads or mutations. The earlier credential-lookup failure remains historical evidence. This verifies metadata access only; GitHub issue retrieval/ingestion, Zendesk OAuth/ingestion/webhooks and all external ticket/issue mutations remain unverified against live accounts. Read [integrations](docs/integrations.md), [credential observations](docs/credentials.md) and `.env.example` before activation.

GitLab is implemented beside GitHub and selected explicitly in Settings. Its offline contract,
cross-provider identity, approval and persistence coverage all pass; **no live GitLab check has
been run and no GitLab project, account or credential exists**, so GitLab connectivity, issue
retrieval, creation and linking are unverified. A [GitLab CI pipeline](.gitlab-ci.yml) mirrors the
GitHub workflow and was validated offline only; see [GitLab CI](docs/gitlab-ci.md) for exactly what
was and was not checked. Server-side configuration is `GITLAB_SERVER_URL`, `GITLAB_TOKEN`,
`GITLAB_PROJECTS`, optional `GITLAB_CREDENTIAL_REFERENCE` and `GITLAB_ALLOW_PRIVATE_NETWORK`; an
explicit connection check additionally requires `ALLOW_LIVE_CONNECTION_CHECK=true`.

`npm run admin:bootstrap -- USERNAME` reads a password from private stdin or protected environment configuration. `npm run retention -- --source=synthetic --before=2001-01-01T00:00:00Z` reports counts only; add `--apply` after reviewing the selection. Outstanding actions block deletion and immutable audit remains.

The original [master build specification](ASTRA_MASTER_BUILD.md) is preserved unchanged. Historical evidence remains available; later successful checks do not rewrite earlier failures.
