// Small DOM helpers shared by the views.

export const $ = (sel, root = document) => root.querySelector(sel);

/** h('div', { class: 'x', onclick }, child, [children], 'text') */
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export function put(el, ...kids) { el.replaceChildren(); append(el, kids); }

const SVGNS = 'http://www.w3.org/2000/svg';
/** s('circle', { cx: 1 }) — SVG element helper. */
export function s(tag, attrs, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) { if (v != null && v !== false) el.setAttribute(k, String(v)); }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
}

/* ---------- toast ---------- */
let toastTimer = null;
export function toast(msg, ms = 2800) {
  let t = $('#toast');
  if (!t) { t = h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(t); }
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

/* ---------- bottom sheet ---------- */
let sheetStack = [];
export function openSheet(title, content, opts = {}) {
  const panel = h('div', { class: 'sheet__panel' + (opts.full ? ' sheet__panel--full' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: '-1' },
    h('div', { class: 'sheet__head' },
      h('h2', { text: title }),
      opts.action || null,
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Zavřít', onclick: () => requestClose() }, icon('close'))),
    h('div', { class: 'sheet__body' }, content));
  const back = h('div', { class: 'sheet__back', onclick: () => { if (!opts.modal) requestClose(); } });
  const sheet = h('div', { class: 'sheet' }, back, panel);
  document.body.append(sheet);
  document.body.classList.add('lock');
  sheetStack.push({ sheet, onClose: opts.onClose, beforeClose: opts.beforeClose, prevFocus: document.activeElement });
  requestAnimationFrame(() => { sheet.classList.add('in'); (opts.focus ? panel.querySelector(opts.focus) : panel)?.focus({ preventScroll: true }); });
  return { close: closeSheet, panel };
}
export function requestClose() {
  const top = sheetStack[sheetStack.length - 1];
  if (top && top.beforeClose && top.beforeClose() === false) return;
  closeSheet();
}
export function closeSheet() {
  const top = sheetStack.pop();
  if (!top) return;
  top.sheet.remove();
  if (!sheetStack.length) document.body.classList.remove('lock');
  if (top.onClose) top.onClose();
  if (top.prevFocus && top.prevFocus.focus && top.prevFocus.isConnected) top.prevFocus.focus({ preventScroll: true });
}
export function closeAllSheets() { while (sheetStack.length) closeSheet(); }
export const sheetOpen = () => sheetStack.length > 0;
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheetStack.length) requestClose(); });

export function confirmSheet(title, text, okLabel, onOk, danger = false) {
  openSheet(title, [
    h('p', { class: 'muted', text }),
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => closeSheet() }, 'Zrušit'),
      h('button', { class: 'btn ' + (danger ? 'btn--danger' : 'btn--primary'), type: 'button', onclick: () => { closeSheet(); onOk(); } }, okLabel))
  ]);
}

/* ---------- icons (stroke icons drawn inline) ---------- */
const PATHS = {
  today: 'M4 6h16M4 6v13a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V6M8 3v4M16 3v4M8.5 14l2.5 2.5 5-5',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01',
  dumbbell: 'M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11',
  stats: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  sync: 'M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  swap: 'M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
  play: 'M7 5v14l12-7z',
  pause: 'M8 5v14M16 5v14',
  timer: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 2.5M9 2h6',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01',
  skip: 'M5 5l14 14M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  heart: 'M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z',
  run: 'M13.5 5.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM7 21l3-5 3 2v4M10 16l1-6 4 2 3 1M6 11l3-2 2 1',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  cloudoff: 'M3 3l18 18M8 18H7a5 5 0 0 1-1.3-9.8M10.5 5.2A6 6 0 0 1 17.6 10H18a4 4 0 0 1 2.3 7.3'
};
export function icon(name, cls = 'ico') {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVGNS, 'path');
  p.setAttribute('d', PATHS[name] || '');
  svg.append(p);
  return svg;
}

export const fmtTime = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Numeric text input that accepts a decimal comma. */
export function numInput(value, attrs = {}) {
  return h('input', { class: 'numin', type: 'text', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'done', value: value == null ? '' : String(value).replace('.', ','), ...attrs });
}

export function chip(text, cls = '') { return h('span', { class: `chip ${cls}`.trim(), text }); }
