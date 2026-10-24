// Dates, numbers and small text helpers.

const pad = n => String(n).padStart(2, '0');
export const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseKey = k => { const [y, m, d] = String(k).split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dayKey(d); };
export const today = () => dayKey(new Date());
export const dow = k => parseKey(k).getDay();
export const diffDays = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000);
export const isoNow = () => { const d = new Date(); return `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
/** Monday of the week containing k. */
export const weekStart = k => addDays(k, -((dow(k) + 6) % 7));

const fmtDM = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric' });
const fmtWDM = new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' });
const fmtLong = new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtMonth = new Intl.DateTimeFormat('cs-CZ', { month: 'long', year: 'numeric' });
const fmtDMY = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
export const dm = k => fmtDM.format(parseKey(k));
export const wdm = k => fmtWDM.format(parseKey(k));
export const longDay = k => fmtLong.format(parseKey(k));
export const monthName = k => fmtMonth.format(parseKey(k));
export const dmy = k => fmtDMY.format(parseKey(k));
export const DOW_SHORT = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];
export const DOW_LONG = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];

/** "dnes", "zítra", "včera" or a short date with weekday. */
export function relDay(k, ref = today()) {
  const d = diffDays(ref, k);
  if (d === 0) return 'dnes';
  if (d === 1) return 'zítra';
  if (d === -1) return 'včera';
  return wdm(k);
}

/** "zítra (čt 29. 10.)" or just "čt 29. 10." when there is no nicer word. */
export function relLong(k, ref = today()) {
  const r = relDay(k, ref), w = wdm(k);
  return r === w ? w : `${r} (${w})`;
}
/** Add a full stop unless the text already ends with one (dates do). */
export const dot = t => /[.!?]$/.test(t) ? t : t + '.';

export function plural(n, one, few, many) {
  const a = Math.abs(n);
  if (a === 1) return one;
  if (a >= 2 && a <= 4 && Number.isInteger(a)) return few;
  return many;
}

/** 72.5 → "72,5"; 70 → "70". */
export function num(x, digits = 1) {
  if (x == null || x === '' || !isFinite(x)) return '';
  const r = Math.round(Number(x) * 10 ** digits) / 10 ** digits;
  return String(r).replace('.', ',');
}
export const kg = x => (x == null || x === '' ? '–' : `${num(x)} kg`);

/** Parse "72,5" or "72.5" to 72.5, empty to null. */
export function parseNum(s) {
  if (s == null) return null;
  const t = String(s).trim().replace(',', '.').replace(/[−–]/g, '-');
  if (t === '' || t === '-') return null;
  const v = Number(t);
  return isFinite(v) ? v : null;
}

export function roundTo(x, step) {
  if (!step) return Math.round(x * 10) / 10;
  return Math.round(Math.round(x / step) * step * 100) / 100;
}

/** Estimated one-rep max (Epley). Only meaningful up to roughly 12 reps. */
export function e1rm(w, reps) {
  if (!w || !reps || w <= 0) return null;
  if (reps === 1) return w;
  return w * (1 + reps / 30);
}

export function mmss(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

export function norm(s) {
  return String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export const clone = o => JSON.parse(JSON.stringify(o));
