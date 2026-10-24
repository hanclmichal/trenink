// "Dnes": today's training (the editor itself once started), or the plan for today with
// go / skip, or the next planned training on a rest day.
import { store, sessionList } from '../store.js';
import { h, put, icon } from '../ui.js';
import { plannedOn, projection, dayName, isReturnPhase, fmtSets, doneSets, recordsIn, sessionProgress } from '../program.js';
import { today, addDays, longDay, relDay, relLong, wdm, dm } from '../format.js';
import { sessionEditor } from './session.js';
import { startSession, skipDay, chooseTraining, setGo, previewList, openDaySheet } from './calendar.js';

export function render(root, params, nav) {
  nav.setTitle('Dnes');
  let mode = null, editor = null, drawnStav = null;
  const box = h('div', { class: 'narrow' });
  root.append(box);

  function draw() {
    const t = today();
    if (editor && editor.destroy) editor.destroy();
    editor = null;
    if (store.sessions.has(t)) {
      mode = 'editor';
      const s = store.sessions.get(t);
      drawnStav = s.stav;
      const top = h('div'), ed = h('div');
      put(box, top, ed);
      if (s.stav === 'hotovo') {
        const n = projection(addDays(t, 1), 1)[0];
        top.append(h('div', { class: 'note note--soft done-note' }, h('strong', { text: 'Dnešní trénink je hotový' }),
          n ? h('p', null, 'Další: ', h('b', { text: relLong(n.datum) }), ` · ${n.den} · ${dayName(n.den)}`) : null));
      }
      editor = sessionEditor(ed, t, nav, { onDeleted: draw });
      return;
    }
    mode = 'plan';
    const plan = plannedOn(t);
    const next = projection(t, 4);
    const back = store.plan.navrat && isReturnPhase(t) ? store.plan.navrat : null;
    const parts = [h('div', { class: 'dayhead' }, h('p', { class: 'dayhead__date', text: longDay(t) }), h('h1', { class: 'dayhead__title', text: plan ? 'Dnes jdeš do posilovny' : 'Dnes volno' }))];
    if (plan) {
      parts.push(h('section', { class: 'today' },
        h('div', { class: 'today__h' }, h('span', { class: 'daybadge daybadge--lg', text: plan.den }),
          h('div', null, h('h2', { text: dayName(plan.den) }), h('p', { class: 'muted', text: `Trénink ${plan.den}, týden ${plan.varianta}` }))),
        plan.poSobe ? h('p', { class: 'warnline', text: 'Den předtím máš taky trénink. Když to jde, nech mezi tréninky den volna.' }) : null,
        previewList(plan.poradi),
        h('div', { class: 'today__act' },
          h('button', { class: 'btn btn--primary btn--block btn--lg', type: 'button', onclick: () => startSession(t, plan.poradi, nav) }, icon('play'), 'Začít trénink'),
          h('div', { class: 'row-actions row-actions--wrap' },
            h('button', { class: 'btn', type: 'button', onclick: () => skipDay(t, nav) }, 'Dnes nejdu'),
            h('button', { class: 'linkbtn', type: 'button', onclick: () => chooseTraining(t, nav) }, 'Jiný trénink')))));
    } else {
      const n = next[0];
      parts.push(h('section', { class: 'today' },
        n ? h('p', null, 'Další trénink: ', h('b', { text: relLong(n.datum) }), ` · ${n.den} · ${dayName(n.den)}`) : h('p', { class: 'muted', text: 'V kalendáři nemáš naplánovaný žádný trénink.' }),
        h('div', { class: 'today__act' },
          h('button', { class: 'btn btn--primary btn--block', type: 'button', onclick: () => setGo(t, true) }, icon('plus'), 'Dnes jdu do posilovny'),
          h('button', { class: 'linkbtn', type: 'button', onclick: () => chooseTraining(t, nav) }, 'Rovnou začít jiný trénink'))));
    }
    if (back) parts.push(h('div', { class: 'note note--soft' }, h('strong', { text: 'Návrat po pauze' }), h('p', { text: `${back.popis} Platí do ${dm(back.do)}` })));

    const last = sessionList().filter(s => s.datum < t && sessionProgress(s).done > 0).pop();
    if (last) {
      const main = last.cviky.find(e => e.hlavni && doneSets(e).length) || last.cviky.find(e => doneSets(e).length);
      const c = main && store.cvik.get(main.cvik);
      const recs = recordsIn(last);
      parts.push(h('section', { class: 'sec' },
        h('h3', { class: 'sec__h', text: 'Naposledy' }),
        h('button', { class: 'row', type: 'button', onclick: () => openDaySheet(last.datum, nav) },
          h('span', { class: 'daybadge daybadge--done', text: last.den }),
          h('span', { class: 'row__main' }, h('b', { text: `${dayName(last.den)} · ${relDay(last.datum)}` }),
            h('small', { text: c ? `${c.nazev}: ${fmtSets(doneSets(main), c)}` : '' }),
            recs.length ? h('small', { class: 'pr', text: `Rekord: ${recs.map(r => r.cvik.nazev).join(', ')}` }) : null))));
    }
    const upcoming = next.filter(x => x.datum !== t).slice(0, 3);
    if (upcoming.length) parts.push(h('section', { class: 'sec' },
      h('h3', { class: 'sec__h', text: 'Plán na další dny' }),
      h('ul', { class: 'rows' }, upcoming.map(p => h('li', null, h('button', { class: 'row', type: 'button', onclick: () => openDaySheet(p.datum, nav) },
        h('span', { class: 'daybadge', text: p.den }),
        h('span', { class: 'row__main' }, h('b', { text: `${dayName(p.den)} · týden ${p.varianta}` }), h('small', { text: relLong(p.datum) })))))),
      h('button', { class: 'linkbtn', type: 'button', onclick: () => nav.go('#/plan') }, 'Celý tréninkový plán')));
    put(box, parts);
  }
  draw();
  return {
    refresh() {
      const has = store.sessions.has(today());
      if (mode === 'editor' && has && store.sessions.get(today()).stav === drawnStav) editor.refresh(); else draw();
    },
    destroy() { if (editor && editor.destroy) editor.destroy(); }
  };
}
