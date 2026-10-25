// Training logic: rotation of days, calendar projection, building a session from the plan,
// weight suggestions, warm-up sets and the numbers behind the statistics.
import { store, sessionList } from './store.js';
import { PARTIE, DEFAULT_PLAN, KARDIO_DRUHY } from './data.js';
import { addDays, dow, today, roundTo, e1rm, num, diffDays, weekStart } from './format.js';

/* ---------- rotation ---------- */

export function order() { return Array.isArray(store.plan.poradi) && store.plan.poradi.length ? store.plan.poradi : Object.keys(store.plan.dny); }
export function variantCount() {
  let n = Number(store.plan.varianty) || 0;
  if (!n) for (const d of Object.values(store.plan.dny)) for (const s of d.sloty || []) n = Math.max(n, (s.cviky || []).length);
  return Math.max(1, n);
}
/** poradi 0,1,2 = A1,B1,C1; 3,4,5 = A2,B2,C2; then repeats. */
export function dayOf(poradi) {
  const o = order();
  const p = Math.max(0, poradi | 0);
  return { den: o[p % o.length], varianta: Math.floor(p / o.length) % variantCount() + 1 };
}
export function poradiOf(den, varianta) {
  const o = order();
  return (varianta - 1) * o.length + Math.max(0, o.indexOf(den));
}
export function cycleLength() { return order().length * variantCount(); }
export function dayName(den) { return (store.plan.dny[den] && store.plan.dny[den].nazev) || den; }
export const label = (den, varianta) => `${den} · ${dayName(den)}`;

/** Exercise entry of a slot for a variant: strings and { cvik, opak } objects are both allowed. */
export function slotEntry(slot, varianta) {
  const list = slot.cviky || [];
  if (!list.length) return null;
  const e = list[(varianta - 1) % list.length];
  return typeof e === 'string' ? { cvik: e } : { ...e };
}

/** The rotation index that follows the latest session on or before `date` (or overall). */
export function nextPoradi(date) {
  const list = sessionList().filter(s => !date || s.datum <= date);
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i].poradi;
    if (Number.isInteger(p)) return (p + 1) % cycleLength();
  }
  return 0;
}

/* ---------- calendar ---------- */

export function override(date) { return store.kalendar.dny[date] || null; }
export function isDefaultDay(date) { return (store.kalendar.vychoziDny || []).includes(dow(date)); }
export function isTrainingDay(date) {
  const o = override(date);
  return o === 'jdu' || (o !== 'nejdu' && isDefaultDay(date));
}

/** Upcoming planned trainings from `from` on: [{ datum, poradi, den, varianta, poSobe }]. */
export function projection(from = today(), count = 8) {
  const out = [];
  let p = nextPoradi();
  let prevTraining = store.sessions.has(addDays(from, -1)) || false;
  for (let i = 0; i < 180 && out.length < count; i++) {
    const d = addDays(from, i);
    if (store.sessions.has(d)) { prevTraining = true; continue; }
    if (isTrainingDay(d)) {
      out.push({ datum: d, poradi: p, ...dayOf(p), poSobe: prevTraining });
      p = (p + 1) % cycleLength();
      prevTraining = true;
    } else prevTraining = false;
  }
  return out;
}
export function plannedOn(date) {
  if (date < today()) return null;
  return projection(today(), 60).find(x => x.datum === date) || null;
}

/* ---------- history and suggestions ---------- */

export const doneSets = ex => (ex.serie || []).filter(s => s.hotovo && s.opak != null && s.opak > 0);
export const workSets = ex => doneSets(ex).filter(s => s.typ !== 'backoff');

/** Earlier performances of an exercise: [{ datum, ex, session }], newest first. */
export function history(cvikId, before) {
  const out = [];
  for (const s of sessionList()) {
    if (before && s.datum >= before) continue;
    for (const ex of s.cviky) if (ex.cvik === cvikId && !ex.vynechano && doneSets(ex).length) out.push({ datum: s.datum, ex, session: s });
  }
  return out.reverse();
}

export function isReturnPhase(date) {
  const n = store.plan.navrat;
  return !!(n && n.do && date <= n.do);
}
export function targetRir(slot, date) {
  if (slot.hlavni && isReturnPhase(date) && store.plan.navrat.rir != null) return store.plan.navrat.rir;
  return slot.rir;
}

/** Compact text of sets: "70 kg × 5, 5, 5, 4 + 2× 62,5 kg × 5". */
export function fmtSets(sets, cvik) {
  const unit = cvik && cvik.jednotka === 's' ? ' s' : '';
  const groups = [];
  for (const s of sets) {
    const key = `${s.typ === 'backoff' ? 'b' : 'p'}|${s.kg ?? ''}`;
    const g = groups[groups.length - 1];
    if (g && g.key === key) g.reps.push(s.opak);
    else groups.push({ key, kg: s.kg, reps: [s.opak], backoff: s.typ === 'backoff' });
  }
  return groups.map((g, i) => {
    const w = g.kg == null || (g.kg === 0 && cvik && cvik.vlastniVaha) ? (cvik && cvik.vlastniVaha ? 'vlastní váha' : '') : `${num(g.kg)} kg`;
    const r = g.reps.map(x => `${x}${unit}`).join(', ');
    return (i ? '+ ' : '') + (w ? `${w} × ${r}` : r);
  }).join(' ');
}

/** Suggested load and reps for the next performance of an exercise. */
export function suggest(cvikId, target, date, hlavni = false) {
  const cvik = store.cvik.get(cvikId) || {};
  const [lo, hi] = target.opak || [5, 5];
  const rir = target.rir ?? 2;
  const step = cvik.krok ?? 2.5;
  const timed = cvik.jednotka === 's';
  const prev = history(cvikId, date)[0];
  const startKg = hlavni && store.plan.start ? store.plan.start[cvikId] : null;
  if (!prev || !workSets(prev.ex).length) {
    if (timed) return { kg: null, opak: lo, text: `Začni na ${lo} s.`, prev: null };
    if (startKg != null) return { kg: startKg, opak: lo, text: `Výchozí váha podle plánu. Cíl RIR ${rir}.`, prev: null };
    return { kg: cvik.vlastniVaha ? 0 : null, opak: lo, text: `Poprvé: zvol váhu, se kterou zvládneš ${lo === hi ? lo : `${lo}–${hi}`} opakování a ještě ${rir} v záloze.`, prev: null };
  }
  const work = workSets(prev.ex);
  const prevText = `${prev.datum === addDays(date, -7) ? 'Před týdnem' : 'Minule'}: ${fmtSets(doneSets(prev.ex), cvik)}`;
  if (timed) {
    const best = Math.max(...work.map(s => s.opak));
    const allTop = work.every(s => s.opak >= hi);
    return { kg: null, opak: allTop ? best + 5 : Math.min(hi, best), text: allTop ? 'Všechny série v cíli: přidej 5 s.' : 'Drž stejný čas, dokud nebudou všechny série v cíli.', prev: prevText };
  }
  const top = Math.max(...work.map(s => s.kg ?? 0));
  const pc = prev.ex.cil && prev.ex.cil.opak;
  if (pc && (pc[0] !== lo || pc[1] !== hi) && step && top > 0) {
    // last time it was a different rep range (e.g. 4 × 5 as the main lift, now 3 × 8–10): go through the estimated max
    let best = 0;
    for (const s of work) if (s.kg > 0 && s.opak <= 12) best = Math.max(best, e1rm(s.kg, s.opak));
    if (best) {
      const kgEst = Math.floor(best / (1 + (lo + rir) / 30) / step) * step;
      return { kg: kgEst, opak: lo, text: `Minule jiný rozsah opakování. Odhad pro ${lo} opakování s RIR ${rir}: ${num(kgEst)} kg.`, prev: prevText };
    }
  }
  const atTop = work.filter(s => (s.kg ?? 0) === top);
  const minReps = Math.min(...atTop.map(s => s.opak));
  const lastRir = [...atTop].reverse().find(s => s.rir != null)?.rir ?? null;
  const r = lastRir ?? rir;
  // during the return phase an easy set (one rep more in reserve than the target) already earns the double jump
  const bigJump = rir + (hlavni && isReturnPhase(date) ? 1 : 2);
  const fmt = k => (k === 0 && cvik.vlastniVaha ? 'vlastní váhu' : `${num(k)} kg`);
  const fmtLoc = k => (k === 0 && cvik.vlastniVaha ? 'vlastní váze' : `${num(k)} kg`);
  if (minReps < lo) {
    return { kg: top, opak: lo, text: `Ne všechny série měly ${lo} opakování. Zopakuj ${fmt(top)}.`, prev: prevText };
  }
  if (lo === hi) {
    if (!step) return { kg: top, opak: lo + 1, text: 'Přidej opakování.', prev: prevText };
    if (r >= bigJump) return { kg: roundTo(top + 2 * step, step), opak: lo, text: `Šlo to lehce (RIR ${r}), přidej ${num(2 * step)} kg.`, prev: prevText };
    if (r >= rir) return { kg: roundTo(top + step, step), opak: lo, text: `Splněno, přidej ${num(step)} kg.`, prev: prevText };
    return { kg: top, opak: lo, text: `RIR ${r} byl pod cílem ${rir}. Zopakuj ${fmt(top)}.`, prev: prevText };
  }
  if (minReps >= hi && r >= rir) {
    if (!step) return { kg: top, opak: hi + 1, text: 'Horní hranice splněna, přidej opakování.', prev: prevText };
    return { kg: roundTo(top + step, step), opak: lo, text: `Horní hranice splněna, přidej ${num(step)} kg a začni zase na ${lo}.`, prev: prevText };
  }
  return { kg: top, opak: Math.min(hi, minReps + 1), text: `Zůstaň na ${fmtLoc(top)} a zkus o opakování víc (cíl ${hi}).`, prev: prevText };
}

/** Warm-up ramp for a main lift: bar, 50 %, 70 %, 85 %. */
export function warmup(kg, cvikId) {
  if (!kg || kg <= 30) return [];
  const bar = cvikId === 'deadlift' ? null : 20;
  const out = [];
  if (bar) out.push({ kg: bar, opak: 10 });
  for (const [p, r] of [[0.5, 5], [0.7, 3], [0.85, 1]]) {
    const w = roundTo(kg * p, 2.5);
    if (w <= (bar || 0) || w >= kg || out.some(x => x.kg === w)) continue;
    out.push({ kg: w, opak: r });
  }
  return out;
}

/* ---------- building sessions ---------- */

/** A fresh exercise entry for a session, with suggested values pre-filled. */
export function makeExercise(cvikId, slot, date, extra = {}) {
  const cil = {
    serie: slot.serie || 3,
    opak: (extra.opak || slot.opak || [8, 10]).slice(),
    rir: targetRir(slot, date),
    pauza: slot.pauza || 90,
    ...(slot.backoff ? { backoff: { ...slot.backoff } } : {})
  };
  const navrh = suggest(cvikId, cil, date, !!slot.hlavni);
  const step = (store.cvik.get(cvikId) || {}).krok || 2.5;
  const serie = [];
  for (let i = 0; i < cil.serie; i++) serie.push({ kg: navrh.kg, opak: navrh.opak, rir: null, hotovo: false });
  if (cil.backoff) {
    const bk = navrh.kg != null ? roundTo(navrh.kg * cil.backoff.podil, Math.max(2.5, step)) : null;
    for (let i = 0; i < cil.backoff.serie; i++) serie.push({ kg: bk, opak: cil.opak[0], rir: null, hotovo: false, typ: 'backoff' });
  }
  return {
    cvik: cvikId,
    slot: extra.slotIndex ?? null,
    skupina: slot.skupina || (store.cvik.get(cvikId) || {}).skupina || '',
    hlavni: !!slot.hlavni,
    ...(slot.superserie ? { superserie: true } : {}),
    cil,
    navrh: { kg: navrh.kg, text: navrh.text, minule: navrh.prev },
    serie,
    poznamka: ''
  };
}

export function buildSession(date, poradi) {
  const { den, varianta } = dayOf(poradi);
  const day = store.plan.dny[den] || { sloty: [] };
  const cviky = [];
  (day.sloty || []).forEach((slot, i) => {
    const e = slotEntry(slot, varianta);
    if (!e || !store.cvik.has(e.cvik)) return;
    cviky.push(makeExercise(e.cvik, slot, date, { slotIndex: i, opak: e.opak }));
  });
  const k = kardioPlan();
  return { datum: date, den, varianta, poradi, stav: 'rozpracovano', zacatek: null, konec: null, pocit: null, poznamka: '', cviky, kardio: k.zapnuto ? [makeCardio(date)] : [] };
}

/* ---------- cardio ---------- */

/** Cardio settings from the plan, with built-in defaults for anything missing. */
export function kardioPlan() {
  return { ...DEFAULT_PLAN.kardio, ...(store.plan.kardio || {}) };
}
export const cardioDone = s => (s.kardio || []).filter(k => k.hotovo && k.minuty > 0);

/** The latest finished cardio entry before a date (optionally of one machine). */
export function lastCardio(before, druh) {
  const list = sessionList().filter(s => s.datum < before);
  for (let i = list.length - 1; i >= 0; i--) {
    const k = cardioDone(list[i]).filter(x => !druh || x.druh === druh);
    if (k.length) return k[k.length - 1];
  }
  return null;
}

/** A new cardio entry: same machine and settings as last time, minutes from the plan. */
export function makeCardio(date, druh) {
  const plan = kardioPlan();
  const last = lastCardio(date, druh);
  const d = druh || (last && KARDIO_DRUHY[last.druh] ? last.druh : plan.druh);
  const prev = last && last.druh === d ? last : lastCardio(date, d);
  return {
    druh: d,
    minuty: plan.minuty,
    rychlost: prev ? prev.rychlost ?? null : null,
    sklon: prev ? prev.sklon ?? null : null,
    uroven: prev ? prev.uroven ?? null : null,
    tep: null,
    hotovo: false,
    poznamka: ''
  };
}

/** Cardio minutes per week for the last `weeks` weeks (oldest first). */
export function weeklyCardio(weeks = 12, ref = today()) {
  const start = addDays(weekStart(ref), -7 * (weeks - 1));
  const out = Array.from({ length: weeks }, (_, i) => ({ od: addDays(start, 7 * i), n: 0 }));
  for (const s of sessionList()) {
    if (s.datum < start) continue;
    const i = Math.floor(diffDays(start, s.datum) / 7);
    if (i >= 0 && i < weeks) out[i].n += cardioDone(s).reduce((a, k) => a + Number(k.minuty || 0), 0);
  }
  return out;
}

/** "11:22–12:09 · 47 min" from a session's start and end. */
export function timeRange(s) {
  const a = s.zacatek ? s.zacatek.slice(11, 16) : null;
  const b = s.konec ? s.konec.slice(11, 16) : null;
  if (!a && !b) return '';
  let t = a && b ? `${a}–${b}` : a ? `od ${a}` : `do ${b}`;
  if (a && b) {
    const m = Math.round((new Date(s.konec) - new Date(s.zacatek)) / 60000);
    if (m > 0 && m < 600) t += ` · ${m} min`;
  }
  return t;
}

/** Preview of what a planned day contains (no suggestions needed). */
export function previewDay(poradi) {
  const { den, varianta } = dayOf(poradi);
  const day = store.plan.dny[den] || { sloty: [] };
  return (day.sloty || []).map(slot => {
    const e = slotEntry(slot, varianta);
    const cvik = e && store.cvik.get(e.cvik);
    const opak = (e && e.opak) || slot.opak || [];
    return cvik ? { cvik, slot, opak } : null;
  }).filter(Boolean);
}

export function sessionProgress(s) {
  let total = 0, done = 0;
  for (const ex of s.cviky) { if (ex.vynechano) continue; total += ex.serie.length; done += ex.serie.filter(x => x.hotovo).length; }
  return { total, done };
}

/* ---------- statistics ---------- */

/** Per-session numbers for one exercise, oldest first. */
export function exerciseSeries(cvikId) {
  const out = [];
  for (const s of sessionList()) {
    for (const ex of s.cviky) {
      if (ex.cvik !== cvikId || ex.vynechano) continue;
      const done = doneSets(ex);
      if (!done.length) continue;
      const work = workSets(ex);
      const top = Math.max(...done.map(x => x.kg ?? 0));
      let best = null, bestSet = null;
      for (const x of done) {
        if (x.opak > 12 || x.kg == null || x.kg <= 0) continue;
        const v = e1rm(x.kg, x.opak);
        if (best == null || v > best) { best = v; bestSet = x; }
      }
      const vol = done.reduce((a, x) => a + (x.kg > 0 ? x.kg * x.opak : 0), 0);
      const reps = done.reduce((a, x) => a + x.opak, 0);
      const maxReps = Math.max(...done.map(x => x.opak));
      out.push({ datum: s.datum, top, e1rm: best, bestSet, vol, reps, maxReps, sets: done.length, work: work.length, ex });
    }
  }
  return out;
}

/** Personal records reached in a session compared to everything before it. */
export function recordsIn(session) {
  const out = [];
  for (const ex of session.cviky) {
    const cvik = store.cvik.get(ex.cvik);
    if (!cvik || ex.vynechano || !doneSets(ex).length) continue;
    const series = exerciseSeries(ex.cvik).filter(x => x.datum <= session.datum);
    const now = series.find(x => x.datum === session.datum);
    const before = series.filter(x => x.datum < session.datum);
    if (!now || !before.length) continue;
    if (cvik.jednotka === 's') {
      const b = Math.max(...before.map(x => x.maxReps));
      if (now.maxReps > b) out.push({ cvik, text: `nejdelší výdrž ${now.maxReps} s` });
      continue;
    }
    const bTop = Math.max(...before.map(x => x.top));
    const bE = Math.max(...before.map(x => x.e1rm || 0));
    if (now.top > bTop && now.top > 0) out.push({ cvik, text: `nejvyšší váha ${num(now.top)} kg` });
    else if (now.e1rm && bE && now.e1rm > bE + 0.01) out.push({ cvik, text: `nejlepší odhad maxima ${num(now.e1rm)} kg` });
  }
  return out;
}

/** Hard sets per muscle group between two dates (inclusive). Primary muscles count 1, secondary 0.5. */
export function volumeByGroup(from, to) {
  const res = Object.fromEntries(PARTIE.map(p => [p.id, 0]));
  for (const s of sessionList()) {
    if (s.datum < from || s.datum > to) continue;
    for (const ex of s.cviky) {
      if (ex.vynechano) continue;
      const cvik = store.cvik.get(ex.cvik);
      if (!cvik) continue;
      const n = doneSets(ex).length;
      if (!n) continue;
      for (const p of PARTIE) {
        if ((cvik.hlavni || []).some(m => p.svaly.includes(m))) res[p.id] += n;
        else if ((cvik.vedlejsi || []).some(m => p.svaly.includes(m))) res[p.id] += n / 2;
      }
    }
  }
  return res;
}

/** Number of finished or started trainings per week for the last `weeks` weeks (oldest first). */
export function weeklyCounts(weeks = 12, ref = today()) {
  const start = addDays(weekStart(ref), -7 * (weeks - 1));
  const out = Array.from({ length: weeks }, (_, i) => ({ od: addDays(start, 7 * i), n: 0 }));
  for (const s of sessionList()) {
    if (s.datum < start) continue;
    const i = Math.floor(diffDays(start, s.datum) / 7);
    if (i >= 0 && i < weeks && sessionProgress(s).done > 0) out[i].n++;
  }
  return out;
}
