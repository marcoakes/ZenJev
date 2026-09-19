# Credential observations — 19 September 2026

Only the configured vendor entries and GitHub helper were inspected. No password value was returned to the assistant, copied to this repository, or embedded in product code/tests. The Jev key and GitHub credential were each captured in trusted process memory and supplied only to their respective bounded smoke child environments. Neither value was printed, persisted or passed in command arguments.

| Role | Source | Located/access | Authentication | Harmless test |
|---|---|---|---|---|
| Claude build worker | macOS Keychain `anthropic-api-key`, account `wringer` | Metadata present; password access untested | Untested | Wringer `setup --check-keychain`, exit-only metadata lookup |
| Codex build worker | macOS Keychain `openai-api-key`, account `wringer` | Metadata present; password access untested | Untested | Same Wringer diagnostic; declared `CODEX_API_KEY` route |
| GitHub repository publication | Existing `gh` authentication and configured `osxkeychain` Git helper | Existing helper usable | Verified identity `marcoakes` | Authenticated identity check; owner-authorised private repository creation/publication |
| GitHub application metadata | Existing `gh` active-account helper, captured only in trusted process memory | Accessible without changing scopes or credential stores | Verified metadata access to private `marcoakes/ZenJev` | Exactly one bounded repository metadata GET, zero retries/issue reads/model calls/mutations; [safe evidence](../evidence/live/github-smoke-20260919-active-helper.json) |
| Jev application | macOS Keychain `typesafe-api-key`, account `zenjev` | Exact item accessible by trusted launcher; value never returned | Verified model `jev-1.13.0` | One fixed synthetic request, six typed questions, zero retries; [safe evidence](../evidence/live/jev-smoke-20260919.json) |
| Zendesk application | No lookup performed | Not assessed | Untested | None |

The initial GitHub diagnostic under network restriction misleadingly reported an invalid token. After network permission was granted, the authenticated identity request succeeded. No credential was replaced. The initial authenticated `marcoakes/ZenJev` repository lookup found no accessible repository. The owner subsequently authorised private creation and publication; see [release verification](release-verification.md) for the final receipt.

The first application GitHub smoke used an explicit user selector and failed to obtain the credential before HTTP; its [record](../evidence/live/github-smoke-20260919.json) remains unchanged. The subsequent smoke used the existing active-account helper without that selector and succeeded: one metadata GET confirmed the repository is private. No source change, alternative credential store, new scope or authentication change was made. This verifies repository metadata access only. GitHub issue retrieval/ingestion and write permissions, plus all Zendesk access, remain unverified.

Wringer's actual alpha.14 documentation specifies `codex-acp` with `authMethod: api-key` and `CODEX_API_KEY` for its pinned adapter; Claude uses `ANTHROPIC_API_KEY` without that explicit method. Neither adapter was launched. A present item does not prove password access, ACP readiness, model selection, provider validity or billing.

Future contained workers must use Wringer's in-memory declared-role secret resolution. Do not mount the home directory, Keychain, client login directories, private keys or Docker socket. Do not use a ChatGPT session token as an API key. Any OS access prompt belongs to the owner; do not change Keychain permissions or entries.

Offline application, dependency setup and tests must launch with a secret-free allowlisted environment. Product processes must never receive Claude/Codex build keys. No `.env` file containing real credentials has been created.
