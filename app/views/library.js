// "Cviky": the exercise library grouped by movement, with search.
import { store } from '../store.js';
import { h, put, icon } from '../ui.js';
import { SKUPINY, SVALY } from '../data.js';
import { thumb } from './session.js';
import { history } from '../program.js';
import { norm } from '../format.js';

let lastQuery = '';

function inPlan() {
  const ids = new Set();
  for (const d of Object.values(store.plan.dny)) for (const s of d.sloty || []) for (const e of s.cviky || []) ids.add(typeof e === 'string' ? e : e.cvik);
  return ids;
}

export function render(root, params, nav) {
  nav.setTitle('Cviky');
  const q = h('input', { class: 'search__in', type: 'search', placeholder: 'Hledat cvik nebo partii', autocomplete: 'off', value: lastQuery });
  const list = h('div', { class: 'lib' });
  function draw() {
    const t = norm(q.value.trim());
    lastQuery = q.value;
    const plan = inPlan();
    const groups = Object.keys(SKUPINY);
    const extra = [...new Set(store.cviky.map(c => c.skupina))].filter(g => !groups.includes(g));
    const out = [];
    for (const g of [...groups, ...extra]) {
      const items = store.cviky.filter(c => c.skupina === g && (!t || norm(`${c.nazev} ${c.en || ''} ${[...(c.hlavni || []), ...(c.vedlejsi || [])].map(m => SVALY[m]).join(' ')}`).includes(t)));
      if (!items.length) continue;
      out.push(h('section', { class: 'group' },
        h('h2', { class: 'group__h' }, SKUPINY[g] || g, h('span', { class: 'group__n', text: String(items.length) })),
        h('ul', { class: 'rows' }, items.map(c => {
          const n = history(c.id).length;
          return h('li', null, h('button', { class: 'row', type: 'button', onclick: () => nav.go('#/cvik/' + c.id) },
            thumb(c),
            h('span', { class: 'row__main' }, h('b', { text: c.nazev }), h('small', { text: (c.hlavni || []).map(m => SVALY[m] || m).join(', ') })),
            h('span', { class: 'row__meta' },
              plan.has(c.id) ? h('span', { class: 'tag', text: 'v plánu' }) : null,
              n ? h('span', { class: 'muted small', text: `${n}×` }) : null,
              store.mediaMap[c.id] ? h('span', { class: 'tag tag--soft', text: 'video' }) : null)));
        }))));
    }
    put(list, out.length ? out : h('p', { class: 'empty', text: 'Nic nenalezeno.' }));
  }
  q.addEventListener('input', draw);
  put(root, h('div', { class: 'narrow' }, h('label', { class: 'search' }, icon('search'), q), list));
  draw();
  return { refresh: draw };
}
