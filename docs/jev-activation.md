# Jev activation

One live synthetic Jev smoke succeeded on 19 September 2026 using the dedicated macOS Keychain item, service `typesafe-api-key`, account `zenjev`. The [retained result](../evidence/live/jev-smoke-20260919.json) records one request, zero retries, requested and reported model `jev-1.13.0`, 653 ms provider latency, 664 ms total duration, and reported usage of 747 input / 193 output tokens. Keychain access and authentication worked for this request; no key value was recorded.

This verifies the native adapter's first synthetic request, not matching, a broader evaluation, customer-data processing, production accuracy or external writes. The default offline workflow remains deterministic mock software. No Zendesk or application GitHub integration result follows from the Jev smoke.

## One explicit synthetic request

The product-specific launcher reads only service `typesafe-api-key`, account `zenjev`. It captures the key inside the trusted process and passes it to the smoke child through `TYPESAFE_API_KEY` in an otherwise clean environment. No credential is written to a file, command argument, terminal or browser. Merely storing a key does not activate a request. The launcher does not update the Keychain item or change its access controls; macOS access prompts belong to the owner.

Explicitly opt in to one potentially chargeable synthetic request:

```bash
node scripts/keychain-jev.mjs --allow-one-paid-request
```

The command selects the exact Keychain item internally and pins `jev-1.13.0`. It sets `DATA_MODE=demo`, `JEV_MODE=live`, `ALLOW_LIVE_WRITES=false` and `ALLOW_LIVE_DATA_PROCESSING=false` for the child. No build-provider or other integration credentials are inherited. Lookup failure, cancellation and malformed values fail closed before a provider request. Do not run the normal demo launcher to activate Jev: that launcher creates a credential-free mock runtime.

`scripts/jev-smoke.ts` sends one fixed synthetic invoice question to the native endpoint, with six bounded typed questions, a 15-second deadline and **zero retries**. Its empty candidate set prevents a second match call. The native API does not document an output-token-limit parameter; the script does not invent one. The finite request/deadline is not a guaranteed financial cap.

The script refuses missing opt-in, missing key, real data, live write controls or live-data processing. On success it reports bounded model identifiers, measured request duration and provider-reported input/output usage. Missing or rejected model/usage metadata stays unknown. Only fixed fields and bounded scalar values reach output; a reflected key, arbitrary response fields, raw errors and subprocess stderr are suppressed. On failure it reports an error category and exits nonzero; no mock fallback occurs. The wrapper also bounds lookup/child lifetime and captured output. Each invocation consumes its one-request allowance even if the outcome fails or times out; do not retry automatically.

[Keychain smoke tests](../tests/keychain-jev.test.ts) use fake keys and stubbed process lookup, plus intercepted provider HTTP. They verify the exact service/account, no secret in arguments or output, unrelated credential stripping, cancellation/lookup failures, reflected-model redaction, bounded child output/deadlines and one-request/no-retry behavior. These tests never access the real Keychain or a live provider.

The default requested model is `jev-1.13.0`, verified in the [official model reference](https://docs.typesafe.ai/models) on 19 September 2026. The underlying `scripts/jev-smoke.ts` still supports an already securely injected process environment and a bounded `JEV_MODEL` identifier; the Keychain launcher deliberately pins the reviewed first-smoke model. The [native API](https://docs.typesafe.ai/api) uses Choice, Score and Noul fields; pinned-contract failures require an adapter/test review, not a silently changed provider.

## Enable a synthetic Jev workspace later

After a successful one-request smoke, start the web process and worker using a reviewed trusted launcher that passes only the Jev runtime key and explicit `DATA_MODE=demo`, `JEV_MODE=live`, `ALLOW_LIVE_WRITES=false`, `ALLOW_LIVE_DATA_PROCESSING=false`. The settings loader synchronizes persisted data/model modes to the explicit server environment and invalidates existing approvals; verify this change and verify the persistent **synthetic data / Jev / dry run** badges. Existing mock decisions retain their original provenance.

Evaluation and ticket processing are explicit actions and can make more than one Jev call when candidates are present. Select a bounded dataset and allowance before running live evaluations. Threshold simulation over saved predictions makes zero provider calls.

## Real data and writes are separate activations

A successful synthetic Jev request does not authorise customer-data processing or any external change. Real-data activation additionally needs authenticated sessions, a reviewed OAuth account and GitHub allowlist, privacy review, minimum required fields, explicit external-processing acknowledgement and `ALLOW_LIVE_DATA_PROCESSING=true` in both server configuration and workspace policy.

External writes remain impossible for synthetic tickets. For real Zendesk tickets, live writes additionally require `ALLOW_LIVE_WRITES=true`, live Jev provenance, an authorised authenticated reviewer, a current exact-payload approval, a fresh ticket snapshot and an allowed private destination. Changing a preview, ticket, decision or mode invalidates approval. Public GitHub writes are prohibited. Issue creation and Zendesk backlinking are separate tracked actions; uncertain outcomes require reconciliation before any retry.

Preserve the first live response metadata and usage as historical evidence. Record any separately authorised later request independently; configuration alone does not extend the scope of verified behavior.
