// Small hand-drawn charts (no library, works offline).
import { s, h } from './ui.js';
import { parseKey, num, dm } from './format.js';

function niceTicks(min, max, n = 4) {
  if (min === max) { min -= 5; max += 5; }
  const span = max - min;
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(m => m >= raw) || raw;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

/**
 * Line chart over dates.
 * series: [{ label, cls, points: [{ d: 'YYYY-MM-DD', v: number }] }]
 */
export function lineChart(series, opts = {}) {
  const W = 340, H = opts.height || 170, padL = 34, padR = 10, padT = 10, padB = 22;
  const all = series.flatMap(x => x.points).filter(p => p.v != null);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': opts.label || 'Graf' });
  if (!all.length) return svg;
  const xs = all.map(p => parseKey(p.d).getTime());
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (x0 === x1) { x0 -= 3 * 864e5; x1 += 3 * 864e5; }
  const vs = all.map(p => p.v);
  const ticks = niceTicks(Math.min(...vs), Math.max(...vs));
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const X = d => padL + (parseKey(d).getTime() - x0) / (x1 - x0) * (W - padL - padR);
  const Yv = v => H - padB - (v - y0) / (y1 - y0 || 1) * (H - padT - padB);
  for (const t of ticks) {
    svg.append(s('line', { x1: padL, x2: W - padR, y1: Yv(t), y2: Yv(t), class: 'c-grid' }));
    svg.append(s('text', { x: padL - 5, y: Yv(t) + 3.5, 'text-anchor': 'end', class: 'c-tick' }, num(t)));
  }
  const dates = [...new Set(all.map(p => p.d))].sort();
  const lab = [dates[0], dates[dates.length - 1]];
  if (dates.length > 4) lab.splice(1, 0, dates[Math.floor(dates.length / 2)]);
  lab.forEach((d, i) => svg.append(s('text', { x: X(d), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === lab.length - 1 ? 'end' : 'middle', class: 'c-tick' }, dm(d))));
  for (const sr of series) {
    const pts = sr.points.filter(p => p.v != null);
    if (!pts.length) continue;
    if (pts.length > 1) svg.append(s('polyline', { points: pts.map(p => `${X(p.d).toFixed(1)},${Yv(p.v).toFixed(1)}`).join(' '), class: `c-line ${sr.cls || ''}` }));
    for (const p of pts) {
      const c = s('circle', { cx: X(p.d), cy: Yv(p.v), r: pts.length > 24 ? 2.2 : 3.2, class: `c-dot ${sr.cls || ''}` });
      c.append(s('title', null, `${dm(p.d)}: ${num(p.v)}${opts.unit || ''}${p.note ? ' · ' + p.note : ''}`));
      svg.append(c);
    }
  }
  return svg;
}

export function legend(items) {
  return h('ul', { class: 'legend' }, items.map(([label, cls]) => h('li', null, h('i', { class: `legend__k ${cls}` }), label)));
}

/** Vertical columns (HTML), e.g. trainings per week. items: [{ label, v, now, title }] */
export function columns(items, opts = {}) {
  const max = Math.max(opts.min || 1, ...items.map(i => i.v));
  return h('div', { class: 'cols', style: { gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` } },
    items.map(i => h('div', { class: 'cols__c', title: i.title || '' },
      h('div', { class: 'cols__plot' },
        opts.target ? h('i', { class: 'cols__target', style: { bottom: `${Math.min(100, opts.target / max * 100)}%` } }) : null,
        i.v ? h('span', { class: 'cols__v', text: String(i.v) }) : null,
        h('div', { class: 'cols__bar' + (i.v >= (opts.target || Infinity) ? ' ok' : ''), style: { height: `${i.v / max * 100}%` } })),
      h('span', { class: 'cols__l' + (i.now ? ' now' : ''), text: i.label }))));
}

/** Horizontal bars with an optional target band. rows: [{ label, v, avg }] */
export function hbars(rows, opts = {}) {
  const max = Math.max(opts.max || 0, ...rows.map(r => Math.max(r.v, r.avg || 0))) || 1;
  return h('div', { class: 'hbars' }, rows.map(r => h('div', { class: 'hbar' },
    h('div', { class: 'hbar__top' }, h('span', { text: r.label }), h('b', { text: num(r.v) })),
    h('div', { class: 'hbar__track' },
      opts.band ? h('i', { class: 'hbar__band', style: { left: `${opts.band[0] / max * 100}%`, width: `${(opts.band[1] - opts.band[0]) / max * 100}%` } }) : null,
      h('div', { class: 'hbar__fill', style: { width: `${r.v / max * 100}%` } }),
      r.avg != null ? h('i', { class: 'hbar__avg', style: { left: `${r.avg / max * 100}%` }, title: `průměr ${num(r.avg)}` }) : null))));
}
