// Three-way merge of a JSON file changed both on the phone and in the repository.
// Calendar and media map merge key by key; other files keep the phone version and the
// repository version is saved as a copy in konflikty/ so nothing is lost.

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const parse = t => { try { return JSON.parse(t); } catch (e) { return null; } };
const ser = o => JSON.stringify(o, null, 1) + '\n';

/** Returns { text, conflict } where conflict is the remote text that could not be merged, or null. */
export function mergeFile(path, base, local, remote) {
  if (local === remote) return { text: remote, conflict: null };
  if (base == null) return { text: local, conflict: remote };
  if (local === base) return { text: remote, conflict: null };
  if (remote === base) return { text: local, conflict: null };
  const b = parse(base), l = parse(local), r = parse(remote);
  if (!b || !l || !r) return { text: local, conflict: remote };
  if (path === 'kalendar.json') {
    const out = { ...r, ...l };
    out.vychoziDny = same(l.vychoziDny, b.vychoziDny) ? r.vychoziDny : l.vychoziDny;
    out.dny = mergeKeys(b.dny || {}, l.dny || {}, r.dny || {});
    return { text: ser(sortDays(out)), conflict: null };
  }
  if (path === 'media.json') {
    const out = { ...r, ...l, cviky: mergeKeys(b.cviky || {}, l.cviky || {}, r.cviky || {}) };
    return { text: ser(out), conflict: null };
  }
  return { text: local, conflict: remote };
}

/** Key-wise three-way merge of a flat object; on a real clash the phone wins. */
export function mergeKeys(b, l, r) {
  const out = {};
  for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) {
    const inB = k in b, inL = k in l, inR = k in r;
    if (!inL && inB) { if (inR && !same(r[k], b[k])) out[k] = r[k]; continue; }   // removed on the phone
    if (!inR && inB) { if (inL && !same(l[k], b[k])) out[k] = l[k]; continue; }   // removed in the repository
    if (!inL) { out[k] = r[k]; continue; }
    if (!inR) { out[k] = l[k]; continue; }
    out[k] = same(l[k], b[k]) ? r[k] : l[k];
  }
  return out;
}

function sortDays(k) {
  const dny = {};
  Object.keys(k.dny || {}).sort().forEach(d => { dny[d] = k.dny[d]; });
  return { ...k, dny };
}
