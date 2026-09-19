# ZenJev live activation and release verification

The owner supplied a Jev key and explicitly authorised completing verification and creating the separate GitHub repository. The publication target is **private `marcoakes/ZenJev`**. This does not authorise processing customer tickets, deploying the application, changing repository visibility, or writing through the ticket integrations.

## Verified live Jev access

On 19 September 2026, `node scripts/keychain-jev.mjs --allow-one-paid-request` completed successfully. The exact macOS Keychain item was service `typesafe-api-key`, account `zenjev`. The key was captured inside a trusted launcher and supplied only to its Jev child environment. The assistant, logs, browser, files and command arguments did not receive the key. The launcher never changed the item or its access controls.

The native adapter validated a response from requested/reported model `jev-1.13.0`: **653 ms provider-call latency, 664 ms total smoke duration, 747 input tokens and 193 output tokens**. The input was a fixed fictional billing question with six typed questions and no candidate issues. Exactly one request was allowed, with zero automatic retries and a 15-second deadline. No real customer data or external mutation was involved. This is connectivity and schema evidence, not a model accuracy benchmark or production approval.

[Recorded live result](../evidence/live/jev-smoke-20260919.json) includes the exercised source hashes and safe scalar metadata. [Nine offline Keychain/smoke tests](../evidence/live/keychain-tests.log) passed: exact item selection, environment isolation, secret redaction, cancelled/malformed lookups, bounded subprocess output/time, unsafe-mode refusal and one-request/no-retry behavior.

## Verification candidate

The candidate adds Linux CI using the unchanged pinned Wringer harness, native PostgreSQL 17 services, the full application gates, and Chromium/Axe. CI results and the published repository receipt will be recorded here after execution. The earlier macOS run and its browser-launch failure remain documented in [the historical local test report](test-report.md); they are not erased or relabelled as passes.

The application continues to start in synthetic/mock/dry-run mode. A single live connectivity check does not silently enable paid background processing or change saved mock provenance.
