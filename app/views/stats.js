// "Přehled": attendance, progress of the main lifts, any exercise in detail, weekly volume per muscle group.
import { store, sessionList } from '../store.js';
import { h, put } from '../ui.js';
import { PARTIE } from '../data.js';
import { exerciseSeries, weeklyCounts, volumeByGroup, sessionProgress, fmtSets, doneSets, weeklyCardio, cardioDone } from '../program.js';
import { KARDIO_DRUHY } from '../data.js';
import { lineChart, legend, columns, hbars } from '../charts.js';
import { today, addDays, dm, dmy, num, relDay, weekStart, plural } from '../format.js';

let picked = null;

function mainLifts() {
  const ids = [];
  for (const d of Object.values(store.plan.dny)) for (const s of d.sloty || []) if (s.hlavni) for (const e of s.cviky || []) { const id = typeof e === 'string' ? e : e.cvik; if (!ids.includes(id)) ids.push(id); }
  return ids;
}

function liftCard(id, nav) {
  const cvik = store.cvik.get(id);
  if (!cvik) return null;
  const ser = exerciseSeries(id);
  const last = ser[ser.length - 1];
  const first = ser[0];
  const best = ser.reduce((a, x) => (x.e1rm || 0) > (a?.e1rm || 0) ? x : a, null);
  const delta = last && first && last.e1rm && first.e1rm ? last.e1rm - first.e1rm : null;
  return h('article', { class: 'lift' },
    h('button', { class: 'lift__h', type: 'button', onclick: () => { picked = id; nav.refresh(); document.getElementById('cvik-detail')?.scrollIntoView({ behavior: 'smooth' }); } },
      h('b', { text: cvik.nazev }),
      last ? h('span', { class: 'muted small', text: relDay(last.datum) }) : null),
    last ? h('div', { class: 'lift__nums' },
      h('div', null, h('span', { class: 'lift__v', text: `${num(last.top)} kg` }), h('span', { class: 'lift__l', text: 'nejtěžší série' })),
      last.e1rm ? h('div', null, h('span', { class: 'lift__v', text: `${num(last.e1rm)} kg` }), h('span', { class: 'lift__l', text: 'odhad maxima' })) : null,
      delta != null && ser.length > 1 ? h('div', null, h('span', { class: 'lift__v' + (delta >= 0 ? ' up' : ' down'), text: `${delta >= 0 ? '+' : '−'}${num(Math.abs(delta))} kg` }), h('span', { class: 'lift__l', text: `od ${dm(first.datum)}` })) : null) : h('p', { class: 'muted small', text: 'Zatím bez zápisu.' }),
    ser.length > 1 ? lineChart([
      { cls: 's2', points: ser.map(x => ({ d: x.datum, v: x.e1rm ? Math.round(x.e1rm * 10) / 10 : null })) },
      { cls: 's1', points: ser.map(x => ({ d: x.datum, v: x.top || null, note: fmtSets(doneSets(x.ex), cvik) })) }], { unit: ' kg', height: 130, label: `Vývoj: ${cvik.nazev}` }) : null,
    best && best.e1rm ? h('p', { class: 'muted small', text: `Nejlepší: ${fmtSets([best.bestSet], cvik)} (${dmy(best.datum)}), odhad maxima ${num(best.e1rm)} kg` }) : null);
}

function detail(nav) {
  const withHistory = store.cviky.filter(c => exerciseSeries(c.id).length);
  const box = h('section', { class: 'stat', id: 'cvik-detail' }, h('div', { class: 'stat__h' }, 'Vývoj podle cviku'));
  if (!withHistory.length) { box.append(h('p', { class: 'muted', text: 'Graf se ukáže po prvním zapsaném tréninku.' })); return box; }
  if (!picked || !withHistory.some(c => c.id === picked)) picked = withHistory[0].id;
  const sel = h('select', { class: 'field', 'aria-label': 'Cvik', onchange: () => { picked = sel.value; nav.refresh(); } },
    withHistory.map(c => h('option', { value: c.id, text: c.nazev })));
  sel.value = picked;
  const cvik = store.cvik.get(picked);
  const ser = exerciseSeries(picked);
  const timed = cvik.jednotka === 's';
  const prTop = ser.reduce((a, x) => x.top > (a?.top ?? -Infinity) ? x : a, null);
  const prE = ser.reduce((a, x) => (x.e1rm || 0) > (a?.e1rm || 0) ? x : a, null);
  const prVol = ser.reduce((a, x) => x.vol > (a?.vol || 0) ? x : a, null);
  box.append(sel,
    timed
      ? lineChart([{ cls: 's1', points: ser.map(x => ({ d: x.datum, v: x.maxReps })) }], { unit: ' s', label: 'Výdrž' })
      : lineChart([
        { cls: 's2', points: ser.map(x => ({ d: x.datum, v: x.e1rm ? Math.round(x.e1rm * 10) / 10 : null })) },
        { cls: 's1', points: ser.map(x => ({ d: x.datum, v: x.top || null, note: fmtSets(doneSets(x.ex), cvik) })) }], { unit: ' kg', label: `Vývoj: ${cvik.nazev}` }),
    timed ? null : legend([['Nejtěžší série', 's1'], ['Odhad maxima (1RM)', 's2']]),
    h('div', { class: 'tiles' },
      timed ? h('div', { class: 'tile' }, h('b', { class: 'tile__v', text: `${Math.max(...ser.map(x => x.maxReps))} s` }), h('span', { class: 'tile__d', text: 'nejdelší výdrž' })) : null,
      !timed && prTop ? h('div', { class: 'tile' }, h('b', { class: 'tile__v', text: `${num(prTop.top)} kg` }), h('span', { class: 'tile__d', text: `nejvyšší váha · ${dm(prTop.datum)}` })) : null,
      !timed && prE && prE.e1rm ? h('div', { class: 'tile' }, h('b', { class: 'tile__v', text: `${num(prE.e1rm)} kg` }), h('span', { class: 'tile__d', text: `odhad maxima · ${dm(prE.datum)}` })) : null,
      !timed && prVol && prVol.vol ? h('div', { class: 'tile' }, h('b', { class: 'tile__v', text: `${num(prVol.vol)} kg` }), h('span', { class: 'tile__d', text: `největší objem · ${dm(prVol.datum)}` })) : null,
      h('div', { class: 'tile' }, h('b', { class: 'tile__v', text: String(ser.length) }), h('span', { class: 'tile__d', text: plural(ser.length, 'trénink', 'tréninky', 'tréninků') }))),
    h('div', { class: 'tablewrap' }, h('table', { class: 'table' },
      h('thead', null, h('tr', null, h('th', { text: 'Datum' }), h('th', { text: 'Série' }), timed ? null : h('th', { class: 'n', text: '1RM' }))),
      h('tbody', null, [...ser].reverse().slice(0, 20).map(x => h('tr', null,
        h('td', { text: dm(x.datum) }), h('td', { text: fmtSets(doneSets(x.ex), cvik) }), timed ? null : h('td', { class: 'n', text: x.e1rm ? num(x.e1rm) : '–' })))))),
    h('button', { class: 'linkbtn', type: 'button', onclick: () => nav.go('#/cvik/' + picked) }, 'Detail cviku'));
  return box;
}

function cardioSection(t) {
  const weeks = weeklyCardio(12, t);
  const all = sessionList().flatMap(s => cardioDone(s).map(k => ({ ...k, datum: s.datum })));
  const month = all.filter(k => k.datum.slice(0, 7) === t.slice(0, 7)).reduce((a, k) => a + Number(k.minuty || 0), 0);
  const byKind = {};
  for (const k of all) byKind[k.druh] = (byKind[k.druh] || 0) + Number(k.minuty || 0);
  return h('section', { class: 'stat' },
    h('div', { class: 'stat__h' }, 'Kardio', h('small', { text: 'minuty po tréninku za týden' })),
    all.length ? columns(weeks.map(w => ({ label: dm(w.od), v: w.n, now: w.od === weekStart(t), title: `týden od ${dm(w.od)}: ${w.n} min` })), { min: 30 }) : h('p', { class: 'muted', text: 'Zatím žádné odškrtnuté kardio.' }),
    all.length ? h('p', { class: 'small', text: `Tento měsíc ${month} min. ` + Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([d, m]) => `${(KARDIO_DRUHY[d] || { nazev: d }).nazev} ${m} min`).join(', ') + '.' }) : null,
    h('p', { class: 'muted small', text: 'WHO doporučuje 150–300 minut středně náročného pohybu týdně. Kardio po tréninku je jeho část, zbytek doplní chůze a běžný pohyb.' }));
}

export function render(root, params, nav) {
  nav.setTitle('Přehled');
  const localNav = { ...nav, refresh: () => draw() };
  function draw() {
    const t = today();
    const all = sessionList().filter(s => sessionProgress(s).done > 0);
    const month = all.filter(s => s.datum.slice(0, 7) === t.slice(0, 7)).length;
    const weeks = weeklyCounts(12, t);
    const last4 = weeks.slice(-5, -1).reduce((a, w) => a + w.n, 0) / 4;
    const totalSets = all.reduce((a, s) => a + sessionProgress(s).done, 0);
    const vol7 = volumeByGroup(addDays(t, -6), t);
    const vol28 = volumeByGroup(addDays(t, -27), t);
    put(root, h('div', { class: 'stats narrow' },
      h('div', { class: 'tiles' },
        h('div', { class: 'tile' }, h('b', { class: 'tile__v', text: String(month) }), h('span', { class: 'tile__d', text: 'tréninků tento měsíc' })),
        h('div', { class: 'tile' }, h('b', { class: 'tile__v', text: num(last4) }), h('span', { class: 'tile__d', text: 'za týden (průměr 4 týdnů)' })),
        h('div', { class: 'tile' }, h('b', { class: 'tile__v', text: String(all.length) }), h('span', { class: 'tile__d', text: 'tréninků celkem' })),
        h('div', { class: 'tile' }, h('b', { class: 'tile__v', text: String(totalSets) }), h('span', { class: 'tile__d', text: 'odškrtnutých sérií' }))),
      h('section', { class: 'stat' },
        h('div', { class: 'stat__h' }, 'Hlavní cviky', h('small', { text: 'nejtěžší série a odhad maxima' })),
        h('div', { class: 'lifts' }, mainLifts().map(id => liftCard(id, localNav)))),
      h('section', { class: 'stat' },
        h('div', { class: 'stat__h' }, 'Docházka', h('small', { text: 'tréninky za týden, cíl 3' })),
        columns(weeks.map(w => ({ label: dm(w.od), v: w.n, now: w.od === weekStart(t), title: `týden od ${dm(w.od)}: ${w.n}` })), { target: 3, min: 3 })),
      cardioSection(t),
      h('section', { class: 'stat' },
        h('div', { class: 'stat__h' }, 'Objem po partiích', h('small', { text: 'pracovní série za 7 dní' })),
        hbars(PARTIE.map(p => ({ label: p.nazev, v: vol7[p.id], avg: vol28[p.id] / 4 })), { band: [10, 20], max: 22 }),
        h('p', { class: 'muted small', text: 'Hlavní sval cviku se počítá celou sérií, pomocný polovinou. Svislá čárka je průměr posledních 4 týdnů, podbarvené pásmo 10–20 sérií týdně je rozsah, který studie spojují s dobrým růstem svalů.' })),
      detail(localNav)));
  }
  draw();
  return { refresh: draw };
}
