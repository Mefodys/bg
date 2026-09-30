import { spawn } from 'node:child_process';
import { once } from 'node:events';
let failed = false;
for (const script of ['tests/web_smoke.mjs', 'tests/web_similarity.mjs']) {
  const child = spawn(process.execPath, [script], { stdio: 'inherit' });
  const [code] = await once(child, 'exit');
  if (code !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
