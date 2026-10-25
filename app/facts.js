// Health and longevity facts: picking (stable for the day, tied to today's exercises) and rendering.
import { store } from './store.js';
import { DUKAZY } from './data.js';
import { h, put, icon, openSheet } from './ui.js';
import { today } from './format.js';

const TEMA = { sila: 'Síla a svaly', kardio: 'Kardio a kondice', psychika: 'Hlava a spánek', srdce: 'Srdce a tlak' };
const STRENGTH = ['meta-rct', 'rct', 'doporuceni', 'kohorta', 'prehled', 'mala'];

function hash(s) { let x = 5381; s = String(s); for (let i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) >>> 0; return x; }

/** Facts that name this exercise or its group. */
export function factsForExercise(cvik) {
  return store.fakty.filter(f => (f.cviky || []).includes(cvik.id) || (f.skupiny || []).includes(cvik.skupina));
}
const isGeneral = f => !(f.cviky || []).length && !(f.skupiny || []).length;

/** Facts for an exercise detail: the specific ones first (strongest evidence first), padded with general ones. */
export function factsForDetail(cvik, max = 3) {
  const own = factsForExercise(cvik).sort((a, b) => STRENGTH.indexOf(a.dukaz) - STRENGTH.indexOf(b.dukaz));
  if (own.length >= 2) return own.slice(0, max);
  const general = store.fakty.filter(f => isGeneral(f) && f.tema !== 'kardio');
  const start = general.length ? hash(cvik.id) % general.length : 0;
  const pad = general.slice(start).concat(general.slice(0, start));
  return own.concat(pad).slice(0, max);
}

/**
 * A pool of facts relevant to a set of exercise ids (plus general facts), in an order that is stable
 * for the given day, so the card does not change on every redraw.
 */
export function dailyPool(cvikIds = [], salt = '', tema = null) {
  const ids = new Set(cvikIds);
  const groups = new Set(cvikIds.map(id => store.cvik.get(id)?.skupina).filter(Boolean));
  let pool = store.fakty.filter(f => !tema || f.tema === tema);
  if (ids.size) {
    const rel = pool.filter(f => (f.cviky || []).some(id => ids.has(id)) || (f.skupiny || []).some(g => groups.has(g)) || isGeneral(f));
    if (rel.length) pool = rel;
  }
  const seed = today() + salt;
  return pool.slice().sort((a, b) => hash(seed + a.id) - hash(seed + b.id));
}

export function evidenceChip(f) {
  return h('span', { class: 'ev ev--' + (f.dukaz || 'x'), text: DUKAZY[f.dukaz] || 'Bez určení síly důkazů' });
}

function sourceLine(f) {
  return h('p', { class: 'fact__src' }, 'Zdroj: ', f.url ? h('a', { href: f.url, target: '_blank', rel: 'noopener noreferrer', text: f.zdroj }) : f.zdroj);
}

/** One fact as a block (used in lists and inside cards). */
export function factBody(f) {
  return h('div', { class: 'fact__b' }, h('p', { class: 'fact__t', text: f.text }), h('div', { class: 'fact__m' }, evidenceChip(f)), sourceLine(f));
}

/**
 * A card with one fact and a "další" button cycling through the pool.
 * opts: { title, pool, small }
 */
export function factCard(pool, opts = {}) {
  if (!pool || !pool.length) return null;
  let i = 0;
  const body = h('div');
  const counter = h('span', { class: 'fact__n' });
  const draw = () => { put(body, factBody(pool[i % pool.length])); counter.textContent = pool.length > 1 ? `${(i % pool.length) + 1}/${pool.length}` : ''; };
  const card = h('section', { class: 'fact' + (opts.small ? ' fact--sm' : '') },
    h('div', { class: 'fact__h' },
      h('span', { class: 'fact__ico' }, icon('heart')),
      h('h3', { text: opts.title || 'Pro zdraví ve stáří' }),
      counter,
      pool.length > 1 ? h('button', { class: 'linkbtn', type: 'button', onclick: () => { i++; draw(); } }, 'Další') : null),
    body,
    opts.all ? h('button', { class: 'linkbtn fact__all', type: 'button', onclick: openAllFacts }, `Všechna fakta (${store.fakty.length})`) : null);
  draw();
  return card;
}

export function openAllFacts() {
  const groups = {};
  for (const f of store.fakty) (groups[f.tema] = groups[f.tema] || []).push(f);
  const order = [...Object.keys(TEMA).filter(t => groups[t]), ...Object.keys(groups).filter(t => !TEMA[t])];
  openSheet('Fakta o zdraví a dlouhověkosti', [
    h('p', { class: 'muted small', text: 'U každého faktu je uvedeno, jak silné důkazy za ním stojí. Pozorovací studie ukazují souvislost, ne nutně příčinu: lidé, kteří cvičí, se často liší i jinak.' }),
    order.map(t => [h('h3', { class: 'group__h', text: TEMA[t] || t }), h('ul', { class: 'factlist' }, groups[t].map(f => h('li', null, factBody(f))))])
  ], { full: true });
}
