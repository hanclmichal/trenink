// Training editor: tick off sets, log load / reps / RIR, notes, swap or add exercises, finish.
// Keeps its own working copy so typing is never interrupted by a re-render; external changes
// (a sync that brought a newer version) are picked up when nothing is being edited.
import { store, saveSession, deleteSession, savePlan } from '../store.js';
import { h, put, icon, toast, openSheet, closeSheet, confirmSheet, numInput, chip } from '../ui.js';
import { SKUPINY, SVALY, KARDIO_DRUHY, KARDIO_POLE } from '../data.js';
import { makeExercise, warmup, dayName, isReturnPhase, recordsIn, sessionProgress, slotEntry, doneSets, makeCardio, kardioPlan, cardioDone, lastCardio, timeRange } from '../program.js';
import { factCard, dailyPool } from '../facts.js';
import { mountAnimation } from '../anim.js';
import { openExerciseSheet } from './exercise.js';
import { startRest, stopRest, keepAwake, unlockAudio } from '../timer.js';
import { longDay, dm, num, parseNum, isoNow, today, clone, norm, plural } from '../format.js';

const strip = s => { const { dirty, ...rest } = s; return rest; };
const pauseText = sec => sec % 60 === 0 ? `${sec / 60} min` : sec > 60 ? `${num(sec / 60)} min` : `${sec} s`;

export function goalText(ex, cvik) {
  const c = ex.cil || {};
  const unit = cvik && cvik.jednotka === 's' ? ' s' : '';
  const reps = c.opak ? (c.opak[0] === c.opak[1] ? `${c.opak[0]}${unit}` : `${c.opak[0]}–${c.opak[1]}${unit}`) : '';
  let t = `${c.serie} × ${reps}`;
  if (c.backoff) t += ` + ${c.backoff.serie} × ${c.opak[0]} lehčí`;
  if (cvik && cvik.strana) t += ' na stranu';
  if (c.rir != null) t += ` · RIR ${c.rir}`;
  if (c.pauza) t += ` · pauza ${pauseText(c.pauza)}`;
  return t;
}

export function thumb(cvik) {
  const box = h('span', { class: 'thumb', 'aria-hidden': 'true' });
  const a = mountAnimation(box, cvik, { autoplay: false });
  if (a) { a.renderAt(0.55); a.fit(); } else box.append(icon('dumbbell'));
  return box;
}

export function sessionEditor(root, date, nav, opts = {}) {
  let local = null, lastSaved = '', saveTimer = 0;
  const cards = [], kcards = [];
  let headEl = null, finishEl = null;
  const isToday = date === today();

  function load() {
    const s = store.sessions.get(date);
    if (!s) return false;
    local = clone(strip(s));
    lastSaved = JSON.stringify(local);
    return true;
  }
  function save(now = false) {
    clearTimeout(saveTimer);
    const run = () => { const txt = JSON.stringify(local); if (txt === lastSaved) return; lastSaved = txt; saveSession(local); };
    if (now) run(); else saveTimer = setTimeout(run, 500);
  }

  /* ---------- header ---------- */
  function renderHead() {
    const p = sessionProgress(local);
    const pct = p.total ? Math.round(p.done / p.total * 100) : 0;
    const tr = timeRange(local);
    const el = h('div', { class: 'shead' },
      h('div', { class: 'shead__top' },
        h('p', { class: 'shead__date', text: longDay(date) }),
        h('button', { class: 'shead__time', type: 'button', 'aria-label': tr ? `Čas tréninku ${tr}, upravit` : 'Zadat čas tréninku', onclick: openTime }, icon('clock'), tr || 'Zadat čas')),
      h('h1', { class: 'shead__title' }, `${local.den} · ${dayName(local.den)}`),
      h('div', { class: 'chips' },
        chip(`týden ${local.varianta}`, 'chip--soft'),
        local.stav === 'hotovo' ? chip('Hotovo', 'chip--ok') : chip(p.done ? 'Probíhá' : 'Připraveno', 'chip--soft'),
        h('span', { class: 'muted small', text: `${p.done}/${p.total} sérií` })),
      h('div', { class: 'pbar', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: { width: pct + '%' } })));
    if (headEl) headEl.replaceWith(el);
    headEl = el;
    return el;
  }

  /* ---------- exercise card ---------- */
  function setLabel(ex, j) {
    const work = ex.serie.filter(s => s.typ !== 'backoff').length;
    return ex.serie[j].typ === 'backoff' ? `L${j - work + 1}` : String(j + 1);
  }

  function card(i) {
    const ex = local.cviky[i];
    const cvik = store.cvik.get(ex.cvik) || { id: ex.cvik, nazev: ex.cvik, hlavni: [], vedlejsi: [] };
    const timed = cvik.jednotka === 's';
    const allDone = ex.serie.length && ex.serie.every(s => s.hotovo);
    const el = h('article', { class: 'excard' + (allDone ? ' excard--done' : '') + (ex.vynechano ? ' excard--skip' : '') + (ex.superserie ? ' excard--ss' : ''), 'data-i': i });
    if (ex.superserie) el.append(h('p', { class: 'excard__ss', text: 'Supersérie s předchozím cvikem: střídej je bez pauzy.' }));
    const head = h('header', { class: 'excard__h' },
      h('button', { class: 'excard__name', type: 'button', onclick: () => openExerciseSheet(ex.cvik) },
        thumb(cvik),
        h('span', { class: 'excard__nt' }, h('b', { text: cvik.nazev }), h('small', { text: (cvik.hlavni || []).map(m => SVALY[m] || m).join(', ') }))),
      h('button', { class: 'iconbtn iconbtn--quiet', type: 'button', 'aria-label': 'Vyměnit cvik', onclick: () => openSwap(i) }, icon('swap')),
      h('button', { class: 'iconbtn iconbtn--quiet', type: 'button', 'aria-label': 'Další možnosti', onclick: () => openMenu(i) }, icon('more')));
    el.append(head);
    if (ex.vynechano) {
      el.append(h('div', { class: 'excard__skip' }, h('span', { class: 'muted', text: 'Dnes vynecháno' }),
        h('button', { class: 'linkbtn', type: 'button', onclick: () => { ex.vynechano = false; save(true); rerenderCard(i); refreshHead(); } }, 'Vrátit')));
      return el;
    }
    el.append(h('p', { class: 'excard__goal', text: goalText(ex, cvik) + (ex.puvodni && store.cvik.get(ex.puvodni) ? ` · místo: ${store.cvik.get(ex.puvodni).nazev}` : '') }));
    if (ex.navrh && (ex.navrh.text || ex.navrh.minule)) {
      el.append(h('div', { class: 'excard__hint' },
        ex.navrh.minule ? h('p', { class: 'muted', text: ex.navrh.minule }) : null,
        ex.navrh.text ? h('p', { text: ex.navrh.text }) : null));
    }
    let warmEl = null;
    const warmText = () => { const first = ex.serie.find(s => s.typ !== 'backoff'); return warmup(first && first.kg, ex.cvik).map(x => `${num(x.kg)} × ${x.opak}`).join(' · '); };
    if (ex.hlavni) {
      warmEl = h('span', { text: warmText() });
      el.append(h('p', { class: 'excard__warm' }, h('b', { text: 'Nájezd: ' }), warmEl));
    }
    const sets = h('div', { class: 'sets' });
    const kgInputs = [];
    ex.serie.forEach((st, j) => {
      const row = h('div', { class: 'set' + (st.hotovo ? ' set--done' : '') + (st.typ === 'backoff' ? ' set--bo' : '') });
      const kgIn = numInput(st.kg, { 'aria-label': `Série ${j + 1}: váha v kg`, placeholder: cvik.vlastniVaha ? '0' : '' });
      kgInputs[j] = kgIn;
      kgIn.addEventListener('focus', () => kgIn.select());
      kgIn.addEventListener('input', () => {
        const old = st.kg, v = parseNum(kgIn.value);
        st.kg = v;
        // later sets that still carried the old load follow the change
        for (let m = j + 1; m < ex.serie.length; m++) {
          const o = ex.serie[m];
          if (!o.hotovo && o.typ === st.typ && o.kg === old) { o.kg = v; kgInputs[m].value = kgIn.value; }
        }
        if (warmEl) warmEl.textContent = warmText();
        save();
      });
      const repIn = numInput(st.opak, { inputmode: 'numeric', 'aria-label': `Série ${j + 1}: ${timed ? 'sekundy' : 'opakování'}`, placeholder: timed ? 's' : 'opak.' });
      repIn.addEventListener('focus', () => repIn.select());
      repIn.addEventListener('input', () => { const v = parseNum(repIn.value); st.opak = v == null ? null : Math.round(v); save(); });
      const rir = h('select', { class: 'rir', 'aria-label': `Série ${j + 1}: RIR, kolik opakování zbylo v záloze` },
        h('option', { value: '', text: 'RIR –' }), [0, 1, 2, 3, 4, 5].map(n => h('option', { value: String(n), text: `RIR ${n}${n === 5 ? '+' : ''}` })));
      rir.value = st.rir == null ? '' : String(st.rir);
      rir.addEventListener('change', () => { st.rir = rir.value === '' ? null : Number(rir.value); save(); });
      const done = h('button', { class: 'set__ok', type: 'button', 'aria-pressed': String(!!st.hotovo), 'aria-label': `Série ${j + 1} hotová` }, icon('check'));
      done.addEventListener('click', () => toggleSet(i, j, row, done));
      row.append(
        h('span', { class: 'set__n', text: setLabel(ex, j) }),
        timed ? h('span', { class: 'set__nokg', text: 'výdrž' }) : h('label', { class: 'set__f' }, kgIn, h('span', { text: cvik.vlastniVaha ? '+kg' : 'kg' })),
        h('span', { class: 'set__x', text: timed ? '' : '×' }),
        h('label', { class: 'set__f set__f--r' }, repIn, h('span', { text: timed ? 's' : 'op.' })),
        rir, done);
      sets.append(row);
    });
    el.append(sets);
    const noteBtn = h('button', { class: 'linkbtn', type: 'button' }, ex.poznamka ? 'Poznámka' : '+ Jak to šlo');
    const note = h('textarea', { class: 'field note-ta', rows: 2, placeholder: 'Jak to šlo? Technika, pocit, bolest…', hidden: !ex.poznamka, value: ex.poznamka || '' });
    note.value = ex.poznamka || '';
    note.addEventListener('input', () => { ex.poznamka = note.value; save(); });
    noteBtn.addEventListener('click', () => { note.hidden = false; noteBtn.hidden = true; note.focus(); });
    if (ex.poznamka) noteBtn.hidden = true;
    el.append(h('div', { class: 'excard__foot' }, noteBtn, h('button', { class: 'linkbtn', type: 'button', onclick: () => addSet(i) }, '+ Série')), note);
    return el;
  }

  function toggleSet(i, j, row, btn) {
    const ex = local.cviky[i];
    const st = ex.serie[j];
    st.hotovo = !st.hotovo;
    if (st.hotovo && (st.opak == null)) st.opak = ex.cil && ex.cil.opak ? ex.cil.opak[0] : null;
    if (!local.zacatek && st.hotovo && isToday) local.zacatek = isoNow();
    row.classList.toggle('set--done', st.hotovo);
    btn.setAttribute('aria-pressed', String(st.hotovo));
    save(true);
    const allDone = ex.serie.every(s => s.hotovo);
    cards[i].classList.toggle('excard--done', allDone);
    refreshHead();
    if (st.hotovo && isToday) {
      unlockAudio();
      const next = local.cviky[i + 1];
      const lastOverall = local.cviky.every((e, k) => e.vynechano || e.serie.every(s => s.hotovo));
      const toPartner = next && next.superserie && !next.vynechano && next.serie.some(s => !s.hotovo);
      if (!lastOverall && !toPartner) {
        const cvik = store.cvik.get(ex.cvik);
        startRest((ex.cil && ex.cil.pauza) || 90, cvik ? cvik.nazev : '');
      } else if (toPartner) toast(`Teď ${store.cvik.get(next.cvik)?.nazev || 'druhý cvik'}, bez pauzy.`, 2000);
      if (lastOverall) {
        stopRest();
        const k = (local.kardio || []).findIndex(x => !x.hotovo);
        if (k >= 0 && kcards[k]) { toast('Série hotové. Teď kardio.', 2200); kcards[k].scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        else { finishEl?.classList.add('finish--ready'); finishEl?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      }
    }
  }

  function addSet(i) {
    const ex = local.cviky[i];
    const work = ex.serie.filter(s => s.typ !== 'backoff');
    const last = work[work.length - 1] || ex.serie[ex.serie.length - 1] || {};
    const idx = work.length;
    ex.serie.splice(idx, 0, { kg: last.kg ?? null, opak: last.opak ?? (ex.cil ? ex.cil.opak[0] : null), rir: null, hotovo: false });
    save(true); rerenderCard(i); refreshHead();
  }

  function rerenderCard(i) {
    const n = card(i);
    cards[i].replaceWith(n);
    cards[i] = n;
  }

  /* ---------- time ---------- */
  function openTime() {
    const hm = v => (v ? v.slice(11, 16) : '');
    const a = h('input', { class: 'field', type: 'time', value: hm(local.zacatek) });
    const b = h('input', { class: 'field', type: 'time', value: hm(local.konec) });
    const msg = h('p', { class: 'warn small', role: 'alert' });
    openSheet('Čas tréninku', [
      h('div', { class: 'two' },
        h('label', { class: 'form__row' }, h('span', { class: 'form__label', text: 'Začátek' }), a),
        h('label', { class: 'form__row' }, h('span', { class: 'form__label', text: 'Konec' }), b)),
      h('p', { class: 'muted small', text: 'Začátek se zapíše sám první odškrtnutou sérií, konec tlačítkem Dokončit trénink. Prázdné pole čas smaže.' }),
      msg,
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => closeSheet() }, 'Zrušit'),
        h('button', { class: 'btn btn--primary', type: 'button', onclick: () => {
          const va = a.value, vb = b.value;
          if (va && vb && vb <= va) { msg.textContent = 'Konec musí být po začátku.'; return; }
          local.zacatek = va ? `${date}T${va}` : null;
          local.konec = vb ? `${date}T${vb}` : null;
          save(true); renderHead(); closeSheet();
          toast(timeRange(local) ? `Čas uložen: ${timeRange(local)}.` : 'Čas smazán.');
        } }, 'Uložit'))]);
  }

  /* ---------- cardio ---------- */
  function cardioCard(k) {
    const kd = local.kardio[k];
    const plan = kardioPlan();
    const def = KARDIO_DRUHY[kd.druh] || { nazev: kd.druh, pole: [] };
    const el = h('article', { class: 'excard excard--cardio' + (kd.hotovo ? ' excard--done' : '') });
    const sel = h('select', { class: 'kselect', 'aria-label': 'Stroj' }, Object.entries(KARDIO_DRUHY).map(([id, d]) => h('option', { value: id, text: d.nazev })));
    sel.value = kd.druh;
    sel.addEventListener('change', () => {
      const prev = lastCardio(date, sel.value);
      Object.assign(kd, { druh: sel.value, rychlost: prev ? prev.rychlost ?? null : null, sklon: prev ? prev.sklon ?? null : null, uroven: prev ? prev.uroven ?? null : null });
      save(true); rerenderCardio(k);
    });
    el.append(h('header', { class: 'excard__h' },
      h('span', { class: 'thumb thumb--ico', 'aria-hidden': 'true' }, icon('run')),
      h('span', { class: 'excard__nt' }, h('b', { text: 'Kardio po tréninku' }), sel),
      h('button', { class: 'iconbtn iconbtn--quiet', type: 'button', 'aria-label': 'Odebrat kardio', onclick: () => confirmSheet('Odebrat kardio?', 'Kardio zmizí z tohoto tréninku.', 'Odebrat', () => { local.kardio.splice(k, 1); save(true); rerenderAll(); }, true) }, icon('trash'))));
    if (plan.popis) el.append(h('p', { class: 'excard__goal', text: plan.popis }));
    const prev = lastCardio(date, kd.druh);
    if (prev) {
      const bits = [`${prev.minuty} min`, ...def.pole.filter(f => prev[f] != null).map(f => `${num(prev[f])}${KARDIO_POLE[f].jednotka ? ' ' + KARDIO_POLE[f].jednotka : ''}`)];
      el.append(h('div', { class: 'excard__hint' }, h('p', { class: 'muted', text: `Minule: ${bits.join(', ')}` })));
    }
    const field = (key, label, unit, attrs = {}) => {
      const inp = numInput(kd[key], { 'aria-label': `${label}${unit ? ' (' + unit + ')' : ''}`, ...attrs });
      inp.addEventListener('focus', () => inp.select());
      inp.addEventListener('input', () => {
        const v = parseNum(inp.value);
        kd[key] = key === 'minuty' || key === 'tep' ? (v == null ? null : Math.round(v)) : v;
        if (key === 'minuty') timerLabel.textContent = `Odpočet ${kd.minuty || plan.minuty} min`;
        save();
      });
      return h('label', { class: 'kf' }, h('span', { class: 'kf__l', text: label }), h('span', { class: 'set__f' }, inp, h('span', { text: unit })));
    };
    el.append(h('div', { class: 'kfields' },
      field('minuty', 'Čas', 'min', { inputmode: 'numeric' }),
      def.pole.map(p => field(p, KARDIO_POLE[p].nazev, KARDIO_POLE[p].jednotka)),
      field('tep', 'Tep (nepovinné)', '', { inputmode: 'numeric' })));
    const ok = h('button', { class: 'btn ' + (kd.hotovo ? 'btn--primary' : ''), type: 'button', 'aria-pressed': String(!!kd.hotovo) }, icon('check'), kd.hotovo ? 'Hotovo' : 'Odškrtnout');
    const timerLabel = h('span', { text: `Odpočet ${kd.minuty || plan.minuty} min` });
    ok.addEventListener('click', () => {
      kd.hotovo = !kd.hotovo;
      if (kd.hotovo && !kd.minuty) kd.minuty = plan.minuty;
      save(true); rerenderCardio(k); refreshHead();
      if (kd.hotovo) {
        stopRest();
        const setsDone = local.cviky.every(e => e.vynechano || e.serie.every(s => s.hotovo));
        if (setsDone && (local.kardio || []).every(x => x.hotovo)) { finishEl?.classList.add('finish--ready'); finishEl?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      }
    });
    el.append(h('div', { class: 'kact' },
      h('button', { class: 'btn', type: 'button', onclick: () => { unlockAudio(); startRest((kd.minuty || plan.minuty) * 60, def.nazev, 'kardio'); } }, icon('timer'), timerLabel),
      ok));
    const noteBtn = h('button', { class: 'linkbtn', type: 'button', hidden: !!kd.poznamka }, '+ Jak to šlo');
    const note = h('textarea', { class: 'field note-ta', rows: 2, placeholder: 'Jak to šlo? Tempo, dech, pocit…', hidden: !kd.poznamka });
    note.value = kd.poznamka || '';
    note.addEventListener('input', () => { kd.poznamka = note.value; save(); });
    noteBtn.addEventListener('click', () => { note.hidden = false; noteBtn.hidden = true; note.focus(); });
    el.append(h('div', { class: 'excard__foot' }, noteBtn), note);
    return el;
  }
  function rerenderCardio(k) {
    const n = cardioCard(k);
    kcards[k].replaceWith(n);
    kcards[k] = n;
  }
  function addCardio() {
    local.kardio = local.kardio || [];
    local.kardio.push(makeCardio(date));
    save(true); rerenderAll();
    kcards[kcards.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function refreshHead() { if (headEl) renderHead(); renderFinish(); }

  /* ---------- swap / menu / add ---------- */
  function openSwap(i) {
    const ex = local.cviky[i];
    const cur = store.cvik.get(ex.cvik);
    const alts = store.cviky.filter(x => x.skupina === ex.skupina && x.id !== ex.cvik);
    const list = h('ul', { class: 'choices' }, alts.map(a => h('li', null, h('button', { type: 'button', onclick: () => chooseScope(i, a) },
      thumb(a), h('span', { class: 'pick__t' }, h('b', { text: a.nazev }), h('small', { text: (a.hlavni || []).map(m => SVALY[m] || m).join(', ') }))))));
    openSheet(`Vyměnit: ${cur ? cur.nazev : ex.cvik}`, [
      h('p', { class: 'muted small', text: `Cviky ze skupiny ${SKUPINY[ex.skupina] || ex.skupina}. Výchozí váhu navrhnu podle tvé historie.` }),
      alts.length ? list : h('p', { text: 'Pro tuto skupinu žádná náhrada není.' })]);
  }
  function chooseScope(i, alt) {
    const ex = local.cviky[i];
    const doSwap = permanent => {
      closeSheet(); closeSheet();
      const plan = store.plan.dny[local.den];
      const slot = plan && ex.slot != null ? plan.sloty[ex.slot] : null;
      const slotLike = slot ? { ...slot } : { skupina: ex.skupina, serie: ex.cil.serie, opak: ex.cil.opak, rir: ex.cil.rir, pauza: ex.cil.pauza, hlavni: ex.hlavni, backoff: ex.cil.backoff };
      const n = makeExercise(alt.id, slotLike, date, { slotIndex: ex.slot });
      n.puvodni = ex.puvodni || ex.cvik;
      if (n.puvodni === alt.id) delete n.puvodni;
      if (ex.superserie) n.superserie = true;
      local.cviky[i] = n;
      save(true); rerenderCard(i); refreshHead();
      if (permanent && slot) {
        savePlan(p => {
          const sl = p.dny[local.den].sloty[ex.slot];
          const k = (local.varianta - 1) % sl.cviky.length;
          sl.cviky[k] = alt.id;
        });
        toast(`${alt.nazev} je teď v plánu natrvalo (${local.den}, týden ${local.varianta}).`);
      } else toast(`Dnes místo toho: ${alt.nazev}.`);
    };
    if (ex.slot == null) { doSwap(false); return; }
    openSheet(alt.nazev, [
      h('p', { class: 'muted', text: 'Má výměna platit jen pro dnešní trénink, nebo i do budoucna?' }),
      h('div', { class: 'menu' },
        h('button', { type: 'button', onclick: () => doSwap(false) }, icon('today'), 'Jen dnes'),
        h('button', { type: 'button', onclick: () => doSwap(true) }, icon('calendar'), `Natrvalo v plánu (${local.den}, týden ${local.varianta})`))]);
  }

  function openMenu(i) {
    const ex = local.cviky[i];
    const cvik = store.cvik.get(ex.cvik);
    const act = fn => () => { closeSheet(); fn(); save(true); rerenderAll(); };
    openSheet(cvik ? cvik.nazev : ex.cvik, h('div', { class: 'menu' },
      h('button', { type: 'button', onclick: () => { closeSheet(); openExerciseSheet(ex.cvik); } }, icon('info'), 'Jak se cvik dělá'),
      h('button', { type: 'button', onclick: act(() => addSet(i)) }, icon('plus'), 'Přidat sérii'),
      ex.serie.length > 1 ? h('button', { type: 'button', onclick: act(() => { const k = ex.serie.map(s => s.hotovo).lastIndexOf(false); ex.serie.splice(k >= 0 ? k : ex.serie.length - 1, 1); }) }, icon('minus'), 'Odebrat sérii') : null,
      i > 0 ? h('button', { type: 'button', onclick: act(() => { local.cviky.splice(i - 1, 0, local.cviky.splice(i, 1)[0]); }) }, icon('back'), 'Posunout výš') : null,
      h('button', { type: 'button', onclick: act(() => { ex.vynechano = !ex.vynechano; }) }, icon('skip'), ex.vynechano ? 'Vrátit do tréninku' : 'Dnes vynechat'),
      ex.slot == null ? h('button', { class: 'danger', type: 'button', onclick: act(() => { local.cviky.splice(i, 1); }) }, icon('trash'), 'Odebrat z tréninku') : null));
  }

  function openAdd() {
    const q = h('input', { class: 'search__in', type: 'search', placeholder: 'Hledat cvik nebo partii', autocomplete: 'off' });
    const list = h('div');
    const draw = () => {
      const t = norm(q.value.trim());
      const groups = Object.keys(SKUPINY);
      put(list, groups.map(g => {
        const items = store.cviky.filter(c => c.skupina === g && (!t || norm(`${c.nazev} ${c.en} ${(c.hlavni || []).map(m => SVALY[m]).join(' ')}`).includes(t)));
        if (!items.length) return null;
        return [h('h3', { class: 'group__h', text: SKUPINY[g] }), h('ul', { class: 'choices' }, items.map(c => h('li', null, h('button', { type: 'button', onclick: () => {
          closeSheet();
          local.cviky.push(makeExercise(c.id, { skupina: c.skupina, serie: 3, opak: c.jednotka === 's' ? [30, 45] : [8, 12], rir: 2, pauza: 90 }, date));
          save(true); rerenderAll();
          toast(`Přidáno: ${c.nazev}`);
        } }, thumb(c), h('span', { class: 'pick__t' }, h('b', { text: c.nazev }), h('small', { text: (c.hlavni || []).map(m => SVALY[m] || m).join(', ') }))))))];
      }));
    };
    q.addEventListener('input', draw);
    openSheet('Přidat cvik', [h('label', { class: 'search' }, icon('search'), q), list], { full: true });
    draw();
  }

  /* ---------- finish ---------- */
  function renderFinish() {
    const p = sessionProgress(local);
    const done = local.stav === 'hotovo';
    const pocit = h('div', { class: 'seg', role: 'group', 'aria-label': 'Jak se cítíš po tréninku' },
      [['1', 'Těžké'], ['2', 'Slabší'], ['3', 'Normál'], ['4', 'Dobré'], ['5', 'Skvělé']].map(([v, l]) =>
        h('button', { type: 'button', 'aria-pressed': String(String(local.pocit) === v), onclick: ev => { local.pocit = local.pocit === Number(v) ? null : Number(v); save(true); renderFinish(); } }, l)));
    const note = h('textarea', { class: 'field', rows: 2, placeholder: 'Poznámka k tréninku (spánek, energie, co příště jinak)' });
    note.value = local.poznamka || '';
    note.addEventListener('input', () => { local.poznamka = note.value; save(); });
    const el = h('section', { class: 'finish' + (!done && p.total && p.done === p.total ? ' finish--ready' : '') },
      h('div', { class: 'two' },
        h('button', { class: 'btn', type: 'button', onclick: openAdd }, icon('plus'), 'Přidat cvik'),
        h('button', { class: 'btn', type: 'button', onclick: addCardio }, icon('run'), 'Přidat kardio')),
      h('h3', { class: 'sec__h', text: 'Celkový pocit' }), pocit, note,
      done
        ? h('div', { class: 'row-actions row-actions--wrap' },
          h('button', { class: 'btn', type: 'button', onclick: () => { local.stav = 'rozpracovano'; local.konec = null; save(true); rerenderAll(); } }, 'Znovu otevřít'),
          h('button', { class: 'btn btn--danger-quiet', type: 'button', onclick: askDelete }, icon('trash'), 'Smazat trénink'))
        : h('div', { class: 'row-actions row-actions--wrap' },
          h('button', { class: 'btn btn--primary', type: 'button', onclick: finish }, icon('flag'), 'Dokončit trénink'),
          h('button', { class: 'btn btn--danger-quiet', type: 'button', onclick: askDelete }, 'Zrušit trénink')));
    if (finishEl) finishEl.replaceWith(el);
    finishEl = el;
    return el;
  }

  function askDelete() {
    const p = sessionProgress(local);
    confirmSheet('Smazat trénink?', p.done ? `Zápis ${p.done} ${plural(p.done, 'série', 'sérií', 'sérií')} z ${dm(date)} zmizí z telefonu i z úložiště.` : 'Trénink se smaže a vrátí se do plánu.', 'Smazat', async () => {
      clearTimeout(saveTimer); stopRest(); keepAwake(false);
      local = null;
      await deleteSession(date);
      toast('Trénink smazán.');
      if (opts.onDeleted) opts.onDeleted(); else nav.back('#/kalendar');
    }, true);
  }

  function finish() {
    const p = sessionProgress(local);
    const go = () => {
      local.stav = 'hotovo';
      if (isToday) local.konec = isoNow();
      save(true);
      stopRest(); keepAwake(false);
      rerenderAll();
      const recs = recordsIn(local);
      const vol = local.cviky.reduce((a, ex) => a + doneSets(ex).reduce((b, s) => b + (s.kg > 0 ? s.kg * s.opak : 0), 0), 0);
      const mins = local.zacatek ? Math.round((new Date(local.konec) - new Date(local.zacatek)) / 60000) : null;
      const kmin = cardioDone(local).reduce((a, k) => a + Number(k.minuty || 0), 0);
      const ids = local.cviky.filter(e => !e.vynechano && doneSets(e).length).map(e => e.cvik);
      openSheet('Trénink hotový', [
        h('div', { class: 'tiles' },
          h('div', { class: 'tile' }, h('b', { class: 'tile__v', text: String(p.done) }), h('span', { class: 'tile__d', text: plural(p.done, 'série', 'série', 'sérií') })),
          h('div', { class: 'tile' }, h('b', { class: 'tile__v', text: vol >= 1000 ? `${num(vol / 1000)} t` : `${num(vol)} kg` }), h('span', { class: 'tile__d', text: 'zvednuto celkem' })),
          mins && mins > 0 && mins < 400 ? h('div', { class: 'tile' }, h('b', { class: 'tile__v', text: `${mins} min` }), h('span', { class: 'tile__d', text: 'délka' })) : null,
          kmin ? h('div', { class: 'tile' }, h('b', { class: 'tile__v', text: `${kmin} min` }), h('span', { class: 'tile__d', text: 'kardio' })) : null),
        recs.length ? h('div', { class: 'note note--soft' }, h('strong', { text: 'Nové osobní rekordy' }), h('ul', { class: 'prs' }, recs.map(r => h('li', null, h('b', { text: r.cvik.nazev }), `: ${r.text}`)))) : null,
        factCard(dailyPool(ids, 'konec'), { title: 'Co ti dnešek dává do budoucna', small: true }),
        h('div', { class: 'row-actions' }, h('button', { class: 'btn btn--primary', type: 'button', onclick: () => closeSheet() }, 'Zavřít'))]);
    };
    const kOpen = (local.kardio || []).filter(k => !k.hotovo).length;
    if (p.done < p.total || kOpen) {
      const parts = [];
      if (p.done < p.total) parts.push(`Odškrtnuto ${p.done} z ${p.total} sérií.`);
      if (kOpen) parts.push('Kardio není odškrtnuté.');
      confirmSheet('Dokončit trénink?', `${parts.join(' ')} Neodškrtnuté položky se do statistik nepočítají.`, 'Dokončit', go);
    } else go();
  }

  /* ---------- whole view ---------- */
  function rerenderAll() {
    if (!local) return;
    headEl = null; finishEl = null; cards.length = 0; kcards.length = 0;
    const day = store.plan.dny[local.den] || {};
    const back = isReturnPhase(date) && store.plan.navrat;
    put(root,
      renderHead(),
      back && local.stav !== 'hotovo' ? h('div', { class: 'note note--soft' }, h('strong', { text: `Návrat po pauze (do ${dm(back.do)})` }), h('p', { text: back.popis || '' })) : null,
      (day.rozcvicka || []).length ? h('details', { class: 'warm' }, h('summary', { text: 'Rozcvička' }), h('ul', null, day.rozcvicka.map(t => h('li', { text: t })))) : null,
      h('div', { class: 'exlist' }, local.cviky.map((_, i) => { const c = card(i); cards[i] = c; return c; }),
        (local.kardio || []).map((_, k) => { const c = cardioCard(k); kcards[k] = c; return c; })),
      renderFinish());
    keepAwake(isToday && local.stav !== 'hotovo');
  }

  if (!load()) { put(root, h('div', { class: 'empty' }, h('h2', { text: 'Trénink nenalezen' }))); return {}; }
  rerenderAll();

  return {
    refresh() {
      // pick up changes made elsewhere (sync), unless the user is typing
      const s = store.sessions.get(date);
      if (!s) { if (local) { local = null; put(root, h('div', { class: 'empty' }, h('h2', { text: 'Trénink byl smazán' }))); } return; }
      const txt = JSON.stringify(strip(s));
      if (txt === lastSaved) return;
      const active = document.activeElement;
      if (active && root.contains(active) && /INPUT|TEXTAREA|SELECT/.test(active.tagName)) return;
      local = clone(strip(s)); lastSaved = txt; rerenderAll();
    },
    destroy() { clearTimeout(saveTimer); if (local) { const txt = JSON.stringify(local); if (txt !== lastSaved) { lastSaved = txt; saveSession(local); } } keepAwake(false); }
  };
}

export function render(root, params, nav) {
  const date = params[0];
  nav.setTitle(`Trénink ${dm(date)}`);
  const box = h('div', { class: 'narrow' });
  root.append(box);
  return sessionEditor(box, date, nav);
}
