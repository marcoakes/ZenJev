# Verification 20260919-155421-529bca54

Checks failed.

Commit: 29ca2c671e779fec93a2bee7bd9bca4043b3e3eb. Branch: main. Working tree: clean.

| Check | Result | Time | Evidence |
|---|---|---:|---|
| fresh-offline-setup | passed | 5602 ms | [output](gates/001_fresh-offline-setup/stdout.log) · [errors](gates/001_fresh-offline-setup/stderr.log) |
| branding | passed | 184 ms | [output](gates/002_branding/stdout.log) · [errors](gates/002_branding/stderr.log) |
| domain-provider-contracts | passed | 1194 ms | [output](gates/003_domain-provider-contracts/stdout.log) · [errors](gates/003_domain-provider-contracts/stderr.log) |
| persistence-workflow | passed | 5114 ms | [output](gates/004_persistence-workflow/stdout.log) · [errors](gates/004_persistence-workflow/stderr.log) |
| browser | failed | 4106 ms | [output](gates/005_browser/stdout.log) · [errors](gates/005_browser/stderr.log) |
| lint | skipped | — | — |
| typecheck | skipped | — | — |
| production-build | skipped | — | — |

Next: `wring verify --gate browser`
