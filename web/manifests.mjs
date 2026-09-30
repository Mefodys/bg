import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const binary = fileURLToPath(new URL('../bg', import.meta.url));
const failure = (status, message) => Object.assign(new Error(message), { status });

// The native subprocess pins each directory with fchdir and uses O_NOFOLLOW
// for EVERY component. Keep the original root/relative path, not realpath's target:
// resolving and later opening a pathname is vulnerable to ancestor swaps.
export async function readManifestText(repository, relative, limit) {
  if (!Number.isInteger(limit) || limit < 0 || limit > 1024 * 1024) throw failure(400, 'Invalid manifest limit.');
  try {
    const target = await fs.realpath(path.join(repository, relative));
    const rel = path.relative(repository, target);
    if (rel.startsWith(`..${path.sep}`) || rel === '..' || path.isAbsolute(rel))
      throw failure(403, 'Manifest is outside the repository.');
    const { stdout } = await execute(binary, ['--read-manifest', repository, relative, String(limit)], {
      encoding: 'buffer', timeout: 10000, maxBuffer: limit + 4096,
    });
    const truncated = stdout.length > limit;
    const content = new TextDecoder().decode(stdout.subarray(0, limit), { stream: truncated });
    return { content, truncated, bytes: Math.min(stdout.length, limit) };
  } catch (error) {
    if (error.status) throw error;
    if (error.code === 3) throw failure(403, 'Manifest path contains a symbolic link or is outside the repository.');
    throw failure(404, 'Manifest is no longer available.');
  }
}
