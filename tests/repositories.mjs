import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, realpath } from 'node:fs/promises';
import { Repositories, limits } from '../web/repositories.mjs';

const inventory = count => ({ sections: [{ skills: Array.from({ length: count }, (_, i) => ({ sources: [{ manifest_path: `${i}/SKILL.md` }] })) }], warnings: [] });
async function setup(t, scan = async () => inventory(1), read = async () => ({ content: 'text', bytes: 4, truncated: false })) {
  const directory = await realpath(await mkdtemp('/tmp/bg-catalogue-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, store: new Repositories(directory, scan, read, []) };
}
test('preparations coalesce and share worker with scans, indices and comparisons', async t => {
  let release, scans = 0, reads = 0;
  const { directory, store } = await setup(t, async () => { scans++; await new Promise(resolve => { release = resolve; }); return inventory(1); }, async () => { reads++; return { content: 'body', bytes: 4 }; });
  const entry = store.register(directory);
  const first = store.snapshot(entry.repository_id, {}), second = store.snapshot(entry.repository_id, {});
  assert.equal(first, second);
  assert.throws(() => store.snapshot(entry.repository_id, { refresh: true }), { status: 409 });
  await assert.rejects(store.scan(directory), { status: 409 });
  await assert.rejects(store.work(async () => 'comparison'), { status: 409 });
  while (!release) await new Promise(resolve => setImmediate(resolve));
  release(); const result = await first;
  assert.equal(scans, 1); assert.equal(reads, 1);
  assert.deepEqual(await store.snapshot(entry.repository_id, {}), result);
  assert.equal(scans, 1); assert.equal(reads, 1);
});
test('catalogue capacity is checked before native scan and failed scans do not register', async t => {
  let scans = 0;
  const { directory, store } = await setup(t, async () => { scans++; throw new Error('scan failed'); });
  await assert.rejects(store.scan(directory), /scan failed/);
  assert.equal(store.entries.size, 0);
  for (let i = 0; i < limits.catalogue; i++) store.register(`${directory}/${i}`);
  await assert.rejects(store.scan(directory), { status: 409 });
  assert.equal(scans, 1); assert.equal(store.entries.size, 64);
});
test('deadline is enforced before scans and during reads, with partial omissions', async t => {
  const timeouts = [];
  const now = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now });
  const { directory, store } = await setup(t, async () => inventory(3), async (_session, _path, _limit, timeout) => {
    timeouts.push(timeout); t.mock.timers.setTime(now + 12); return { content: 'text', bytes: 4 };
  });
  const entry = store.register(directory);
  const result = await store.snapshot(entry.repository_id, { budget_ms: 10 });
  assert.equal(result.partial, true); assert.ok(timeouts.every(n => n > 0 && n <= 10));
  assert.ok(result.index.sources.some(s => /timed out/.test(s.error)));
  await assert.rejects(store.work(async () => store.remaining(Date.now() - 1)), { status: 504 });
  const failed = new Repositories(directory, async () => { throw Object.assign(new Error('deadline'), { killed: true }); }, async () => {}, []);
  await assert.rejects(failed.snapshot(failed.register(directory).repository_id, {}), { status: 504 });
});
test('serialized snapshot response bound fails explicitly rather than overflowing', async t => {
  const { directory, store } = await setup(t, async () => ({ ...inventory(8), warnings: ['x'.repeat(17 * 1024 * 1024)] }),
    async (_session, _path, limit) => ({ content: '\u0000'.repeat(limit), bytes: limit, truncated: false }));
  const entry = store.register(directory);
  await assert.rejects(store.snapshot(entry.repository_id, {}), { status: 413 });
  assert.equal(store.busy, false);
});
test('source/text limits and one shared eight-session cache remain bounded', async t => {
  const { directory, store } = await setup(t);
  let session = store.createSession(directory, inventory(513));
  let result = await store.index(session);
  assert.equal(result.sources.filter(s => !s.error).length, 512);
  assert.match(result.sources.at(-1).error, /limit reached/);
  store.read = async (_session, _path, limit) => ({ content: 'a'.repeat(limit), bytes: limit, truncated: false });
  session = store.createSession(directory, inventory(10));
  result = await store.index(session);
  assert.equal(result.sources.reduce((sum, s) => sum + s.content.length, 0), 8 * 1024 * 1024);
  const oldest = session.scan_id;
  for (let i = 0; i < 8; i++) store.createSession(directory, inventory(0));
  assert.equal(store.sessions.size, 8); assert.equal(store.sessions.has(oldest), false);
});
test('restart rediscovers presets, drops manual additions and changes opaque IDs', async t => {
  const { directory, store } = await setup(t);
  await mkdir(`${directory}/.git`);
  store.presets = [{ name: 'preset', path: directory }];
  const first = (await store.list())[0];
  store.register(`${directory}/manual`);
  const restarted = new Repositories(directory, async () => inventory(0), async () => {}, store.presets);
  const entries = await restarted.list();
  assert.equal(entries.length, 1); assert.notEqual(entries[0].repository_id, first.repository_id);
  assert.throws(() => restarted.snapshot(first.repository_id, {}), { status: 404 });
});
