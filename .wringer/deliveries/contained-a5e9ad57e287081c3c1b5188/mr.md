# Report the held-out split apart from development in the evaluation lab

Journey: c4f6f03c-698c-40d2-88be-93d9fed70378
Delivery: contained-a5e9ad57e287081c3c1b5188
Candidate commit: 095c012bafb4842050b9d01e0a1940e9a392eec4
Tree: 8390c7b29a549ee33586e6725129d9dbe80e7329
Checks: 1; red-first receipts: 1; human answers: 0.



Usage: 2 sessions; 0 complete reports. Input tokens: unknown; output tokens: unknown; cost: unknown.

From the ROOT of a fresh clone of the delivered review branch, run exactly:

```sh
wringer-drive audit --bundle .wringer/deliveries/contained-a5e9ad57e287081c3c1b5188
```

Then challenge the committed source range from that same clone root:

```sh
wringer-drive falsify --bundle .wringer/deliveries/contained-a5e9ad57e287081c3c1b5188
```

This delivery ran trusted-local, on the operator's computer with nothing contained, so this command refuses it: falsification needs an isolated verifier the candidate cannot reach. No mutation result exists or is claimed.

The bundle includes candidate.bundle, plan.json, authority.json, environment.json, manifest.json, projection.json, view.json, certificate.json, board.html, summary.md, mr.md, digests.json, and every journal/, roles/, receipts/ and human/ file named by the digest inventory. When manifest.sourceReview is non-null, source-inspection.json also carries every exact source exception and operator decision. An accepted example is not a secret-free claim. The audit is offline; no original controller directory or provider account is required.

Ran on this computer under the operator's account; nothing was contained.

This is a tamper-evident record of controller observations, not a fresh execution of acceptance checks or proof against a malicious controller.

ACP prompts, worker narrative, thought streams and private provider traces are omitted. The source journal was validated before a separately hashed portable semantic projection was made; source digest commitments are provenance, not a claim that omitted bytes can be replayed here.

No isolation was established: roles and checks ran as ordinary processes under the operator's account, so no platform isolation gate applies to this delivery.

The candidate bundle carries exact committed Git history. An evidence commit contains this bundle; its own hash is returned by publication, not self-embedded in its contents.

Falsification is not available for this delivery: it needs an isolated verifier, and nothing was contained.

Source credential-shape exceptions: 2 exact reviewed matches; source-inspection.json SHA256 08be89bc8c075b3c18507174f36c2a86eb3932e2fe417b5c1f95a5590eee2917. This is not a secret-free claim. Actor identity is asserted, not authenticated.

Exact credential-shaped matches were accepted as non-secret examples by the named operator or delegated agent. This is an exception record, NOT a secret-free certificate.

Configured controller secret values and their fragments were non-overridable at delivery. Offline audit has no access to those private values and cannot repeat that check or prove that an unknown credential is harmless.

Review identity and reasons are operator assertions in cooperative-local state, not authenticated human judgements. A same-account process can exercise that operator authority; no MCP approval tool is provided.

Playbook use is a controller-recorded request, not proof of model understanding or measured improvement. Guidance is not injected into judge instructions, but tracked repository bytes remain readable.

Repair excerpts are reconstructed from carried redacted outputs. The original observation digest is an opaque controller commitment: host-specific runtime provenance is projected for portability, not reconstructed byte for byte.

Any carried adoption receipt records a future-selection decision and evidence revision, not a rerun of its private comparative trials or proof of live benefit.

Command-red means the command failed before implementation. Assertion-red additionally binds executed protected-runner assertions; neither proves requirement completeness.

Loop decisions are deterministic observations under one approved policy. Repeated outcomes are not a quality score.

Usage is reported by agent adapters. Missing token counts and unmeasured monetary cost remain unknown; this is not a billing statement.

## Approach and measured feedback

No additional worker playbook was selected.

- evaluation-splits: Command failed before implementation and passed on the candidate; assertion-level evidence was not declared.

- Observation 1 (checks, continue): This observation does not require a repair; readiness still depends on all remaining checks and human decisions.

engineering.json carries the selected playbook bytes (when present), worker-use identities, and deterministic loop decisions. Receipt SHA256: 7245e63abb23252a5074c21a06d25d9583642860bc4dad9a2e684f5a6de9e4b1. Playbook use is not evidence of efficacy or model understanding. These records do not create authority or authenticate a human.
