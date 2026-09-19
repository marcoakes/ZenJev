# Credential observations — 19 September 2026

Only the configured vendor entries and GitHub helper were inspected. No password value was returned to the assistant, copied to this repository, or embedded in product code/tests. The Jev key was supplied only in the bounded live smoke child environment.

| Role | Source | Located/access | Authentication | Harmless test |
|---|---|---|---|---|
| Claude build worker | macOS Keychain `anthropic-api-key`, account `wringer` | Metadata present; password access untested | Untested | Wringer `setup --check-keychain`, exit-only metadata lookup |
| Codex build worker | macOS Keychain `openai-api-key`, account `wringer` | Metadata present; password access untested | Untested | Same Wringer diagnostic; declared `CODEX_API_KEY` route |
| GitHub repository access | Existing `gh` authentication and configured `osxkeychain` Git helper | Existing helper usable | Verified identity `marcoakes` | Authenticated `gh api user --jq .login` |
| Jev application | macOS Keychain `typesafe-api-key`, account `zenjev` | Exact item accessible by trusted launcher; value never returned | Verified model `jev-1.13.0` | One fixed synthetic request, six typed questions, zero retries; [safe evidence](../evidence/live/jev-smoke-20260919.json) |
| Zendesk application | No lookup performed | Not assessed | Untested | None |

The initial GitHub diagnostic under network restriction misleadingly reported an invalid token. After network permission was granted, the authenticated identity request succeeded. No credential was replaced. The initial authenticated `marcoakes/ZenJev` repository lookup found no accessible repository. The owner subsequently authorised private creation and publication; see [release verification](release-verification.md) for the final receipt.

Wringer's actual alpha.14 documentation specifies `codex-acp` with `authMethod: api-key` and `CODEX_API_KEY` for its pinned adapter; Claude uses `ANTHROPIC_API_KEY` without that explicit method. Neither adapter was launched. A present item does not prove password access, ACP readiness, model selection, provider validity or billing.

Future contained workers must use Wringer's in-memory declared-role secret resolution. Do not mount the home directory, Keychain, client login directories, private keys or Docker socket. Do not use a ChatGPT session token as an API key. Any OS access prompt belongs to the owner; do not change Keychain permissions or entries.

Offline application, dependency setup and tests must launch with a secret-free allowlisted environment. Product processes must never receive Claude/Codex build keys. No `.env` file containing real credentials has been created.
