// In-memory model of the data repository, persisted to IndexedDB on every change.
import { files as fileDb, media as mediaDb, kv } from './db.js';
import { DEFAULT_CVIKY, DEFAULT_PLAN, DEFAULT_KALENDAR } from './data.js';
import { clone } from './format.js';

const listeners = new Set();
export const store = {
  files: new Map(),        // path -> { path, text, base, sha, deleted }
  plan: clone(DEFAULT_PLAN),
  cviky: [],               // exercise library (array)
  cvik: new Map(),         // id -> exercise
  kalendar: clone(DEFAULT_KALENDAR),
  mediaMap: {},            // media.json: cvikId -> { soubor, typ, velikost } | { url }
  sessions: new Map(),     // date -> session
  mediaIndex: {},          // path -> sha of binary files in the repository
  mediaLocal: new Map(),   // path -> { path, sha, pending, deleted, type } (blobs stay in IndexedDB)
  conn: null,              // { owner, repo, branch, token, api }
  head: null,
  lastSync: null,
  ready: false
};

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
let notifyQueued = false;
export function notify() {
  if (notifyQueued) return;
  notifyQueued = true;
  queueMicrotask(() => { notifyQueued = false; listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); });
}

export const SESSION_RE = /^treninky\/(\d{4}-\d{2}-\d{2})\.json$/;
export const tracked = p => ['plan.json', 'cviky.json', 'kalendar.json', 'media.json'].includes(p) || SESSION_RE.test(p) || /^konflikty\/[^/]+\.json$/.test(p);
export const isMedia = p => /^media\/[^/]+$/.test(p);
export const sessionPath = date => `treninky/${date}.json`;

export async function load() {
  const all = await fileDb.all();
  store.files = new Map(all.map(f => [f.path, f]));
  store.conn = (await kv.get('conn')) || null;
  store.head = (await kv.get('head')) || null;
  store.lastSync = (await kv.get('lastSync')) || null;
  store.mediaIndex = (await kv.get('mediaIndex')) || {};
  const ms = await mediaDb.all();
  store.mediaLocal = new Map(ms.map(m => [m.path, { path: m.path, sha: m.sha || null, pending: !!m.pending, deleted: !!m.deleted, type: m.type || '' }]));
  rebuild();
  store.ready = true;
  notify();
}

function parseJson(path, fallback) {
  const f = store.files.get(path);
  if (!f || f.deleted) return clone(fallback);
  try { return JSON.parse(f.text); } catch (e) { return clone(fallback); }
}

/** Recompute plan, library, calendar and sessions from the files. */
export function rebuild() {
  store.plan = parseJson('plan.json', DEFAULT_PLAN);
  if (!store.plan || !store.plan.dny) store.plan = clone(DEFAULT_PLAN);
  const lib = parseJson('cviky.json', DEFAULT_CVIKY);
  store.cviky = Array.isArray(lib.cviky) ? lib.cviky : clone(DEFAULT_CVIKY.cviky);
  store.cvik = new Map(store.cviky.map(x => [x.id, x]));
  store.kalendar = parseJson('kalendar.json', DEFAULT_KALENDAR);
  if (!Array.isArray(store.kalendar.vychoziDny)) store.kalendar.vychoziDny = clone(DEFAULT_KALENDAR.vychoziDny);
  if (!store.kalendar.dny || typeof store.kalendar.dny !== 'object') store.kalendar.dny = {};
  store.mediaMap = parseJson('media.json', { verze: 1, cviky: {} }).cviky || {};
  store.sessions = new Map();
  for (const f of store.files.values()) {
    const m = f.path.match(SESSION_RE);
    if (!m || f.deleted) continue;
    try {
      const s = JSON.parse(f.text);
      s.datum = m[1];
      if (!Array.isArray(s.cviky)) s.cviky = [];
      s.dirty = f.base == null || f.text !== f.base;
      store.sessions.set(m[1], s);
    } catch (e) { /* unreadable file stays in the repository untouched */ }
  }
}

/** Sessions sorted by date (oldest first). */
export function sessionList() {
  return [...store.sessions.values()].sort((a, b) => a.datum.localeCompare(b.datum));
}

/* ---------- writes ---------- */

export const serialize = obj => JSON.stringify(obj, null, 1) + '\n';

async function writeMany(pairs) {
  const changed = [];
  for (const [path, text] of pairs) {
    const f = store.files.get(path) || { path, text: '', base: null, sha: null, deleted: false };
    if (f.text === text && !f.deleted) continue;
    f.text = text; f.deleted = false;
    store.files.set(path, f);
    changed.push(f);
  }
  if (!changed.length) return;
  await fileDb.putMany(changed);
  rebuild();
  notify();
  scheduleSync();
}
export const writeFile = (path, text) => writeMany([[path, text]]);

export async function saveSession(session) {
  const { dirty, ...data } = session;
  await writeFile(sessionPath(session.datum), serialize(data));
}

export async function removeFile(path) {
  const f = store.files.get(path);
  if (!f) return;
  if (f.base == null) { store.files.delete(path); await fileDb.del(path); }
  else { f.deleted = true; await fileDb.put(f); }
  rebuild();
  notify();
  scheduleSync();
}
export const deleteSession = date => removeFile(sessionPath(date));

/** Apply a change to a JSON file (plan, calendar, media map) and save it. */
export async function updateJson(path, fallback, mutator) {
  const cur = parseJson(path, fallback);
  mutator(cur);
  await writeFile(path, serialize(cur));
}
export const savePlan = fn => updateJson('plan.json', DEFAULT_PLAN, fn);
export const saveKalendar = fn => updateJson('kalendar.json', DEFAULT_KALENDAR, fn);
export const saveMediaMap = fn => updateJson('media.json', { verze: 1, cviky: {} }, m => { if (!m.cviky) m.cviky = {}; fn(m.cviky); });

/** Files the repository lacks entirely get the built-in defaults (only after a successful pull). */
export async function ensureDefaults() {
  const pairs = [];
  if (!store.files.has('plan.json')) pairs.push(['plan.json', serialize(DEFAULT_PLAN)]);
  if (!store.files.has('cviky.json')) pairs.push(['cviky.json', serialize(DEFAULT_CVIKY)]);
  if (!store.files.has('kalendar.json')) pairs.push(['kalendar.json', serialize(DEFAULT_KALENDAR)]);
  if (pairs.length) await writeMany(pairs);
  return pairs.length;
}

/* ---------- binary media (own GIFs and videos) ---------- */

export async function putLocalMedia(path, blob, type) {
  const m = { path, blob, type, sha: null, pending: true, deleted: false };
  await mediaDb.put(m);
  store.mediaLocal.set(path, { path, sha: null, pending: true, deleted: false, type });
  notify();
  scheduleSync();
}
export async function deleteLocalMedia(path) {
  const cur = store.mediaLocal.get(path);
  if (store.mediaIndex[path]) {
    await mediaDb.put({ path, blob: null, type: '', sha: null, pending: true, deleted: true });
    store.mediaLocal.set(path, { path, sha: null, pending: true, deleted: true, type: '' });
  } else {
    await mediaDb.del(path);
    store.mediaLocal.delete(path);
  }
  notify();
  scheduleSync();
  return cur;
}
export async function cacheMedia(path, blob, type, sha) {
  await mediaDb.put({ path, blob, type, sha, pending: false, deleted: false });
  store.mediaLocal.set(path, { path, sha, pending: false, deleted: false, type });
}
export const readLocalMedia = path => mediaDb.get(path);
export function pendingMedia() { return [...store.mediaLocal.values()].filter(m => m.pending); }
export async function markMediaSynced(path, sha) {
  const rec = await mediaDb.get(path);
  if (!rec) return;
  if (rec.deleted) { await mediaDb.del(path); store.mediaLocal.delete(path); return; }
  rec.pending = false; rec.sha = sha;
  await mediaDb.put(rec);
  store.mediaLocal.set(path, { path, sha, pending: false, deleted: false, type: rec.type });
}
export async function setMediaIndex(idx) { store.mediaIndex = idx; await kv.set('mediaIndex', idx); }

/* ---------- pending changes ---------- */

export function pendingFiles() {
  return [...store.files.values()].filter(f => f.deleted ? f.base != null : (f.base == null || f.text !== f.base));
}
export const pendingCount = () => pendingFiles().length + pendingMedia().length;

/* ---------- connection & sync scheduling ---------- */

export async function setConn(conn) { store.conn = conn; await kv.set('conn', conn); notify(); }
export async function setHead(sha) { store.head = sha; await kv.set('head', sha); }
export async function setLastSync(t) { store.lastSync = t; await kv.set('lastSync', t); }
export async function resetLocal() {
  await fileDb.clear();
  await mediaDb.clear();
  store.files = new Map();
  store.mediaLocal = new Map();
  store.head = null;
  store.mediaIndex = {};
  await kv.del('head');
  await kv.del('mediaIndex');
  rebuild();
  notify();
}

let syncHook = null;
let syncTimer = null;
export function setSyncHook(fn) { syncHook = fn; }
export function scheduleSync(delay = 4000) {
  if (!syncHook) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncHook(), delay);
}

/** Persist the outcome of a sync: files changed in memory are written in one batch. */
export async function commitFiles(changed, removed) {
  if (changed.length) await fileDb.putMany(changed);
  if (removed.length) await fileDb.delMany(removed);
  rebuild();
  notify();
}
