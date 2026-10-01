import assert from 'node:assert/strict';
import { createFavorites, storageKey, identity } from '../web/public/favorites.js';
let text = null, changes = 0, messages = [];
const storage = { getItem: () => text, setItem: (_, value) => { text = value; } };
const owner = { repository: { path: '/canonical/a' }, scan_id: 'old' }, skill = { manifest_path: 'skills/x/SKILL.md' };
let favorites = createFavorites(storage, () => changes++, t => messages.push(t));
favorites.toggle(owner, skill); assert.equal(changes, 1);
const changedSession = { ...owner, scan_id: 'new', repository: { ...owner.repository, repository_id: 'new' } };
assert.ok(favorites.has(changedSession, skill));
assert.ok(!favorites.has({ repository: { path: '/canonical/b' } }, skill));
favorites = createFavorites(storage, () => changes++, t => messages.push(t));
assert.ok(favorites.has(owner, skill));
favorites.sync({ key: storageKey, newValue: null }); assert.ok(!favorites.has(owner, skill));
favorites.sync({ key: storageKey, newValue: JSON.stringify({ version: 1, keys: [identity(owner, skill)] }) }); assert.ok(favorites.has(owner, skill));
favorites.sync({ key: 'unrelated', newValue: null }); assert.ok(favorites.has(owner, skill));
for (text of ['broken', JSON.stringify({version:1,keys:[7]}), JSON.stringify({version:1,keys:['[]']}), ' '.repeat(4*1024*1024+1)]) {
  assert.doesNotThrow(() => createFavorites(storage, () => {}, t => messages.push(t)));
}
const denied = createFavorites({ getItem() { throw Error(); }, setItem() { throw Error(); } }, () => {}, t => messages.push(t));
denied.toggle(owner, skill); assert.ok(denied.has(owner, skill)); assert.ok(messages.length >= 6);
console.log('Favorites identity, persistence, cross-tab, corruption and denied-storage checks passed.');
