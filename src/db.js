// Small promise wrapper around IndexedDB. All collected data lives here, on
// the phone, so the app works completely offline.
//
// Stores:
//   features  – collected nodes and ways   (keyPath: id)
//   kv        – settings, login token, counters, cached OSM data
//   tiles     – passively cached map tiles (key: "<layer>/<z>/<x>/<y>")
//   files     – large blobs, e.g. the offline .pmtiles base map

const DB_NAME = 'osm-field-collector';
const DB_VERSION = 1;
let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('features')) {
          const s = db.createObjectStore('features', { keyPath: 'id' });
          s.createIndex('project', 'project');
        }
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('tiles')) {
          const t = db.createObjectStore('tiles');
          t.createIndex('t', 't');
        }
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name, mode = 'readonly') {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

export async function get(storeName, key) {
  return reqP((await store(storeName)).get(key));
}
export async function put(storeName, value, key) {
  const s = await store(storeName, 'readwrite');
  return reqP(key === undefined ? s.put(value) : s.put(value, key));
}
export async function del(storeName, key) {
  return reqP((await store(storeName, 'readwrite')).delete(key));
}
export async function getAll(storeName) {
  return reqP((await store(storeName)).getAll());
}
export async function count(storeName) {
  return reqP((await store(storeName)).count());
}
export async function clear(storeName) {
  return reqP((await store(storeName, 'readwrite')).clear());
}

// ---- key/value helpers ----
export const kvGet = (k) => get('kv', k);
export const kvSet = (k, v) => put('kv', v, k);
export const kvDel = (k) => del('kv', k);

// ---- features ----
export async function nextFeatureId() {
  const n = ((await kvGet('seq')) || 0) + 1;
  await kvSet('seq', n);
  return n;
}
export const saveFeature = (f) => put('features', f);
export const deleteFeature = (id) => del('features', id);
export const allFeatures = () => getAll('features');

// Persistent storage: ask the browser engine not to evict our data when the
// phone runs low on space.
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      return await navigator.storage.persist();
    }
  } catch { /* ignore */ }
  return false;
}

// Remove the oldest cached tiles once the cache grows beyond `max`.
export async function trimTileCache(max) {
  const total = await count('tiles');
  if (total <= max) return 0;
  let toDelete = total - Math.floor(max * 0.9);
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tiles', 'readwrite');
    const idx = tx.objectStore('tiles').index('t');
    let deleted = 0;
    idx.openCursor().onsuccess = (e) => {
      const cur = e.target.result;
      if (cur && toDelete > 0) {
        cur.delete();
        deleted++;
        toDelete--;
        cur.continue();
      }
    };
    tx.oncomplete = () => resolve(deleted);
    tx.onerror = () => reject(tx.error);
  });
}
