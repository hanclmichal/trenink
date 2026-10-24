// Calendar: month grid with done, planned and skipped days; a day sheet to plan, move, start,
// back-fill or review a training. The day actions are shared with the Dnes view.
import { store, saveKalendar, saveSession, deleteSession } from '../store.js';
import { h, put, icon, toast, openSheet, closeSheet, confirmSheet, chip } from '../ui.js';
import { projection, plannedOn, isDefaultDay, override, dayOf, nextPoradi, buildSession, previewDay, dayName, cycleLength, fmtSets, doneSets, sessionProgress } from '../program.js';
import { today, addDays, dow, parseKey, dayKey, dm, wdm, longDay, relDay, relLong, dot, monthName, isoNow, DOW_SHORT, plural } from '../format.js';
import { goalText } from './session.js';

/* ---------- shared day actions ---------- */

export async function setGo(date, go) {
  await saveKalendar(k => {
    if (!k.dny) k.dny = {};
    const def = (k.vychoziDny || []).includes(dow(date));
    if (go === def) delete k.dny[date]; else k.dny[date] = go ? 'jdu' : 'nejdu';
  });
}

/** Skip a planned day and tell where the training moved; offer another day right away. */
export async function skipDay(date, nav) {
  const was = plannedOn(date);
  await setGo(date, false);
  const moved = was && projection(today(), 30).find(x => x.poradi === was.poradi);
  const msg = moved ? dot(`Trénink ${was.den} (${dayName(was.den)}) se posunul na ${relLong(moved.datum)}`) : 'Den je označený jako volný.';
  pickOtherDay(msg, date, nav);
}

export function pickOtherDay(msg, from, nav) {
  const days = [];
  for (let i = 0; i < 14 && days.length < 8; i++) {
    const d = addDays(today(), i);
    if (d === from || store.sessions.has(d) || plannedOn(d)) continue;
    days.push(d);
  }
  openSheet('Jiný den?', [
    h('p', { text: msg }),
    h('p', { class: 'muted small', text: 'Chceš si trénink dát jiný den? Vyber ho a pořadí tréninků zůstane zachované.' }),
    h('ul', { class: 'choices' }, days.map(d => h('li', null, h('button', { type: 'button', onclick: async () => {
      closeSheet(); await setGo(d, true);
      const p = plannedOn(d);
      toast(p ? `Naplánováno na ${relLong(d)}: ${p.den} · ${dayName(p.den)}` : dot(`Naplánováno na ${relLong(d)}`));
    } }, icon('calendar'), h('span', { class: 'pick__t' }, h('b', { text: relLong(d) }), h('small', { text: isDefaultDay(d) ? 'běžný tréninkový den' : '' })))))),
    h('div', { class: 'row-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => closeSheet() }, 'Nechat tak'))]);
}

/** Create a session for a date and open it. */
export async function startSession(date, poradi, nav) {
  if (!store.sessions.has(date)) {
    const s = buildSession(date, poradi);
    if (date === today()) s.zacatek = isoNow();
    await saveSession(s);
  }
  closeAllAnd(() => nav.go(date === today() ? '#/dnes' : `#/trenink/${date}`));
}
function closeAllAnd(fn) { while (document.querySelector('.sheet')) closeSheet(); fn(); }

/** Let the user pick which training (A1…C2) to do or log. */
export function chooseTraining(date, nav, title = 'Který trénink?') {
  const def = date >= today() ? (plannedOn(date)?.poradi ?? nextPoradi()) : nextPoradi(date);
  const n = cycleLength();
  const opts = [];
  for (let p = 0; p < n; p++) opts.push(p);
  opts.sort((a, b) => (a === def ? -1 : b === def ? 1 : 0));
  openSheet(title, h('ul', { class: 'choices' }, opts.map(p => {
    const d = dayOf(p);
    return h('li', null, h('button', { type: 'button', 'aria-selected': String(p === def), onclick: () => startSession(date, p, nav) },
      h('span', { class: 'daybadge', text: d.den }),
      h('span', { class: 'pick__t' }, h('b', { text: `${dayName(d.den)} · týden ${d.varianta}` }), h('small', { text: p === def ? 'podle pořadí na řadě' : previewDay(p).slice(1, 4).map(x => x.cvik.nazev).join(', ') }))));
  })));
}

export function previewList(poradi) {
  return h('ul', { class: 'plist' }, previewDay(poradi).map(x => h('li', null,
    h('b', { text: x.cvik.nazev }), h('span', { class: 'muted', text: goalText({ cil: { serie: x.slot.serie, opak: x.opak, backoff: x.slot.backoff } }, x.cvik) }))));
}

export function openDaySheet(date, nav) {
  const t = today();
  const sess = store.sessions.get(date);
  const plan = plannedOn(date);
  const ov = override(date);
  const body = [];
  let title = longDay(date);
  if (sess) {
    const p = sessionProgress(sess);
    title = `${wdm(date)} · ${sess.den} · ${dayName(sess.den)}`;
    body.push(h('div', { class: 'chips' }, chip(`týden ${sess.varianta}`, 'chip--soft'), sess.stav === 'hotovo' ? chip('Hotovo', 'chip--ok') : chip('Rozpracováno', 'chip--soft'), h('span', { class: 'muted small', text: `${p.done}/${p.total} sérií` })));
    body.push(h('ul', { class: 'plist' }, sess.cviky.filter(e => !e.vynechano).map(e => {
      const c = store.cvik.get(e.cvik) || { nazev: e.cvik };
      const d = doneSets(e);
      return h('li', null, h('b', { text: c.nazev }), h('span', { class: 'muted', text: d.length ? fmtSets(d, c) : 'neodškrtnuto' }));
    })));
    if (sess.poznamka) body.push(h('p', { class: 'note', text: sess.poznamka }));
    body.push(h('div', { class: 'row-actions row-actions--wrap' },
      h('button', { class: 'btn btn--primary', type: 'button', onclick: () => closeAllAnd(() => nav.go(date === t ? '#/dnes' : `#/trenink/${date}`)) }, icon('edit'), 'Otevřít a upravit'),
      h('button', { class: 'btn btn--danger-quiet', type: 'button', onclick: () => confirmSheet('Smazat trénink?', 'Záznam zmizí z telefonu i z úložiště.', 'Smazat', async () => { await deleteSession(date); closeAllAnd(() => toast('Trénink smazán.')); }, true) }, icon('trash'), 'Smazat')));
  } else if (date < t) {
    body.push(h('p', { class: 'muted', text: ov === 'nejdu' ? 'Označeno jako volno (nešel jsem).' : 'Žádný zapsaný trénink.' }));
    body.push(h('div', { class: 'row-actions row-actions--wrap' },
      h('button', { class: 'btn btn--primary', type: 'button', onclick: () => chooseTraining(date, nav, 'Zapsat trénink zpětně') }, icon('plus'), 'Zapsat trénink zpětně')));
  } else if (plan) {
    const d = dayOf(plan.poradi);
    title = `${relDay(date)} · ${d.den} · ${dayName(d.den)}`;
    body.push(h('div', { class: 'chips' }, chip(`týden ${d.varianta}`, 'chip--soft'), ov === 'jdu' ? chip('mimořádný den', 'chip--soft') : null));
    if (plan.poSobe) body.push(h('p', { class: 'warnline', text: 'Den předtím taky trénuješ. Když to jde, nech mezi tréninky den volna.' }));
    body.push(previewList(plan.poradi));
    body.push(h('div', { class: 'row-actions row-actions--wrap' },
      date === t ? h('button', { class: 'btn btn--primary', type: 'button', onclick: () => startSession(date, plan.poradi, nav) }, icon('play'), 'Začít trénink') : null,
      h('button', { class: 'btn', type: 'button', onclick: () => { closeSheet(); skipDay(date, nav); } }, date === t ? 'Dnes nejdu' : 'Nepůjdu'),
      date === t ? h('button', { class: 'linkbtn', type: 'button', onclick: () => chooseTraining(date, nav) }, 'Jiný trénink') : null));
  } else {
    body.push(h('p', { class: 'muted', text: ov === 'nejdu' ? 'Tenhle běžný tréninkový den máš označený jako volný.' : 'Volný den.' }));
    body.push(h('div', { class: 'row-actions row-actions--wrap' },
      h('button', { class: 'btn btn--primary', type: 'button', onclick: async () => { closeSheet(); await setGo(date, true); const p = plannedOn(date); toast(p ? `Naplánováno: ${p.den} · ${dayName(p.den)}.` : 'Naplánováno.'); } }, icon('plus'), date === t ? 'Dnes jdu do posilovny' : 'Půjdu do posilovny'),
      date === t ? h('button', { class: 'linkbtn', type: 'button', onclick: () => chooseTraining(date, nav) }, 'Rovnou začít trénink') : null));
  }
  openSheet(title, body);
}

/* ---------- month view ---------- */

export function render(root, params, nav) {
  nav.setTitle('Kalendář');
  let month = (params[0] || today()).slice(0, 7);
  function draw() {
    const t = today();
    const first = parseKey(month + '-01');
    const startOffset = (first.getDay() + 6) % 7;
    const gridStart = addDays(dayKey(first), -startOffset);
    const plannedMap = new Map(projection(t, 60).map(p => [p.datum, p]));
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = addDays(gridStart, i);
      if (i >= 35 && d.slice(0, 7) !== month) break;
      const sess = store.sessions.get(d);
      const plan = plannedMap.get(d);
      const ov = override(d);
      let mark = null, cls = 'cal__d';
      if (d.slice(0, 7) !== month) cls += ' cal__d--out';
      if (d === t) cls += ' cal__d--today';
      if (sess) {
        const done = sess.stav === 'hotovo';
        mark = h('span', { class: 'cal__m ' + (done ? 'cal__m--done' : 'cal__m--prog'), text: sess.den });
      } else if (plan) mark = h('span', { class: 'cal__m cal__m--plan' + (plan.poSobe ? ' cal__m--warn' : ''), text: plan.den });
      else if (ov === 'nejdu') mark = h('span', { class: 'cal__m cal__m--skip', 'aria-label': 'volno' }, '×');
      const label = `${longDay(d)}${sess ? `, trénink ${sess.den}` : plan ? `, plánovaný trénink ${plan.den}` : ''}`;
      cells.push(h('button', { class: cls, type: 'button', 'aria-label': label, onclick: () => openDaySheet(d, nav) }, h('span', { class: 'cal__n', text: String(parseKey(d).getDate()) }), mark));
    }
    const prev = dayKey(new Date(first.getFullYear(), first.getMonth() - 1, 1)).slice(0, 7);
    const next = dayKey(new Date(first.getFullYear(), first.getMonth() + 1, 1)).slice(0, 7);
    const monthSessions = [...store.sessions.values()].filter(s => s.datum.startsWith(month) && sessionProgress(s).done > 0).length;
    const upcoming = projection(t, 6);
    put(root, h('div', { class: 'narrow' },
      h('div', { class: 'calhead' },
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Předchozí měsíc', onclick: () => { month = prev; draw(); } }, icon('back')),
        h('h2', { class: 'calhead__t' }, monthName(month + '-01'), h('small', { text: monthSessions ? `${monthSessions} ${plural(monthSessions, 'trénink', 'tréninky', 'tréninků')}` : '' })),
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Další měsíc', onclick: () => { month = next; draw(); } }, icon('next'))),
      month !== t.slice(0, 7) ? h('div', { class: 'center' }, h('button', { class: 'linkbtn', type: 'button', onclick: () => { month = t.slice(0, 7); draw(); } }, 'Zpět na dnešek')) : null,
      h('div', { class: 'cal' },
        ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'].map(d => h('span', { class: 'cal__w', text: d })),
        cells),
      h('ul', { class: 'legend legend--cal' },
        h('li', null, h('span', { class: 'cal__m cal__m--done', text: 'A' }), 'hotovo'),
        h('li', null, h('span', { class: 'cal__m cal__m--prog', text: 'A' }), 'rozpracováno'),
        h('li', null, h('span', { class: 'cal__m cal__m--plan', text: 'A' }), 'plán'),
        h('li', null, h('span', { class: 'cal__m cal__m--skip', text: '×' }), 'volno')),
      h('section', { class: 'sec' },
        h('h3', { class: 'sec__h', text: 'Příští tréninky' }),
        h('ul', { class: 'rows' }, upcoming.map(p => h('li', null, h('button', { class: 'row', type: 'button', onclick: () => openDaySheet(p.datum, nav) },
          h('span', { class: 'daybadge', text: p.den }),
          h('span', { class: 'row__main' }, h('b', { text: `${dayName(p.den)} · týden ${p.varianta}` }), h('small', { text: relLong(p.datum) })),
          p.poSobe ? h('span', { class: 'warnchip', title: 'Den předtím taky trénink' }, '2 dny po sobě') : null)))),
        h('p', { class: 'muted small', text: `Běžné dny: ${(store.kalendar.vychoziDny || []).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => DOW_SHORT[d]).join(', ')}. Změníš je v Nastavení, jednotlivé dny klepnutím v kalendáři.` }))));
  }
  draw();
  return { refresh: draw };
}
