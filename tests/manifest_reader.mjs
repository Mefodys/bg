import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { readManifestText, manifestDigest } from '../web/manifests.mjs';

for (const replacement of ['parent', 'repository', 'ancestor', 'leaf']) {
  test(`reject ${replacement} symlink swapped after realpath and before native open`, async () => {
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'bg-manifest-race-'));
    const root = await fs.realpath(temporary);
    const ancestor = path.join(root, 'ancestor');
    const repository = path.join(ancestor, 'repo');
    const skills = path.join(repository, 'skills');
    const outside = path.join(root, 'outside');
    await fs.mkdir(skills, { recursive: true });
    await fs.mkdir(path.join(outside, 'repo', 'skills'), { recursive: true });
    await fs.mkdir(path.join(outside, 'skills'));
    await fs.writeFile(path.join(skills, 'SKILL.md'), 'INSIDE');
    for (const file of ['SKILL.md', 'skills/SKILL.md', 'repo/skills/SKILL.md'])
      await fs.writeFile(path.join(outside, file), 'OUTSIDE_REPOSITORY_MARKER');
    const originalRealpath = fs.realpath;
    let swapped = false;
    fs.realpath = async target => {
      const resolved = await originalRealpath(target);
      if (target === path.join(skills, 'SKILL.md') && !swapped) {
        swapped = true;
        const replaced = { parent: skills, repository, ancestor, leaf: target }[replacement];
        await fs.rename(replaced, replaced + '-original');
        await fs.symlink(replacement === 'leaf' ? path.join(outside, 'SKILL.md') : outside, replaced);
      }
      return resolved;
    };
    try {
      await assert.rejects(readManifestText(repository, 'skills/SKILL.md', 1024), error => error.status === 403);
      assert.equal(swapped, true, 'Must reproduce the precise validation/open interleaving');
    } finally {
      fs.realpath = originalRealpath;
      await fs.rm(root, { recursive: true, force: true });
    }
  });
}

test('bounded bytes and incomplete trailing UTF-8 remain compatible', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'bg-manifest-utf8-'));
  const root = await fs.realpath(temporary);
  try {
    await fs.writeFile(path.join(root, 'SKILL.md'), 'A世界');
    assert.deepEqual(await readManifestText(root, 'SKILL.md', 3), { content: 'A', truncated: true, bytes: 3, manifest_sha256: null });
    assert.deepEqual(await readManifestText(root, 'SKILL.md', 7), { content: 'A世界', truncated: false, bytes: 7, manifest_sha256: manifestDigest(Buffer.from('A世界')) });
    assert.deepEqual(await readManifestText(root, 'SKILL.md', 0), { content: '', truncated: true, bytes: 0, manifest_sha256: null });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
