// Exercise detail: own animation, muscle map, technique, own GIF/video, history, alternatives.
// Used both as a page (#/cvik/<id>) and inside a bottom sheet during a training.
import { store, saveMediaMap, putLocalMedia, deleteLocalMedia, readLocalMedia } from '../store.js';
import { loadMedia, typeFromPath } from '../sync.js';
import { SVALY, SKUPINY, VYBAVENI } from '../data.js';
import { h, put, icon, toast, openSheet, closeSheet, confirmSheet, chip } from '../ui.js';
import { mountAnimation } from '../anim.js';
import { muscleMap } from '../body.js';
import { history, fmtSets, exerciseSeries } from '../program.js';
import { lineChart, legend } from '../charts.js';
import { dmy, num } from '../format.js';

export function animBlock(cvik) {
  const wrap = h('figure', { class: 'animbox' });
  const a = mountAnimation(wrap, cvik);
  if (!a) { wrap.append(h('p', { class: 'muted small center', text: 'K tomuto cviku zatím animace není.' })); return wrap; }
  if (a.still) { wrap.append(h('figcaption', { class: 'animbox__cap', text: 'Výdrž v jedné poloze' })); return wrap; }
  const btn = h('button', { class: 'animbox__btn', type: 'button', 'aria-label': a.playing ? 'Zastavit animaci' : 'Přehrát animaci' }, icon(a.playing ? 'pause' : 'play'));
  const sync = () => { put(btn, icon(a.playing ? 'pause' : 'play')); btn.setAttribute('aria-label', a.playing ? 'Zastavit animaci' : 'Přehrát animaci'); };
  wrap.addEventListener('click', () => { a.toggle(); sync(); });
  wrap.append(btn);
  return wrap;
}

const mb = n => n >= 1048576 ? `${num(n / 1048576)} MB` : `${Math.max(1, Math.round(n / 1024))} kB`;

function mediaEl(blobOrUrl, type) {
  const src = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  if (/^video\//.test(type) || /\.(mp4|mov|webm)(\?|$)/i.test(src)) return h('video', { class: 'media__v', src, autoplay: true, loop: true, muted: true, playsinline: true, controls: true });
  return h('img', { class: 'media__v', src, alt: 'Vlastní ukázka cviku' });
}

function mediaSection(cvik) {
  const box = h('section', { class: 'sec' });
  const draw = async () => {
    const entry = store.mediaMap[cvik.id];
    const view = h('div', { class: 'media' });
    const actions = h('div', { class: 'row-actions row-actions--wrap' });
    put(box, h('h3', { class: 'sec__h', text: 'Moje video nebo GIF' }), view, actions);
    const fileIn = h('input', { type: 'file', accept: 'image/gif,image/webp,image/png,image/jpeg,video/mp4,video/quicktime,video/webm', hidden: true, onchange: () => upload(fileIn.files[0]) });
    actions.append(fileIn,
      h('button', { class: 'btn btn--sm', type: 'button', onclick: () => fileIn.click() }, icon('upload'), entry ? 'Nahradit' : 'Nahrát soubor'),
      h('button', { class: 'btn btn--sm', type: 'button', onclick: askLink }, icon('link'), 'Vložit odkaz'),
      entry ? h('button', { class: 'btn btn--sm btn--danger-quiet', type: 'button', onclick: () => confirmSheet('Odebrat video?', 'Video zmizí z telefonu i z úložiště.', 'Odebrat', remove, true) }, 'Odebrat') : null);
    if (!entry) { view.append(h('p', { class: 'muted small', text: 'Můžeš nahrát vlastní GIF nebo krátké video (třeba natočené v posilovně). Uloží se do tvého soukromého úložiště a v telefonu zůstane i offline.' })); return; }
    if (entry.url) {
      const show = () => put(view, mediaEl(entry.url, ''), h('p', { class: 'muted small', text: 'Z odkazu: načítá se z internetu.' }));
      put(view, h('button', { class: 'btn btn--block', type: 'button', onclick: show }, icon('play'), 'Zobrazit z odkazu'));
      return;
    }
    const local = await readLocalMedia(entry.soubor);
    const sha = store.mediaIndex[entry.soubor];
    if (local && local.blob && (local.pending || !sha || local.sha === sha)) { put(view, mediaEl(local.blob, entry.typ || local.type)); return; }
    put(view, h('button', { class: 'btn btn--block', type: 'button', onclick: async ev => {
      ev.currentTarget.disabled = true;
      try { const b = await loadMedia(entry.soubor); if (b) put(view, mediaEl(b, entry.typ || typeFromPath(entry.soubor))); else toast('Soubor v úložišti zatím není. Zkus synchronizovat.'); }
      catch (e) { toast(e.message || 'Video se nepodařilo stáhnout.'); draw(); }
    } }, icon('play'), `Stáhnout do telefonu${entry.velikost ? ` (${mb(entry.velikost)})` : ''}`), h('p', { class: 'muted small', text: 'Stáhne se jednou, pak zůstane v telefonu.' }));
  };
  async function upload(file) {
    if (!file) return;
    if (file.size > 25 * 1048576) { toast('Soubor je větší než 25 MB. Zkrať nebo zmenši video.'); return; }
    const ext = (file.name.split('.').pop() || '').toLowerCase().replace('jpeg', 'jpg');
    const path = `media/${cvik.id}.${ext || 'gif'}`;
    const prev = store.mediaMap[cvik.id];
    if (prev && prev.soubor && prev.soubor !== path) await deleteLocalMedia(prev.soubor);
    const type = file.type || typeFromPath(path);
    await putLocalMedia(path, file, type);
    await saveMediaMap(m => { m[cvik.id] = { soubor: path, typ: type, velikost: file.size }; });
    toast(file.size > 8 * 1048576 ? `Uloženo. Odeslání ${mb(file.size)} chvíli potrvá.` : 'Uloženo, odešle se při synchronizaci.');
    draw();
  }
  function askLink() {
    const inp = h('input', { class: 'field', type: 'url', placeholder: 'https://…/cvik.gif', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
    openSheet('Odkaz na GIF nebo video', [
      h('p', { class: 'muted small', text: 'Odkaz se uloží k cviku. Obrázek se pak načítá z internetu, když ho otevřeš.' }), inp,
      h('div', { class: 'row-actions' }, h('button', { class: 'btn btn--primary', type: 'button', onclick: async () => {
        const url = inp.value.trim();
        if (!/^https:\/\//.test(url)) { toast('Zadej odkaz začínající https://'); return; }
        const prev = store.mediaMap[cvik.id];
        if (prev && prev.soubor) await deleteLocalMedia(prev.soubor);
        await saveMediaMap(m => { m[cvik.id] = { url }; });
        closeSheet(); draw();
      } }, 'Uložit'))], { focus: 'input' });
  }
  async function remove() {
    const prev = store.mediaMap[cvik.id];
    if (prev && prev.soubor) await deleteLocalMedia(prev.soubor);
    await saveMediaMap(m => { delete m[cvik.id]; });
    draw();
  }
  draw();
  return box;
}

function historySection(cvik) {
  const hist = history(cvik.id).slice(0, 6);
  if (!hist.length) return null;
  const series = exerciseSeries(cvik.id);
  const timed = cvik.jednotka === 's';
  const chart = series.length >= 2 ? (timed
    ? lineChart([{ label: 'Nejdelší výdrž', cls: 's1', points: series.map(x => ({ d: x.datum, v: x.maxReps })) }], { unit: ' s', height: 140 })
    : lineChart([
      { label: 'Odhad maxima', cls: 's2', points: series.map(x => ({ d: x.datum, v: x.e1rm ? Math.round(x.e1rm * 10) / 10 : null })) },
      { label: 'Nejtěžší série', cls: 's1', points: series.map(x => ({ d: x.datum, v: x.top || null })) }], { unit: ' kg', height: 140 })) : null;
  return h('section', { class: 'sec' },
    h('h3', { class: 'sec__h', text: 'Moje historie' }),
    chart, chart && !timed ? legend([['Nejtěžší série', 's1'], ['Odhad maxima (1RM)', 's2']]) : null,
    h('ul', { class: 'hist' }, hist.map(x => h('li', null, h('span', { class: 'hist__d', text: dmy(x.datum) }), h('span', { text: fmtSets(x.ex.serie.filter(s => s.hotovo), cvik) })))));
}

export function exerciseContent(cvik, onPick) {
  const alts = store.cviky.filter(x => x.skupina === cvik.skupina && x.id !== cvik.id);
  const muscles = (list, cls) => list.map(m => chip(SVALY[m] || m, cls));
  return h('div', { class: 'exd' },
    animBlock(cvik),
    h('div', { class: 'chips' }, chip(SKUPINY[cvik.skupina] || cvik.skupina), chip(VYBAVENI[cvik.vybaveni] || cvik.vybaveni, 'chip--soft'), cvik.strana ? chip('na každou stranu', 'chip--soft') : null, cvik.en ? h('span', { class: 'muted small', text: cvik.en }) : null),
    cvik.tip ? h('div', { class: 'note note--soft' }, h('p', { text: cvik.tip })) : null,
    h('section', { class: 'sec' },
      h('h3', { class: 'sec__h', text: 'Procvičované partie' }),
      h('div', { class: 'mwrap' }, muscleMap(cvik),
        h('div', { class: 'mlist' },
          h('p', { class: 'mlist__h' }, h('i', { class: 'mk mk--hl' }), 'Hlavní'), h('div', { class: 'chips' }, muscles(cvik.hlavni || [], 'chip--hl')),
          (cvik.vedlejsi || []).length ? [h('p', { class: 'mlist__h' }, h('i', { class: 'mk mk--ved' }), 'Pomocné'), h('div', { class: 'chips' }, muscles(cvik.vedlejsi, 'chip--ved'))] : null))),
    h('section', { class: 'sec' }, h('h3', { class: 'sec__h', text: 'Technika' }), h('ol', { class: 'steps' }, (cvik.technika || []).map(t => h('li', { text: t })))),
    (cvik.chyby || []).length ? h('section', { class: 'sec' }, h('h3', { class: 'sec__h', text: 'Nejčastější chyby' }), h('ul', { class: 'bad' }, cvik.chyby.map(t => h('li', { text: t })))) : null,
    mediaSection(cvik),
    historySection(cvik),
    alts.length ? h('section', { class: 'sec' }, h('h3', { class: 'sec__h', text: 'Náhrady na stejnou partii' }),
      h('div', { class: 'chips' }, alts.map(a => h('button', { class: 'chipbtn', type: 'button', onclick: () => onPick(a.id) }, a.nazev)))) : null);
}

/** Exercise detail as a bottom sheet (during a training). */
export function openExerciseSheet(cvikId) {
  const cvik = store.cvik.get(cvikId);
  if (!cvik) return;
  const body = h('div');
  const show = id => { const c = store.cvik.get(id); put(body, exerciseContent(c, show)); const t = body.closest('.sheet__panel')?.querySelector('.sheet__head h2'); if (t) t.textContent = c.nazev; body.closest('.sheet__panel')?.scrollTo(0, 0); };
  openSheet(cvik.nazev, body, { full: true });
  show(cvikId);
}

export function render(root, params, nav) {
  const cvik = store.cvik.get(params[0]);
  if (!cvik) { nav.setTitle('Cvik'); put(root, h('div', { class: 'empty' }, h('h2', { text: 'Cvik nenalezen' }))); return; }
  nav.setTitle(cvik.nazev);
  put(root, h('div', { class: 'narrow' }, exerciseContent(cvik, id => nav.go('#/cvik/' + id))));
  return { refresh: () => {} };
}
