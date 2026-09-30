import test from 'node:test';
import assert from 'node:assert/strict';
import { scores } from '../web/similarity.mjs';

test('full-text TF-IDF has defined identical, disjoint, empty and partial scores', () => {
  const values = scores(['alpha beta gamma', 'alpha beta gamma', 'delta epsilon', '', 'alpha beta']);
  assert.equal(values[0], 100);
  assert.equal(values[1], 0);
  assert.equal(values[2], 0);
  assert.ok(values[3] > 0 && values[3] < 100);
  assert.deepEqual(scores(['', '']), [0]);
  assert.deepEqual(scores(['!!!', 'alpha']), [0]);
  assert.deepEqual(scores(['alpha', 'alpha', 'alpha']), [100, 100]);
  assert.deepEqual(values, scores(['alpha beta gamma', 'alpha beta gamma', 'delta epsilon', '', 'alpha beta']));
});
test('Unicode normalization, case and numbers; body beyond description affects score', () => {
  assert.deepEqual(scores(['CAFÉ 世界 １２', 'cafe\u0301 世界 12']), [100]);
  const [same, different] = scores(['# shared\n\nSummary\n\n' + 'compiler '.repeat(100), '# shared\n\nSummary\n\n' + 'compiler '.repeat(100), '# shared\n\nSummary\n\n' + 'weather '.repeat(100)]);
  assert.equal(same, 100);
  assert.ok(different < 10);
});
test('smoothed IDF and logarithmic TF follow documented formula', () => {
  // Corpus: [a a b], [a c]. df(a)=2; df(b)=df(c)=1; N=2.
  const tf = 1 + Math.log(2), idf = 1 + Math.log(3 / 2);
  const expected = 100 * tf / (Math.sqrt(tf * tf + idf * idf) * Math.sqrt(1 + idf * idf));
  assert.ok(Math.abs(scores(['a a b', 'a c'])[0] - expected) < 1e-10);
});

import { compare } from '../web/similarity.mjs';
import { mkdtemp, mkdir, writeFile, unlink, symlink, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

test('a discovered target becoming missing or a symlink is omitted with an explicit error', async () => {
  const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'bg-similarity-race-')));
  const source = path.join(temporary, 'source'), target = path.join(temporary, 'target');
  await mkdir(source); await mkdir(target);
  await writeFile(path.join(source, 'SKILL.md'), 'alpha');
  const skill = { category: 'development', manifest_path: 'SKILL.md', sources: [{ manifest_path: 'SKILL.md' }] };
  const session = { repository: source, inventory: { sections: [{ skills: [skill] }] } };
  try {
    for (const mode of ['missing', 'symlink']) {
      await writeFile(path.join(target, 'SKILL.md'), 'alpha');
      const result = await compare({ manifest_path: 'SKILL.md', targets: [target] }, session, async () => {
        await unlink(path.join(target, 'SKILL.md'));
        if (mode === 'symlink') await symlink(path.join(source, 'SKILL.md'), path.join(target, 'SKILL.md'));
        return { sections: [{ skills: [skill] }], warnings: [] };
      }, temporary);
      assert.equal(result.partial, true);
      assert.equal(result.results.length, 0);
      assert.equal(result.warnings[0].path, 'SKILL.md');
      if (mode === 'symlink') await unlink(path.join(target, 'SKILL.md'));
    }
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
