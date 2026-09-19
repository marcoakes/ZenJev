import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const path = 'public/branding/zenjev-hero.png';
const expected = '12d814fe08a70d57764a0c8d27ad6b0bb43f9b7706407b79a6d05217c1a54d7d';

test('ZJ-02: approved PNG bytes and fully decompressible image data', () => {
  const png = readFileSync(new URL(path, root));
  assert.equal(createHash('sha256').update(png).digest('hex'), expected);
  assert.deepEqual(png.subarray(0, 8), Buffer.from([137,80,78,71,13,10,26,10]));
  assert.equal(png.toString('ascii', 12, 16), 'IHDR');
  assert.equal(png.readUInt32BE(16), 1254);
  assert.equal(png.readUInt32BE(20), 1254);
  const chunks = [];
  let foundEnd = false;
  for (let offset = 8; offset < png.length;) {
    const size = png.readUInt32BE(offset);
    assert.ok(offset + size + 12 <= png.length);
    const type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + size));
    if (type === 'IEND') foundEnd = true;
    offset += size + 12;
  }
  assert.ok(foundEnd);
  assert.ok(inflateSync(Buffer.concat(chunks)).length > 1254 * 1254);
});

test('ZJ-03: root README resolves the exact relative image and alt text', () => {
  const readme = readFileSync(new URL('README.md', root), 'utf8');
  assert.ok(readme.includes('![ZenJev: a meditating ninja in pink, black and cream, with retro support-workflow panels.](public/branding/zenjev-hero.png)'));
  assert.ok(!readme.includes('/mnt/data') && !readme.includes('sandbox:'));
  assert.ok(readFileSync(new URL(path, root)).length > 1000);
});

test('ZJ-01 (repository portion): exact product and package identity', () => {
  assert.match(readFileSync(new URL('README.md', root), 'utf8'), /^# ZenJev\n/);
  assert.equal(JSON.parse(readFileSync(new URL('package.json', root), 'utf8')).name, 'zenjev');
});

test('ZJ-02: canonical image is tracked and not ignored', () => {
  assert.equal(execFileSync('git', ['ls-files', '--error-unmatch', path], {cwd: root, encoding: 'utf8'}).trim(), path);
  assert.equal(execFileSync('git', ['check-attr', 'filter', '--', path], {cwd: root, encoding: 'utf8'}).trim(), `${path}: filter: unspecified`);
});
