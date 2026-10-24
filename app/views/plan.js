// "Plán": the three training days with both weekly variants; any exercise can be swapped for good.
import { store, savePlan } from '../store.js';
import { h, put, toast, openSheet, closeSheet } from '../ui.js';
import { SKUPINY, SVALY } from '../data.js';
import { order, slotEntry, variantCount } from '../program.js';
import { thumb } from './session.js';
import { dm, num } from '../format.js';

export function render(root, params, nav) {
  nav.setTitle('Tréninkový plán');
  function swap(den, si, vi) {
    const slot = store.plan.dny[den].sloty[si];
    const cur = slotEntry(slot, vi + 1);
    const alts = store.cviky.filter(c => c.skupina === slot.skupina && c.id !== cur.cvik);
    openSheet(`${den} · týden ${vi + 1}: ${SKUPINY[slot.skupina] || slot.skupina}`, [
      h('p', { class: 'muted small', text: 'Vybraný cvik se v plánu nahradí natrvalo. Historie zůstane.' }),
      h('ul', { class: 'choices' }, alts.map(a => h('li', null, h('button', { type: 'button', onclick: async () => {
        closeSheet();
        await savePlan(p => { const sl = p.dny[den].sloty[si]; sl.cviky[vi % sl.cviky.length] = a.id; });
        toast(`V plánu je teď ${a.nazev}.`);
      } }, thumb(a), h('span', { class: 'pick__t' }, h('b', { text: a.nazev }), h('small', { text: (a.hlavni || []).map(m => SVALY[m] || m).join(', ') }))))))]);
  }
  function draw() {
    const p = store.plan;
    const vc = variantCount();
    put(root, h('div', { class: 'narrow plan' },
      h('h1', { class: 'dayhead__title', text: p.nazev || 'Plán' }),
      p.popis ? h('p', { class: 'muted', text: p.popis }) : null,
      p.navrat ? h('div', { class: 'note note--soft' }, h('strong', { text: `Návrat po pauze do ${dm(p.navrat.do)}` }), h('p', { text: p.navrat.popis || '' }),
        p.start ? h('p', { class: 'small', text: 'Výchozí váhy: ' + Object.entries(p.start).map(([id, kg]) => `${store.cvik.get(id)?.nazev || id} ${num(kg)} kg`).join(', ') }) : null) : null,
      order().map(den => {
        const d = p.dny[den];
        if (!d) return null;
        return h('section', { class: 'pday' },
          h('h2', { class: 'pday__h' }, h('span', { class: 'daybadge', text: den }), d.nazev),
          (d.rozcvicka || []).length ? h('p', { class: 'muted small', text: 'Rozcvička: ' + d.rozcvicka.join(' · ') }) : null,
          h('ol', { class: 'pslots' }, (d.sloty || []).map((sl, si) => h('li', { class: 'pslot' + (sl.hlavni ? ' pslot--main' : '') },
            h('div', { class: 'pslot__meta' },
              h('span', { text: SKUPINY[sl.skupina] || sl.skupina }),
              h('span', { class: 'muted', text: `${sl.serie}${sl.backoff ? ` + ${sl.backoff.serie}` : ''} × ${sl.opak[0] === sl.opak[1] ? sl.opak[0] : sl.opak.join('–')} · RIR ${sl.rir}${sl.superserie ? ' · supersérie' : ''}` })),
            h('div', { class: 'pslot__vars' }, Array.from({ length: vc }, (_, vi) => {
              const e = slotEntry(sl, vi + 1);
              const c = e && store.cvik.get(e.cvik);
              return h('button', { class: 'pvar', type: 'button', onclick: () => sl.cviky.length > 1 || vi === 0 ? swap(den, si, vi) : swap(den, si, 0) },
                h('small', { text: `týden ${vi + 1}` }), h('b', { text: c ? c.nazev : (e ? e.cvik : '–') }),
                e && e.opak ? h('small', { class: 'muted', text: `${e.opak.join('–')} ${c && c.jednotka === 's' ? 's' : 'opak.'}` }) : null);
            }))))));
      }),
      h('p', { class: 'muted small', text: 'Klepnutím na cvik ho v plánu vyměníš za jiný na stejnou partii. Hlavní cviky (dřep, benchpress, mrtvý tah) jsou v obou týdnech stejné, aby byl vidět progres.' })));
  }
  draw();
  return { refresh: draw };
}
