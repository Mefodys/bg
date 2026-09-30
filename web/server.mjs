import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const execute = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const binary = path.join(root, 'bg');
const sessions = new Map();
const assets = new Map([['/', ['index.html', 'text/html']], ['/app.js', ['app.js', 'text/javascript']], ['/style.css', ['style.css', 'text/css']]]);
let running = false;
const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? '127.0.0.1';
if (!['127.0.0.1', '0.0.0.0'].includes(host)) throw new Error('HOST must be 127.0.0.1 or 0.0.0.0');
const publicPort = Number(process.env.PUBLIC_PORT ?? port);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer between 0 and 65535');
if (!Number.isInteger(publicPort) || publicPort < 0 || publicPort > 65535) throw new Error('PUBLIC_PORT must be an integer between 0 and 65535');
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
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  try {
    const address = server.address();
    const allowed = [`127.0.0.1:${address.port}`, `localhost:${address.port}`];
    if (host === '0.0.0.0' && publicPort > 0 && publicPort <= 65535) allowed.push(`127.0.0.1:${publicPort}`, `localhost:${publicPort}`);
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
      const candidates = ['MPS', 'koog', 'android'].map(name => ({ name, path: path.join(root, 'repositories', name) }));
      candidates.push({ name: 'kotlin', path: path.resolve(root, '../../GIT/kotlin') });
      const available = [];
      for (const candidate of candidates) {
        try { if ((await stat(path.join(candidate.path, '.git'))).isDirectory()) available.push(candidate); } catch { /* optional checkout */ }
      }
      json(res, 200, available); return;
    }
    if (req.method === 'POST' && url.pathname === '/api/scan') {
      const input = await body(req);
      if (!input || typeof input.path !== 'string' || !input.path.trim() || input.path.includes('\0')) throw fail(400, 'Enter a repository directory.');
      if (running) throw fail(409, 'A scan is already running. Please wait.');
      let repository;
      try { repository = await realpath(path.resolve(root, input.path)); if (!(await stat(repository)).isDirectory()) throw new Error(); }
      catch { throw fail(400, 'Repository directory does not exist.'); }
      running = true;
      try {
        const { stdout } = await execute(binary, ['scan', repository, '--json'], { timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
        const inventory = JSON.parse(stdout);
        const id = randomUUID();
        const manifests = new Set(inventory.sections.flatMap(s => s.skills.flatMap(k => k.sources.map(source => source.manifest_path))));
        if (sessions.size >= 8) sessions.delete(sessions.keys().next().value);
        sessions.set(id, { repository, manifests });
        json(res, 200, { scan_id: id, inventory });
      } catch (error) { console.error('Scan failed:', error.message); throw fail(500, error.killed ? 'Scan timed out.' : 'Scanner failed. Check the server terminal.'); }
      finally { running = false; }
      return;
    }
    const match = /^\/api\/scans\/([a-f0-9-]+)\/manifest$/.exec(url.pathname);
    if (req.method === 'GET' && match) {
      const session = sessions.get(match[1]);
      const relative = url.searchParams.get('path');
      if (!session) throw fail(404, 'Scan expired. Scan the repository again.');
      if (!session.manifests.has(relative)) throw fail(403, 'Manifest is not part of this scan.');
      let target;
      try {
        target = await realpath(path.join(session.repository, relative));
        const rel = path.relative(session.repository, target);
        if (rel.startsWith(`..${path.sep}`) || rel === '..' || path.isAbsolute(rel)) throw fail(403, 'Manifest is outside the repository.');
        const info = await stat(target);
        if (!info.isFile()) throw fail(404, 'Manifest is no longer a file.');
        if (info.size > 1024 * 1024) throw fail(413, 'Manifest exceeds 1 MB.');
        json(res, 200, { path: relative, content: await readFile(target, 'utf8') });
      } catch (error) { throw error.status ? error : fail(404, 'Manifest is no longer available.'); }
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
server.listen(port, host, () => console.log(`Skill Atlas: http://127.0.0.1:${publicPort || server.address().port}`));
