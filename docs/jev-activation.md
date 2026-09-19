# Jev activation

Jev access remains pending. The shipped offline workflow is deterministic mock software, not measured Jev performance. The real adapter is contract-tested against intercepted HTTP and uses the same normalized decisions as the UI and worker. Live provider access has not been verified.

## One explicit synthetic request

Keep the key in trusted server/worker runtime configuration, using the approved Keychain/secret route. Do not write it to this repository or the browser. The smoke script reads `TYPESAFE_API_KEY` from its process environment and never prints it. Merely supplying a key does not activate the script.

After access is available, explicitly opt in to this one potentially chargeable synthetic request:

```bash
DATA_MODE=demo JEV_MODE=live ALLOW_LIVE_WRITES=false ALLOW_LIVE_DATA_PROCESSING=false \
  npm run smoke:jev -- --allow-one-paid-request
```

This command assumes `TYPESAFE_API_KEY` was securely supplied to that trusted process beforehand; it deliberately contains no key value. Do not run the normal demo launcher to activate Jev: that launcher creates a credential-free mock runtime.

`scripts/jev-smoke.ts` sends one fixed synthetic invoice question to the native endpoint, with six bounded typed questions, a 15-second deadline and **zero retries**. Its empty candidate set prevents a second match call. The native API does not document an output-token-limit parameter; the script does not invent one. The finite request/deadline is not a guaranteed financial cap.

The script refuses missing opt-in, missing key, real data, live write controls or live-data processing. On success it reports requested and provider-reported model, measured request duration, normalized validated field names and provider-reported input/output usage. Missing model/usage stays unknown. On failure it reports a sanitized error and exits nonzero; no mock fallback occurs.

The default requested model is `jev-1.13.0`, verified in the [official model reference](https://docs.typesafe.ai/models) on 19 September 2026. `JEV_MODEL` can select a reviewed supported model without changing application business logic. The [native API](https://docs.typesafe.ai/api) uses Choice, Score and Noul fields; pinned-contract failures require an adapter/test review, not a silently changed provider.

## Enable a synthetic Jev workspace later

After a successful one-request smoke, start the web process and worker using a reviewed trusted launcher that passes only the Jev runtime key and explicit `DATA_MODE=demo`, `JEV_MODE=live`, `ALLOW_LIVE_WRITES=false`, `ALLOW_LIVE_DATA_PROCESSING=false`. The settings loader synchronizes persisted data/model modes to the explicit server environment and invalidates existing approvals; verify this change and verify the persistent **synthetic data / Jev / dry run** badges. Existing mock decisions retain their original provenance.

Evaluation and ticket processing are explicit actions and can make more than one Jev call when candidates are present. Select a bounded dataset and allowance before running live evaluations. Threshold simulation over saved predictions makes zero provider calls.

## Real data and writes are separate activations

A successful synthetic Jev request does not authorise customer-data processing or any external change. Real-data activation additionally needs authenticated sessions, a reviewed OAuth account and GitHub allowlist, privacy review, minimum required fields, explicit external-processing acknowledgement and `ALLOW_LIVE_DATA_PROCESSING=true` in both server configuration and workspace policy.

External writes remain impossible for synthetic tickets. For real Zendesk tickets, live writes additionally require `ALLOW_LIVE_WRITES=true`, live Jev provenance, an authorised authenticated reviewer, a current exact-payload approval, a fresh ticket snapshot and an allowed private destination. Changing a preview, ticket, decision or mode invalidates approval. Public GitHub writes are prohibited. Issue creation and Zendesk backlinking are separate tracked actions; uncertain outcomes require reconciliation before any retry.

Record the actual first response and usage in the test report after activation. Do not replace the current “live unverified” status with a success based on configuration alone.
