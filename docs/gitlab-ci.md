# GitLab CI

[.gitlab-ci.yml](../.gitlab-ci.yml) is a behavioural equivalent of
[.github/workflows/verify.yml](../.github/workflows/verify.yml). Both pipelines run the same
`scripts/ci-verify.mjs`, so the verification cannot drift between them.

## What the pipeline is not

**This pipeline has never executed on GitLab.** No GitLab project, namespace, account, runner or
credential exists for ZenJev. The file was written against the GitHub workflow and validated
offline only, as recorded below. Hosting a `.gitlab-ci.yml` is not the same as a passing pipeline,
and nothing here should be read as GitLab CI evidence. GitHub Actions remains the only executed
pipeline for this repository.

## Offline validation actually performed, 19 September 2026

| Check | Tool | Result |
|---|---|---|
| Schema conformance | GitLab's own `ci.json` editor schema (draft-07), validated with Ajv | Valid, zero errors |
| Structure, rules and job graph | `gitlab-ci-local --list` | Parsed; one job `verify`, stage `verify`, `when: on_success`, `allow_failure: false` |
| Local execution in containers | `gitlab-ci-local` with a container runtime | **Not executed.** The host has no running container runtime and setting one up was out of scope |

The schema was fetched from
`https://gitlab.com/gitlab-org/gitlab/-/raw/master/app/assets/javascripts/editor/schema/ci.json`
on 19 September 2026.

## Preserved behaviour

- **Pinned harness.** Wringer is cloned at `7ca2fb58e4270ba70fc6f6fdf4a39e30d70d9cb4` and the
  revision is asserted before it is built. The clone lives outside the project directory so the
  application checkout that `ci-verify.mjs` inspects stays clean.
- **Clean checkout.** The job asserts `git rev-parse HEAD` equals `CI_COMMIT_SHA`, and
  `ci-verify.mjs` independently refuses a dirty tree and re-checks the revision at the end.
- **Native PostgreSQL 17.** Two `postgres:17` services with separate demo and test databases.
  `ci-verify.mjs` queries `server_version_num` and refuses PGlite, WebAssembly or Emscripten
  builds, so the native concurrency evidence cannot be satisfied by a portable substitute.
- **Build ordering, readiness and cleanup.** Dependencies without lifecycle scripts, then the
  Playwright-pinned Chromium, then Wringer, then verification. The worker and both application
  instances are started by `ci-verify.mjs`, polled for readiness, and terminated by its own
  process-group cleanup.
- **Every gate affects status.** There is no `allow_failure` and no `retry`. `ci-verify.mjs`
  collects gate failures and exits nonzero.
- **Preserved failures.** Artifacts upload `when: always` with `expire_in: 14 days` and
  `access: developer`, carrying `work/ci/`, the sealed Wringer bundles in `.wringer/runs/`,
  Playwright traces and screenshots.

## Deliberate differences from the GitHub workflow

| Area | GitHub | GitLab | Why |
|---|---|---|---|
| Database address | Host ports 55432/55433 | Service aliases `demo-postgres`/`test-postgres` on 5432 | GitLab services have no host port mapping. `ci-verify.mjs` now takes `ZENJEV_CI_DEMO_DATABASE_URL` and `ZENJEV_CI_TEST_DATABASE_URL` |
| Bun | `oven-sh/setup-bun` action | Release zip verified against the release's `SHASUMS256.txt` | GitLab has no action equivalent, and a remote installer must never be piped into a shell |
| Docs-only skip | `paths-ignore` | Not replicated | GitLab has no negated `changes:`. A docs-only pipeline is cheaper than a skip rule that silently drops a real change |
| Test reports | None | None | Emitting JUnit would require changing the gate commands in `.wringer.yaml`, which would alter what GitHub CI runs. The artifacts carry the actual results |

## Credentials

The job declares no CI/CD variable and reads none. Ordinary merge-request verification runs on
synthetic data with the mock decision provider, so it needs no Jev, Zendesk, GitHub or GitLab
credential. If live credentials are ever added, define them as **protected and masked** so
unprotected branches and forks cannot receive them, and give live checks a separate manual job.
The Wringer harness repository is public, so its checkout needs no credential; if it ever becomes
private, use a read-only deploy token in a masked variable supplied through a credential helper,
never embedded in the clone URL.

## Running it once a GitLab project exists

1. `brew install glab`, then sign in yourself with `glab auth login`. A new gitlab.com account must
   verify a payment card before shared runners will execute jobs.
2. `glab repo create <namespace>/ZenJev --private`, then `git remote add gitlab <url>` and
   `git push gitlab main`. Leave the GitHub remote and its history untouched.
3. `glab ci run` on the default branch, then `glab ci status --live`. Repair genuine failures
   without weakening any assertion.
4. Record the project URL, the pipeline URL and the tested source commit in
   [release-verification.md](release-verification.md), and replace the "not executed" statement
   at the top of this file with the actual result, including any failures.
