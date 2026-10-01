import { spawn } from 'node:child_process';
import { once } from 'node:events';
let failed = false;
for (const script of ['tests/web_smoke.mjs', 'tests/web_similarity.mjs', 'tests/web_repositories.mjs']) {
  const child = spawn(process.execPath, [script], { stdio: 'inherit' });
  const [code] = await once(child, 'exit');
  if (code !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
const features = spawn(process.execPath, ['node_modules/playwright/cli.js', 'test', '--config', 'playwright.features.config.mjs'], { stdio: 'inherit' });
const [featureCode] = await once(features, 'exit');
if (featureCode !== 0) process.exitCode = 1;
