import http from 'node:http';
import { compare } from './similarity.mjs';
import { readFile, stat } from 'node:fs/promises';
import { readManifestText } from './manifests.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Repositories } from './repositories.mjs';

const execute = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const binary = path.join(root, 'bg');

const assets = new Map([['/search-scope.js', ['search-scope.js', 'text/javascript']], ['/similarity.js', ['similarity.js', 'text/javascript']], ['/similarity.css', ['similarity.css', 'text/css']], ['/', ['index.html', 'text/html']], ['/app.js', ['app.js', 'text/javascript']], ['/style.css', ['style.css', 'text/css']], ['/filter.js', ['filter.js', 'text/javascript']], ['/filter.css', ['filter.css', 'text/css']]]);
async function scanRepository(repository, timeout = 120000) {
  // All discovery remains in the native scanner.
  const { stdout } = await execute(binary, ['scan', repository, '--json'], { timeout, maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(stdout);
}
const port = Number(process.env.PORT ?? 4173);
assets.set('/favorites.js', ['favorites.js', 'text/javascript']);
assets.set('/favorites.css', ['favorites.css', 'text/css']);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer between 0 and 65535');
try { await stat(binary); } catch { console.error('Scanner missing. Run bash build.sh first.'); process.exit(1); }

function fail(status, message) { return Object.assign(new Error(message), { status }); }
function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw fail(415, 'Send application/json.');
  if (Number(req.headers['content-length']) > 16384) throw fail(413, 'Request is too large.');
  let bytes = 0; const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 16384) throw fail(413, 'Request is too large.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail(400, 'Invalid JSON.'); }
}
// Read only scanner-allowlisted sources, with containment and bounded allocation.
async function manifestText(session, relative, limit, timeout) {
  if (!session.manifests.has(relative)) throw fail(403, 'Manifest is not part of this scan.');
  return readManifestText(session.repository, relative, limit, timeout);
}
const presets = ['MPS', 'koog', 'android'].map(name => ({ name, path: path.join(root, 'repositories', name) }));
presets.push({ name: 'kotlin', path: path.resolve(root, '../../GIT/kotlin') });
const repositories = new Repositories(root, scanRepository, manifestText, presets);
await repositories.list();
const sessions = repositories.sessions;
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  try {
    const address = server.address();
    const allowed = [`127.0.0.1:${address.port}`, `localhost:${address.port}`];
    if (!allowed.includes(req.headers.host)) throw fail(403, 'Untrusted host.');
    if (req.headers.origin && !allowed.map(h => `http://${h}`).includes(req.headers.origin)) throw fail(403, 'Untrusted origin.');
    if (req.headers['sec-fetch-site'] === 'cross-site') throw fail(403, 'Cross-site requests are not allowed.');
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === 'GET' && assets.has(url.pathname)) {
      const [file, type] = assets.get(url.pathname);
      res.setHeader('Content-Type', `${type}; charset=utf-8`);
      res.end(await readFile(path.join(root, 'web/public', file))); return;
    }
    if (req.method === 'GET' && url.pathname === '/api/repositories') {
      json(res, 200, await repositories.list()); return;
    }
    const snapshotMatch = /^\/api\/repositories\/([a-f0-9-]+)\/search-snapshot$/.exec(url.pathname);
    if (req.method === 'POST' && snapshotMatch) {
      json(res, 200, await repositories.snapshot(snapshotMatch[1], await body(req))); return;
    }
    if (req.method === 'POST' && url.pathname === '/api/scan') {
      const input = await body(req);
      if (!input || typeof input.path !== 'string' || !input.path.trim() || input.path.includes('\0')) throw fail(400, 'Enter a repository directory.');
      try { json(res, 200, await repositories.scan(input.path)); }
      catch (error) { if (error.status) throw error; console.error('Scan failed:', error.message); throw fail(error.killed ? 504 : 500, error.killed ? 'Scan timed out.' : 'Scanner failed. Check the server terminal.'); }
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/similarity') {
      const input = await body(req);
      const session = sessions.get(input?.scan_id);
      if (!session) throw fail(404, 'Scan expired. Scan the repository again.');
      json(res, 200, await repositories.work(() => compare(input, session, scanRepository, root)));
      return;
    }
    const indexMatch = /^\/api\/scans\/([a-f0-9-]+)\/search-index$/.exec(url.pathname);
    if (req.method === 'GET' && indexMatch) {
      const session = sessions.get(indexMatch[1]);
      if (!session) throw fail(404, 'Scan expired. Scan the repository again.');
      json(res, 200, await repositories.index(session)); return;
    }
    const match = /^\/api\/scans\/([a-f0-9-]+)\/manifest$/.exec(url.pathname);
    if (req.method === 'GET' && match) {
      const session = sessions.get(match[1]);
      const relative = url.searchParams.get('path');
      if (!session) throw fail(404, 'Scan expired. Scan the repository again.');
      if (!session.manifests.has(relative)) throw fail(403, 'Manifest is not part of this scan.');
      const result = await manifestText(session, relative, 1024 * 1024);
      if (result.truncated) throw fail(413, 'Manifest exceeds 1 MB.');
      json(res, 200, { path: relative, content: result.content });
      return;
    }
    throw fail(404, 'Not found.');
  } catch (error) {
    if (!error.status) console.error(error);
    if (!res.headersSent) json(res, error.status ?? 500, { error: error.status ? error.message : 'Internal server error.' });
    else res.end();
  }
});
server.requestTimeout = 150000;
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is occupied. Try PORT=4174 bash web/run.sh` : error.message); process.exit(1); });
server.listen(port, '127.0.0.1', () => console.log(`Skill Atlas: http://127.0.0.1:${server.address().port}`));
