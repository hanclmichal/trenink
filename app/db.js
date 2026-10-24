// IndexedDB: the phone's local copy of the data repository.
// files: { path, text, base, sha, deleted }  text = local version, base = last synced version
// media: { path, blob, type, sha, pending, deleted }  binary files (own GIFs and videos), downloaded on demand
// kv:    small key/value settings (connection, last synced commit, media index)

const DB_NAME = 'trenink';
const DB_VERSION = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'path' });
      if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'path' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Databázi drží otevřenou jiná karta aplikace.'));
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then(v => { out = v; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transakce byla přerušena.'));
  }));
}

const req2p = r => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

export const files = {
  all: () => tx('files', 'readonly', s => req2p(s.getAll())),
  put: f => tx('files', 'readwrite', s => { s.put(f); }),
  putMany: list => tx('files', 'readwrite', s => { list.forEach(f => s.put(f)); }),
  del: path => tx('files', 'readwrite', s => { s.delete(path); }),
  delMany: paths => tx('files', 'readwrite', s => { paths.forEach(p => s.delete(p)); }),
  clear: () => tx('files', 'readwrite', s => { s.clear(); })
};

export const media = {
  get: path => tx('media', 'readonly', s => req2p(s.get(path))),
  all: () => tx('media', 'readonly', s => req2p(s.getAll())),
  put: m => tx('media', 'readwrite', s => { s.put(m); }),
  del: path => tx('media', 'readwrite', s => { s.delete(path); }),
  clear: () => tx('media', 'readwrite', s => { s.clear(); })
};

export const kv = {
  get: key => tx('kv', 'readonly', s => req2p(s.get(key))),
  set: (key, value) => tx('kv', 'readwrite', s => { s.put(value, key); }),
  del: key => tx('kv', 'readwrite', s => { s.delete(key); })
};

export async function persistStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch (e) { /* not supported */ }
  return false;
}
