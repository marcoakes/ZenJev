# ZenJev

![ZenJev: a meditating ninja in pink, black and cream, with retro support-workflow panels.](public/branding/zenjev-hero.png)

**Less noise. Smarter support.**

A working Zendesk-to-GitHub support workbench: inspect evidence and uncertainty, associate reports with existing issues, approve exact handoff previews, and inspect durable receipts. Includes 100 synthetic tickets, 20 issues, 12 fictional organisations, a separate worker and a saved-prediction evaluation lab.

## Start the offline demo

Requires Node.js **24**, npm and a modern browser. Installation downloads pinned dependencies; the running demo needs no Jev, Zendesk, GitHub or model credentials.

```sh
npm ci --ignore-scripts
npm run setup
npm run demo:portable
```

Open **http://127.0.0.1:3000/tickets**. Startup migrates and idempotently seeds the database. Keep the terminal running; Ctrl+C stops only processes it owns. Persistent data is in ignored `.local/`. Existing data is preserved; use the app's explicitly confirmed synthetic reset for a repeatable walkthrough.

`demo:portable` explicitly uses persistent PGlite PostgreSQL/WASM on loopback ports 55432 (demo) and 55433 (isolated tests). It works in this coding sandbox, whose OS policy blocks native PostgreSQL shared memory. It is a development option with multiplexed sessions, **not native PostgreSQL concurrency evidence**. Do not expose its unauthenticated loopback database to a network.

For native PostgreSQL 17, use `npm run demo` after setup. It uses pinned project-local binaries, or an existing PostgreSQL at port 55432 with the documented demo credentials. Alternatively run `docker compose up -d db` first. Native test setup needs `ZENJEV_TEST_DATABASE_URL=postgresql://demo:demo@127.0.0.1:55432/zenjev_test`. Neither native nor Compose execution was successfully verified in this sandbox.

For a production-mode local preview, stop the development server, run `npm run build`, then `npm run demo:portable:production`. This remains a synthetic local preview, not a production deployment.

## Use it

The [demo script](docs/demo-script.md) walks through three reports matching one issue, ambiguity/abstention, precise previews, invalidated approvals, dry-run receipts and saved-prediction threshold simulation. All six screens are implemented: tickets, detail, engineering, evaluation, settings and audit. The full supplied poster appears in About; the pink/black/cream workbench keeps ticket evidence primary.

Defaults are **Synthetic data / Mock decisions / Dry run only**. Every external mutation requires explicit live configuration, real ticket and Jev provenance, current reviewer authorisation, an allowlisted destination and a current exact approval. The ordinary demo strips inherited provider/build keys. Live Jev failures remain failures; they never become mock successes.

## Verify

Start the app, then in another terminal:

```sh
npm run db:test:prepare
npm run check:fresh-setup
npm run check:branding
npm run lint
npm run typecheck
npm test
npm run test:browser
```

If Chromium is not already installed, `npx playwright install chromium` downloads the pinned browser runtime (setup traffic only). Tests use the isolated `zenjev_test` database; the browser suite explicitly resets the synthetic demo. Never point test configuration at live data. Stop dev before production build to avoid concurrent Next output generation.

Standalone harness verification uses the separately reviewed [marcoakes/wringer](https://github.com/marcoakes/wringer) checkout:

```sh
WRINGER_BINARY=/absolute/path/to/wringer/dist/wring npm run verify:wringer
```

The gates are in `.wringer.yaml`; the app and databases must already be running. This is **trusted_local** verification, not contained execution or a fabricated human approval. See [actual test report](docs/test-report.md), [requirement evidence](docs/requirement-evidence.md), and [build status](docs/build-status.md) for outcomes and limits.

`node scripts/check-handoff.mjs` audits the delivered source/evidence hashes and result structure offline. It does not rerun the application checks or grant acceptance. Headless Chromium could not launch under this host's macOS sandbox; the required browser gate remains failed and separate executed in-app browser observations are retained.

## Integration and operations

Jev, GitHub and Zendesk HTTP adapters are implemented and fixture-tested. **The real Jev connectivity/schema smoke passed** on synthetic input (one request, zero retries). Zendesk and the application GitHub adapter remain fixture-tested; no external ticket/issue write was exercised. See [live activation and release verification](docs/release-verification.md). Read [integrations](docs/integrations.md), [Jev activation](docs/jev-activation.md), [credential observations](docs/credentials.md) and `.env.example` before configuring real data. Build-worker keys never belong in the product environment.

`npm run admin:bootstrap -- USERNAME` reads a password from stdin or the explicitly provided environment variable; it never prints it or accepts it as a command argument. `npm run retention -- --source=synthetic --before=2001-01-01T00:00:00Z` reports counts only; add `--apply` to delete eligible records after review. Outstanding/uncertain actions block deletion and immutable audit remains.

This is the separate **ZenJev** repository. Its authorised private publication target is `marcoakes/ZenJev`; current publication and CI evidence are recorded in [release verification](docs/release-verification.md). No production deployment is included. [Decisions](docs/decisions.md) records the delegated-agent review route, runtime deviations and remaining live/native verification. The original [master build specification](ASTRA_MASTER_BUILD.md) is preserved unchanged.
