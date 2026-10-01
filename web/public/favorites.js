export const storageKey = 'skill-atlas.favorites.v1';
export function identity(owner, skill) { return JSON.stringify([owner.repository.path, skill.manifest_path]); }
function decode(text) {
  if (!text) return new Set();
  if (text.length > 4 * 1024 * 1024) throw new Error('Too large');
  const value = JSON.parse(text);
  if (value.version !== 1 || !Array.isArray(value.keys) || value.keys.length > 10000) throw new Error('Invalid storage');
  for (const key of value.keys) {
    if (typeof key !== 'string' || key.length > 8192) throw new Error('Invalid identity');
    const pair = JSON.parse(key);
    if (!Array.isArray(pair) || pair.length !== 2 || pair.some(p => typeof p !== 'string' || !p || p.includes('\0'))) throw new Error('Invalid identity');
  }
  return new Set(value.keys);
}
export function createFavorites(storage, changed, status) {
  let keys = new Set();
  function load(text) {
    try { keys = decode(text); }
    catch { status('Stored favorites could not be read. Favorites are available for this session.'); }
  }
  try { load(storage.getItem(storageKey)); }
  catch { status('Favorites storage is unavailable. Favorites are available for this session.'); }
  return {
    has: (owner, skill) => keys.has(identity(owner, skill)),
    toggle(owner, skill) {
      const key = identity(owner, skill);
      if (keys.has(key)) keys.delete(key);
      else if (keys.size < 10000) keys.add(key);
      else { status('Favorites limit reached (10,000). Remove a favorite first.'); return; }
      try { storage.setItem(storageKey, JSON.stringify({ version: 1, keys: [...keys] })); }
      catch { status('Favorites could not be saved. Your changes last for this session.'); }
      changed();
    },
    sync(event) { if (event.key === storageKey || event.key === null) { load(event.newValue); changed(); } }
  };
}
