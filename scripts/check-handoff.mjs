import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

// An offline integrity audit of retained evidence, not another application test run.
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifest = JSON.parse(readFileSync(resolve(root, 'evidence/verification-manifest.json'), 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function checkedFile(file, sha256) {
  assert.equal(typeof file, 'string');
  const path = resolve(root, file), rel = relative(root, path);
  assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel), `Unsafe evidence path: ${file}`);
  assert.match(sha256, /^[a-f0-9]{64}$/);
  assert.equal(digest(readFileSync(path)), sha256, `Changed file: ${file}`);
}
assert.equal(manifest.schema, 'zenjev-verification.v1');
assert.match(manifest.source.commit, /^[a-f0-9]{40}$/);
assert.match(manifest.harness.commit, /^[a-f0-9]{40}$/);
assert.equal(manifest.harness.route, 'standalone trusted_local');
assert.deepEqual(manifest.modes, { data: 'synthetic', decisions: 'mock', externalWrites: false });
assert.equal(manifest.review.reviewer, 'Codex delegated agent');
assert.equal(manifest.review.ownerPersonalVerdict, null);
assert.equal(manifest.publication.published, false);
assert.ok(manifest.source.files.length > 30);
for (const file of manifest.source.files) checkedFile(file.path, file.sha256);
assert.ok(manifest.artifacts.length > 10);
for (const file of manifest.artifacts) checkedFile(file.path, file.sha256);
assert.ok(manifest.gates.length >= 8);
assert.equal(new Set(manifest.gates.map(g => g.id)).size, manifest.gates.length);
for (const gate of manifest.gates) {
  assert.ok(gate.command && Number.isInteger(gate.exitCode));
  assert.ok(['passed', 'failed', 'blocked'].includes(gate.outcome));
  assert.equal(gate.outcome === 'passed', gate.exitCode === 0);
  assert.ok(manifest.artifacts.some(a => a.path === gate.log), `Missing log for ${gate.id}`);
}
assert.ok(manifest.unmetRequirements.length > 0, 'Unmet requirements must remain explicit');
console.log(JSON.stringify({ check: 'SW-12 portable handoff integrity', status: 'passed', sourceCommit: manifest.source.commit, sourceFiles: manifest.source.files.length, artifacts: manifest.artifacts.length, gates: manifest.gates.length, note: 'Hashes and result structure audited; no gates rerun and no human acceptance granted.' }));
