// Synchronisation with the private GitHub repository through the Git Data API.
// Pull: download text files whose blob changed, merging with local edits; binary media are only indexed
// (downloaded on demand when an exercise is opened). Push: one commit with every local change,
// fast-forward only (retried after a fresh pull).
import {
  store, tracked, isMedia, setHead, setLastSync, commitFiles, pendingFiles, pendingMedia,
  readLocalMedia, markMediaSynced, setMediaIndex, cacheMedia, ensureDefaults, SESSION_RE
} from './store.js';
import { mergeFile } from './merge.js';
import { dm } from './format.js';

export class SyncError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const DEFAULT_API = 'https://api.github.com';

export function client(conn) {
  const api = (conn.api || DEFAULT_API).replace(/\/$/, '');
  const base = `/repos/${encodeURIComponent(conn.owner)}/${encodeURIComponent(conn.repo)}`;
  const branch = conn.branch || 'main';

  async function raw(method, path, body, accept = 'application/vnd.github+json') {
    let res;
    try {
      res = await fetch(api + path, {
        method,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${conn.token}`,
          Accept: accept,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (e) {
      throw new SyncError('offline', 'Bez připojení k internetu.');
    }
    if (res.ok) return res;
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch (e) { /* no body */ }
    if (res.status === 401) throw new SyncError('auth', 'Přístupový klíč neplatí nebo vypršel.');
    if (res.status === 403 && /rate limit/i.test(detail)) throw new SyncError('rate', 'GitHub dočasně omezil počet požadavků. Zkuste to za chvíli.');
    if (res.status === 403) throw new SyncError('forbidden', 'Klíč nemá oprávnění k zápisu do úložiště.');
    if (res.status === 404) throw new SyncError('notfound', 'Úložiště nebo větev nenalezeny, nebo k nim klíč nemá přístup.');
    if (res.status === 409) throw new SyncError('empty', 'Úložiště je prázdné. Vytvořte v něm na GitHubu aspoň soubor README.');
    if (res.status === 422) throw new SyncError('conflict', detail || 'Změnu nešlo zapsat.');
    throw new SyncError('server', `GitHub odpověděl chybou ${res.status}. ${detail}`.trim());
  }
  const req = async (method, path, body) => {
    const res = await raw(method, path, body);
    return res.status === 204 ? null : res.json();
  };

  return {
    repo: () => req('GET', base),
    head: async () => (await req('GET', `${base}/git/ref/heads/${encodeURIComponent(branch)}`)).object.sha,
    commit: sha => req('GET', `${base}/git/commits/${sha}`),
    tree: async sha => {
      const t = await req('GET', `${base}/git/trees/${sha}?recursive=1`);
      if (t.truncated) throw new SyncError('server', 'Úložiště je příliš velké pro načtení najednou.');
      return t.tree.filter(e => e.type === 'blob');
    },
    blob: async sha => decodeBase64((await req('GET', `${base}/git/blobs/${sha}`)).content),
    // raw bytes: no base64 overhead, so a GIF costs only its own size in mobile data
    blobRaw: async sha => (await raw('GET', `${base}/git/blobs/${sha}`, null, 'application/vnd.github.raw')).blob(),
    createBlob: b64 => req('POST', `${base}/git/blobs`, { content: b64, encoding: 'base64' }),
    createTree: (baseTree, entries) => req('POST', `${base}/git/trees`, { base_tree: baseTree, tree: entries }),
    createCommit: (message, tree, parents) => req('POST', `${base}/git/commits`, { message, tree, parents }),
    updateRef: sha => req('PATCH', `${base}/git/refs/heads/${encodeURIComponent(branch)}`, { sha, force: false })
  };
}

function decodeBase64(b64) {
  const bin = atob(String(b64 || '').replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  });
  await Promise.all(workers);
  return out;
}

/* ---------- state shared with the UI ---------- */

export const status = { running: false, phase: '', done: 0, total: 0, error: null, lastResult: null };
const statusListeners = new Set();
export function onStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); }
function setStatus(patch) { Object.assign(status, patch); statusListeners.forEach(fn => fn(status)); }

let running = null;
/** Run one full synchronisation (pull, then push). Concurrent calls share the same run. */
export function sync() {
  if (running) return running;
  running = (async () => {
    setStatus({ running: true, phase: 'Kontroluji změny', done: 0, total: 0, error: null });
    try {
      if (!store.conn || !store.conn.token) throw new SyncError('noconn', 'Aplikace zatím není připojená k úložišti.');
      const gh = client(store.conn);
      const result = { pulled: 0, pushed: 0, conflicts: 0 };
      for (let attempt = 0; attempt < 4; attempt++) {
        const pulled = await pull(gh);
        result.pulled += pulled.count;
        result.conflicts += pulled.conflicts;
        if (attempt === 0) await ensureDefaults();
        const pushed = await push(gh, pulled.treeSha);
        if (pushed !== 'retry') { result.pushed = pushed; break; }
      }
      await setLastSync(new Date().toISOString());
      setStatus({ running: false, phase: '', error: null, lastResult: result });
      return result;
    } catch (e) {
      const err = e instanceof SyncError ? e : new SyncError('unknown', e && e.message ? e.message : String(e));
      setStatus({ running: false, phase: '', error: err });
      throw err;
    } finally {
      running = null;
    }
  })();
  return running;
}

async function pull(gh) {
  const head = await gh.head();
  const commit = await gh.commit(head);
  const treeSha = commit.tree.sha;
  if (head === store.head) return { count: 0, conflicts: 0, treeSha, head };

  setStatus({ phase: 'Stahuji změny' });
  const all = await gh.tree(treeSha);
  const remote = all.filter(e => tracked(e.path));
  const remotePaths = new Set(remote.map(e => e.path));

  // binary media: remember what exists, drop cached copies that changed in the repository
  const idx = {};
  for (const e of all) if (isMedia(e.path)) idx[e.path] = e.sha;
  for (const m of store.mediaLocal.values()) {
    if (m.pending) continue;
    if (idx[m.path] !== m.sha) store.mediaLocal.delete(m.path);
  }
  await setMediaIndex(idx);

  const toFetch = remote.filter(e => { const f = store.files.get(e.path); return !f || f.sha !== e.sha; });
  setStatus({ total: toFetch.length, done: 0 });
  let done = 0;
  const texts = await pool(toFetch, 6, async e => {
    const t = await gh.blob(e.sha);
    setStatus({ done: ++done });
    return t;
  });

  const changed = [], removed = [];
  let conflicts = 0;
  toFetch.forEach((e, i) => {
    const remoteText = texts[i];
    const f = store.files.get(e.path);
    if (!f) {
      const nf = { path: e.path, text: remoteText, base: remoteText, sha: e.sha, deleted: false };
      store.files.set(e.path, nf); changed.push(nf); return;
    }
    const localChanged = f.deleted || f.base == null || f.text !== f.base;
    if (!localChanged || f.deleted) {
      Object.assign(f, { text: remoteText, base: remoteText, sha: e.sha, deleted: false });
      changed.push(f); return;
    }
    const m = mergeFile(e.path, f.base, f.text, remoteText);
    Object.assign(f, { text: m.text, base: remoteText, sha: e.sha });
    changed.push(f);
    if (m.conflict != null) {
      conflicts++;
      const name = e.path.replace(/^treninky\//, 'trenink-').replace(/\.json$/, '');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const cp = { path: `konflikty/${name}-${stamp}.json`, text: m.conflict, base: null, sha: null, deleted: false };
      store.files.set(cp.path, cp); changed.push(cp);
    }
  });
  for (const f of [...store.files.values()]) {
    if (!tracked(f.path) || remotePaths.has(f.path) || f.base == null) continue;
    const localChanged = !f.deleted && f.text !== f.base;
    if (localChanged) { Object.assign(f, { base: null, sha: null }); changed.push(f); }
    else { store.files.delete(f.path); removed.push(f.path); }
  }
  await commitFiles(changed, removed);
  await setHead(head);
  return { count: toFetch.length + removed.length, conflicts, treeSha, head };
}

async function push(gh, treeSha) {
  const pending = pendingFiles();
  const media = pendingMedia().filter(m => !m.deleted || store.mediaIndex[m.path]);
  if (!pending.length && !media.length) return 0;
  setStatus({ phase: 'Odesílám změny', done: 0, total: pending.length + media.length });
  const snapshot = pending.map(f => ({ path: f.path, deleted: !!f.deleted, text: f.text, base: f.base }));
  const entries = snapshot.map(s => s.deleted
    ? { path: s.path, mode: '100644', type: 'blob', sha: null }
    : { path: s.path, mode: '100644', type: 'blob', content: s.text });
  const mediaShas = [];
  for (const m of media) {
    if (m.deleted) { entries.push({ path: m.path, mode: '100644', type: 'blob', sha: null }); mediaShas.push([m.path, null]); continue; }
    const rec = await readLocalMedia(m.path);
    if (!rec || !rec.blob) continue;
    const b = await gh.createBlob(await blobToBase64(rec.blob));
    entries.push({ path: m.path, mode: '100644', type: 'blob', sha: b.sha });
    mediaShas.push([m.path, b.sha]);
    setStatus({ done: mediaShas.length });
  }
  if (!entries.length) return 0;
  const tree = await gh.createTree(treeSha, entries);
  const commit = await gh.createCommit(commitMessage(snapshot, mediaShas), tree.sha, [store.head]);
  try {
    await gh.updateRef(commit.sha);
  } catch (e) {
    if (e.code === 'conflict') return 'retry';
    throw e;
  }
  const newTree = (await gh.tree(tree.sha)).filter(e => tracked(e.path));
  const shaOf = new Map(newTree.map(e => [e.path, e.sha]));
  const changed = [], removed = [];
  for (const s of snapshot) {
    const f = store.files.get(s.path);
    if (s.deleted) {
      if (f && f.deleted) { store.files.delete(s.path); removed.push(s.path); }
      else if (f) { Object.assign(f, { base: null, sha: null }); changed.push(f); }
      continue;
    }
    if (!f) continue;
    Object.assign(f, { base: s.text, sha: shaOf.get(s.path) || null });
    changed.push(f);
  }
  const idx = { ...store.mediaIndex };
  for (const [path, sha] of mediaShas) {
    await markMediaSynced(path, sha);
    if (sha) idx[path] = sha; else delete idx[path];
  }
  await setMediaIndex(idx);
  await commitFiles(changed, removed);
  await setHead(commit.sha);
  setStatus({ done: entries.length });
  return entries.length;
}

/** Load a binary media file: from the phone if cached, otherwise from the repository once. */
export async function loadMedia(path) {
  const local = await readLocalMedia(path);
  const sha = store.mediaIndex[path];
  if (local && local.blob && !local.deleted && (local.pending || !sha || local.sha === sha)) return local.blob;
  if (!sha) return null;
  if (!store.conn) throw new SyncError('noconn', 'Aplikace není připojená k úložišti.');
  const gh = client(store.conn);
  const blob = await gh.blobRaw(sha);
  const type = typeFromPath(path) || blob.type;
  const typed = blob.type === type ? blob : new Blob([blob], { type });
  await cacheMedia(path, typed, type, sha);
  return typed;
}

export function typeFromPath(p) {
  const ext = String(p).split('.').pop().toLowerCase();
  return { gif: 'image/gif', webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' }[ext] || '';
}

export function commitMessage(snapshot, mediaShas = []) {
  const trainings = [], removed = [], other = [];
  for (const s of snapshot) {
    const m = s.path.match(SESSION_RE);
    if (m) {
      let label = dm(m[1]);
      try { const j = JSON.parse(s.deleted ? s.base : s.text); if (j && j.den) label += ` ${j.den}`; } catch (e) { /* plain date */ }
      (s.deleted ? removed : trainings).push(label);
      continue;
    }
    other.push({ 'plan.json': 'plán', 'cviky.json': 'knihovna cviků', 'kalendar.json': 'kalendář', 'media.json': 'videa ke cvikům', 'fakty.json': 'fakta' }[s.path] || s.path);
  }
  if (mediaShas.length) other.push(`média (${mediaShas.length})`);
  const parts = [];
  if (trainings.length) parts.push(`Trénink ${trainings.join(', ')}`);
  if (removed.length) parts.push(`Smazán trénink ${removed.join(', ')}`);
  if (other.length) parts.push(other.join(', ').replace(/^./, ch => ch.toUpperCase()));
  let subject = parts.join('; ') || 'Změny z telefonu';
  if (subject.length > 72) subject = subject.slice(0, 69).replace(/[,; ]+[^,; ]*$/, '') + '…';
  return `${subject}\n\nZměny z aplikace Trénink na telefonu:\n` + parts.map(p => `- ${p}`).join('\n') + '\n';
}

/** Check a new connection: the token must see the repository and be allowed to write. */
export async function testConnection(conn) {
  const gh = client(conn);
  const repo = await gh.repo();
  if (repo.permissions && repo.permissions.push === false) throw new SyncError('forbidden', 'Klíč má k úložišti jen čtení. Povolte mu Contents: Read and write.');
  await gh.head();
  return repo;
}
