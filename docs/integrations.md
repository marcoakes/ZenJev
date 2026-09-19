# Integrations

The offline application uses synthetic tickets and issues plus a deterministic mock decision provider. Real adapters are implemented and ordinary verification tests intercept HTTP. Separate bounded live checks succeeded for one synthetic Jev request and one GitHub repository metadata GET; [release verification](release-verification.md) records their exact scope. No real issue/ticket was read or mutated. A configured credential is shown as **configured, unverified** until a connection has actually been checked; the saved smoke evidence does not automatically change workspace configuration.

## Credential and activation boundary

Credentials stay in trusted server/worker process configuration. Reuse the existing approved Keychain/helper route described in [credentials.md](credentials.md); do not paste credentials into chat, browser forms, shell arguments or repository files. `.env.example` contains placeholders only. Never use `NEXT_PUBLIC_*` for secrets. Offline launch/check scripts construct a credential-free child environment; fake canary tests verify that build-agent and integration keys are absent.

`DATA_MODE`, `JEV_MODE`, `ALLOW_LIVE_DATA_PROCESSING` and `ALLOW_LIVE_WRITES` are separate controls. Synthetic data cannot produce a live write even if credentials are present and flags are enabled. Real tickets require live Jev and an explicit acknowledgement/enablement of external processing. Production/non-loopback access requires authenticated sessions; approvals and settings require the appropriate role and CSRF protection. Live startup rejects the demonstration database shortcuts. Bootstrap the first administrator using the documented `npm run admin:bootstrap -- <username>` command and a password supplied through private stdin or protected `ZENJEV_ADMIN_PASSWORD`; there is no shared default password.

Changing a credential or opening a page never starts a model evaluation or write. Queue/import actions and new evaluation runs are explicit. Real model failures persist as failures; the adapter never falls back to mock or a build provider.

## Jev

The server uses native `POST https://api.typesafe.ai/v1/systemone` with a bearer token, `model`, structured `state`, and typed `questions`. The configured default is `jev-1.13.0`, confirmed in the [official model reference](https://docs.typesafe.ai/models) on 19 September 2026. The [native API contract](https://docs.typesafe.ai/api) was rechecked; this is not an OpenAI chat-completions client.

Settings provide reviewed team descriptions for all six fixed destinations and configurable, unvalidated routing/engineering/missing-information/multiple-issue/match/margin cutoffs. Every decision freezes the resolved cutoffs; policy edits invalidate approvals. Deterministic mock rules remain explicitly synthetic and are not retrained by editing descriptions. Threshold simulation operates on saved predictions without a provider call.

Six independent triage questions cover destination, category, impact, engineering, missing information and multiple problems. A second request evaluates at most ten stored candidates with independent Noul questions. Choice/Score distributions, answer types, option sets, Score legend and finite numeric ranges are validated; distribution sum tolerance is 0.005. Malformed triage fails before candidate requests. Model outputs cannot invent a repository or issue ID.

Reported model and token counts remain null when unavailable. Mock probabilities are simulated; mock provider latency and model spend are unavailable, not zero. Input-cost estimates, where used, are model-only at a configurable dated rate; the verified native reference states $0.042/million input tokens and free output tokens. Confidence is derived from the distribution and is not a correctness guarantee. The first live activation procedure is in [jev-activation.md](jev-activation.md).

## GitHub

Configure a fine-grained server-side token restricted to the repository allowlist. Issue indexing needs **Issues: read** and repository metadata access; issue creation additionally needs **Issues: write**. No source code, commits, Actions configuration or repository creation is requested. The direct [REST Issues API](https://docs.github.com/en/rest/issues/issues) currently documents `X-GitHub-Api-Version: 2026-03-10`; `GITHUB_API_VERSION` may override the version after reviewing the contract.

The adapter lists allowlisted repositories only, fetches visibility metadata, follows bounded numeric pagination, excludes pull requests from issue listings, and reports incomplete pagination as an error. It never follows arbitrary URLs from tickets, webhook payloads or pagination headers. Deterministic title/body/label relevance returns at most ten candidates. Historical evaluation excludes issues created or updated after its decision timestamp because this MVP does not reconstruct old issue revisions.

For an approved new issue, the worker rechecks the authoritative ticket and the adapter refetches repository visibility immediately before POST. Public-repository writes are prohibited. The exact title/body/repository preview, ticket snapshot/version, decision and mode are included in approval identity. An uncertain result is reconciled by a non-sensitive action marker; creation is not automatically retried. Issue creation and a subsequent Zendesk backlink are separate approved actions. Their receipts are retained separately, so a failed backlink does not discard or recreate the issue.

## Zendesk OAuth and ingestion

The [official client-credentials flow](https://developer.zendesk.com/documentation/authentication/oauth-migration/) uses the organisation's confidential OAuth client with `POST https://<subdomain>.zendesk.com/oauth/tokens`. The adapter requests an explicit scope string, caches the access token in memory until shortly before expiry, then obtains a new token. It does not invent a refresh token. A dedicated service account should own this client because Zendesk attributes operations to its owner.

Configuration: `ZENDESK_SUBDOMAIN`, `ZENDESK_OAUTH_CLIENT_ID`, `ZENDESK_OAUTH_CLIENT_SECRET` and `ZENDESK_OAUTH_SCOPES`. Scope configuration has no broad automatic fallback. The resource-specific `tickets:read` example in OAuth documentation is insufficient evidence for the export endpoint: Zendesk's [employee clarification](https://community.zendesk.com/platform-and-developer-18/oauth-with-specific-scopes-not-work-9364) states that incremental export needs global **read**. Configure **read** for this adapter's shadow ingestion, with an admin-authorised service user for exports; add **tickets:write** only for separately activated ticket mutations. Live account permissions remain unverified and a 401/403 fails explicitly. No groups-listing endpoint is called: the operator supplies reviewed team-to-group mappings.

Implemented reads are:

- `GET /api/v2/incremental/tickets/cursor.json`: resumable pages. Follow-on jobs and cursor advance commit together; a durable per-account rate gate reserves requests at least 6.1 seconds apart across workers, and next-page jobs honor that gate. Export retries occur through durable jobs, preserving provider Retry-After deadlines. The [export reference](https://developer.zendesk.com/api-reference/ticketing/ticket-management/incremental_exports/) specifies ten requests/minute and excludes the newest minute.
- `GET /api/v2/tickets/<id>.json`: authoritative state before ingestion or execution.
- `GET /api/v2/tickets/<id>/comments.json`: bounded cursor pagination, chronological comments, public/internal visibility, authoritative author identity/category when sideloaded, and attachment counts. The [comments reference](https://developer.zendesk.com/api-reference/ticketing/tickets/ticket_comments/) supports cursor pagination. Attachments and their URLs are never fetched.

The adapter preserves external integer identifiers as strings before JavaScript can round them. Ingestion and model snapshots redact supplied author names, emails and detected credentials, using stable local aliases. Automated redaction is imperfect, particularly when names are absent from authoritative metadata. Internal notes are excluded from model context by default and remain excluded from engineering drafts. A marker in a customer message cannot suppress that evidence; receipt-only suppression requires a known successful app action, an internal note and the configured `ZENDESK_INTEGRATION_AUTHOR_ID`.

Allowed writes use `PUT /api/v2/tickets/<id>.json`: reviewed group change, app-specific `zenjev_` tag additions and internal integration notes only. The adapter preserves unrelated tags/fields and uses `safe_update` plus the approved `updated_stamp`, following [safe update guidance](https://developer.zendesk.com/documentation/ticketing/managing-tickets/creating-and-updating-tickets/). Conflicts return to review; uncertain note writes require marker reconciliation. Arbitrary public comments and ticket closure are not permitted.

## Webhooks

Configure a Zendesk trigger to send this minimal JSON body to `/api/webhooks/zendesk`:

```json
{"account":"your-configured-subdomain","ticket_id":"{{ticket.id}}"}
```

Keep the ticket ID quoted. Configure the signing secret as `ZENDESK_WEBHOOK_SECRET`; never publish it. The app follows [Zendesk signature verification](https://developer.zendesk.com/documentation/webhooks/verifying/): HMAC-SHA256 over the timestamp followed by the exact raw body, with a base64 digest and timing-safe comparison. Headers are `X-Zendesk-Webhook-Signature` and `X-Zendesk-Webhook-Signature-Timestamp`.

The endpoint enforces a 64 KiB streaming limit, five-minute clock skew, configured account, numeric ticket identity and no unexpected fields/URLs. It acknowledges only after a receipt and durable job commit. Duplicate deliveries do not enqueue duplicate work. The worker fetches authoritative content; a signed body cannot supply an arbitrary fetch URL. Periodic reconciliation repairs missed notifications. Imports create pending review and do not automatically spend on Jev.

## Read-only smoke and remaining limits

Run ordinary integration tests offline with `npm test`; remote requests are intercepted. They include OAuth, pagination, malformed answers, allowlist rejection, public-write blocking, stale updates, webhook deduplication, cursor recovery and uncertain-write handling. A PGlite pass verifies the application against the portable local PostgreSQL protocol runtime; it does not establish native PostgreSQL multi-process concurrency.

The operator command below requires the exact target, `--allow-live-read`, `DATA_MODE=live`, `ALLOW_LIVE_WRITES=false`, and `ALLOW_LIVE_DATA_PROCESSING=false`. Credentials must already be injected into the trusted process environment using the approved route; never put their values in command arguments. These commands do not start the app, read its database, import tickets, fetch comments/attachments, run an export, or call Jev.

For GitHub, set `GITHUB_TOKEN` privately and `GITHUB_REPOSITORIES` to the reviewed comma-separated allowlist. Replace the placeholder with a member of that allowlist:

```sh
DATA_MODE=live ALLOW_LIVE_WRITES=false ALLOW_LIVE_DATA_PROCESSING=false \
  npx --no-install tsx scripts/integration-smoke.ts --provider=github --repository=OWNER/REPO --allow-live-read
```

This performs one repository metadata GET. It confirms authentication/visibility metadata for that target, not issue-read or write permission.

The actual [19 September smoke](../evidence/live/github-smoke-20260919-active-helper.json) succeeded for `marcoakes/ZenJev`, returning `repositoryPrivate: true` after exactly one GET, with a 15-second deadline and zero retries. The existing active-account helper was captured privately and supplied only to the clean child environment; the credential was never printed, persisted or put in arguments. No issue retrieval, customer-data processing, model call or mutation occurred. The [earlier explicit-user lookup failure](../evidence/live/github-smoke-20260919.json) remains unchanged as historical evidence; using the active helper required no source, scope or authentication change.

For Zendesk, inject `ZENDESK_SUBDOMAIN`, `ZENDESK_OAUTH_CLIENT_ID`, `ZENDESK_OAUTH_CLIENT_SECRET`, and `ZENDESK_OAUTH_SCOPES` privately. The smoke accepts only `read` and/or `tickets:read` scopes; write scopes are rejected before HTTP. Replace `123` with an explicitly reviewed ticket:

```sh
DATA_MODE=live ALLOW_LIVE_WRITES=false ALLOW_LIVE_DATA_PROCESSING=false \
  npx --no-install tsx scripts/integration-smoke.ts --provider=zendesk --ticket=123 --allow-live-read
```

This performs at most one OAuth token-acquisition POST and one ticket GET; token issuance is the only permitted POST. Each request has a 15-second deadline and zero retries. Output contains fixed status/provider fields, request and record counts, zero model/mutation counts, and GitHub privacy metadata where applicable. It excludes ticket text, target/account identifiers, tokens and exception/response bodies. A failed check exits nonzero with an error category and HTTP status only.

Offline tests in [integration-smoke.test.ts](../tests/integration-smoke.test.ts) intercept HTTP and assert fail-closed flags/targets/scopes, exact bounded request sequences, no retries and canary-free output. The separate live Jev and GitHub metadata checks provide only their recorded connectivity/schema/visibility evidence. GitHub issue retrieval/ingestion and writes, Zendesk OAuth/ingestion/webhooks, all customer-data workflows and production readiness remain unverified.
