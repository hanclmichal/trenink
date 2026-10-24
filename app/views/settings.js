// "Nastavení": repository connection, training days, return phase, timer, appearance, storage.
import { store, setConn, resetLocal, pendingFiles, pendingMedia, removeFile, saveKalendar, savePlan } from '../store.js';
import { sync, testConnection, status } from '../sync.js';
import { h, put, toast, openSheet, closeSheet, confirmSheet, fmtTime } from '../ui.js';
import { plural, DOW_SHORT, DOW_LONG, dm } from '../format.js';
import { prefs } from '../timer.js';

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens';

function connectForm(nav, onDone) {
  const c = store.conn || {};
  const owner = h('input', { class: 'field', type: 'text', value: c.owner || 'hanclmichal', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
  const repo = h('input', { class: 'field', type: 'text', value: c.repo || 'trenink-data', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
  const token = h('input', { class: 'field', type: 'password', placeholder: c.token ? 'Uložený klíč zůstane, pokud pole necháte prázdné' : 'github_pat_…', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const branch = h('input', { class: 'field', type: 'text', value: c.branch || 'main', autocapitalize: 'off' });
  const msg = h('p', { class: 'muted', role: 'status' });
  const btn = h('button', { class: 'btn btn--primary', type: 'submit' }, store.conn ? 'Uložit a synchronizovat' : 'Připojit a stáhnout');
  return h('form', { class: 'form', onsubmit: async ev => {
    ev.preventDefault();
    const conn = { owner: owner.value.trim(), repo: repo.value.trim(), branch: branch.value.trim() || 'main', token: token.value.trim() || c.token || '' };
    if (!conn.owner || !conn.repo || !conn.token) { msg.textContent = 'Vyplňte vlastníka, úložiště a přístupový klíč.'; return; }
    btn.disabled = true;
    msg.textContent = 'Ověřuji přístup…';
    try {
      await testConnection(conn);
      const changedRepo = c.owner && (c.owner !== conn.owner || c.repo !== conn.repo);
      if (changedRepo) await resetLocal();
      await setConn(conn);
      msg.textContent = 'Stahuji data…';
      const r = await sync();
      msg.textContent = '';
      toast(`Připojeno. Staženo ${r.pulled} ${plural(r.pulled, 'soubor', 'soubory', 'souborů')}.`);
      onDone();
    } catch (e) {
      msg.textContent = e.message || String(e);
    } finally { btn.disabled = false; }
  } },
    h('label', { class: 'form__row' }, h('span', { class: 'form__label', text: 'Vlastník' }), owner),
    h('label', { class: 'form__row' }, h('span', { class: 'form__label', text: 'Úložiště' }), repo),
    h('label', { class: 'form__row' }, h('span', { class: 'form__label', text: 'Přístupový klíč' }), token,
      h('span', { class: 'muted small' }, 'Fine-grained token s přístupem k úložišti trenink-data a oprávněním Contents: Read and write. Může to být stejný token jako pro IT Pojmy, když mu přidáš i toto úložiště. ', h('a', { href: TOKEN_URL, target: '_blank', rel: 'noopener noreferrer', text: 'Tokeny na GitHubu' }))),
    h('details', { class: 'adv' }, h('summary', { text: 'Pokročilé' }),
      h('label', { class: 'form__row' }, h('span', { class: 'form__label', text: 'Větev' }), branch)),
    msg,
    h('div', { class: 'row-actions' }, btn));
}

export function render(root, params, nav) {
  nav.setTitle('Nastavení');
  async function draw() {
    const pend = pendingFiles();
    const pm = pendingMedia();
    const c = store.conn;
    const box = h('div', { class: 'settings narrow' });
    const standalone = (window.navigator.standalone === true) || matchMedia('(display-mode: standalone)').matches;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (ios && !standalone) {
      box.append(h('div', { class: 'note note--soft' },
        h('strong', { text: 'Nejdřív si aplikaci přidej na plochu' }),
        h('p', { text: 'V Safari klepni na Sdílet a zvol Přidat na plochu. Aplikace na ploše má vlastní úložiště, takže připojení nastav až v ní.' })));
    }
    if (!c) {
      box.append(h('section', { class: 'panel' },
        h('h2', { text: 'Připojení k úložišti' }),
        h('p', { text: 'Aplikace si stáhne plán a tréninky ze soukromého úložiště na GitHubu a uloží je do telefonu. Pak funguje i bez internetu a změny odešle, jakmile bude signál.' }),
        connectForm(nav, () => nav.go('#/dnes'))));
      put(root, box);
      return;
    }
    const err = status.error;
    box.append(h('section', { class: 'panel' },
      h('h2', { text: 'Úložiště' }),
      h('dl', { class: 'kv' },
        h('dt', { text: 'Připojeno' }), h('dd', null, h('a', { href: `https://github.com/${c.owner}/${c.repo}`, target: '_blank', rel: 'noopener noreferrer', text: `${c.owner}/${c.repo}` })),
        h('dt', { text: 'Poslední synchronizace' }), h('dd', { text: store.lastSync ? fmtTime.format(new Date(store.lastSync)) : 'zatím neproběhla' }),
        h('dt', { text: 'Čeká na odeslání' }), h('dd', { text: pend.length + pm.length ? [...pend.map(f => f.path.replace(/^treninky\//, 'trénink ').replace(/\.json$/, '')), ...pm.map(m => m.path)].join(', ') : 'nic' }),
        err ? h('dt', { text: 'Poslední chyba' }) : null, err ? h('dd', { class: 'warn', text: err.message }) : null),
      h('div', { class: 'row-actions row-actions--wrap' },
        h('button', { class: 'btn btn--primary', type: 'button', onclick: () => nav.runSync(true) }, 'Synchronizovat teď'),
        h('button', { class: 'btn', type: 'button', onclick: () => openSheet('Připojení', connectForm(nav, () => { closeSheet(); draw(); })) }, 'Změnit připojení'))));

    // training days
    const days = store.kalendar.vychoziDny || [];
    box.append(h('section', { class: 'panel' },
      h('h2', { text: 'Běžné tréninkové dny' }),
      h('p', { class: 'muted small', text: 'Na tyhle dny se tréninky plánují samy. Jednotlivé dny přidáš nebo zrušíš v kalendáři.' }),
      h('div', { class: 'seg seg--days', role: 'group', 'aria-label': 'Běžné tréninkové dny' }, [1, 2, 3, 4, 5, 6, 0].map(d =>
        h('button', { type: 'button', 'aria-pressed': String(days.includes(d)), 'aria-label': DOW_LONG[d], onclick: async () => {
          await saveKalendar(k => { const set = new Set(k.vychoziDny || []); set.has(d) ? set.delete(d) : set.add(d); k.vychoziDny = [...set].sort(); });
          draw();
        } }, DOW_SHORT[d]))),
      h('p', { class: 'small', text: `${days.length} ${plural(days.length, 'den', 'dny', 'dní')} v týdnu.` + (days.length > 4 ? ' Plán je stavěný na 3 tréninky týdně.' : '') })));

    // return phase
    const nv = store.plan.navrat || {};
    const navIn = h('input', { class: 'field', type: 'date', value: nv.do || '' });
    navIn.addEventListener('change', async () => { await savePlan(p => { p.navrat = { ...(p.navrat || { rir: 3, popis: '' }), do: navIn.value || null }; if (!navIn.value) delete p.navrat; }); toast(navIn.value ? `Návrat po pauze do ${dm(navIn.value)}.` : 'Fáze návratu vypnutá.'); });
    box.append(h('section', { class: 'panel' },
      h('h2', { text: 'Návrat po pauze' }),
      h('p', { class: 'muted small', text: 'Do tohoto dne mají hlavní cviky cíl RIR 3 a začínají na lehčích vahách. Když jde série snadno, aplikace navrhne větší skok.' }),
      h('label', { class: 'form__row' }, h('span', { class: 'form__label', text: 'Platí do' }), navIn)));

    // training screen
    const toggle = (label, get, set, note) => h('label', { class: 'switch' },
      h('input', { type: 'checkbox', checked: get() ? true : null, onchange: ev => set(ev.target.checked) }),
      h('span', { class: 'switch__t' }, h('b', { text: label }), note ? h('small', { class: 'muted', text: note }) : null));
    box.append(h('section', { class: 'panel' },
      h('h2', { text: 'Během tréninku' }),
      toggle('Zvuk na konci pauzy', () => prefs.sound, v => { prefs.sound = v; }, 'Dvě krátká pípnutí. V tichém režimu iPhonu se nepřehrají.'),
      toggle('Nezhasínat displej', () => prefs.wake, v => { prefs.wake = v; }, 'Jen když máš otevřený dnešní trénink.')));

    const conflicts = [...store.files.values()].filter(f => f.path.startsWith('konflikty/') && !f.deleted).sort((a, b) => b.path.localeCompare(a.path));
    if (conflicts.length) {
      box.append(h('section', { class: 'panel' },
        h('h2', { text: 'Konflikty' }),
        h('p', { class: 'muted', text: 'Verze z úložiště, které se nedaly sloučit se změnou z telefonu. Telefon si ponechal svou verzi; tahle kopie je pro kontrolu.' }),
        h('ul', { class: 'choices' }, conflicts.map(f => h('li', null, h('button', { type: 'button', onclick: () => {
          openSheet(f.path.replace('konflikty/', ''), h('pre', { class: 'code', text: f.text }), { full: true, action: h('button', { class: 'btn btn--sm btn--danger-quiet', type: 'button', onclick: () => confirmSheet('Smazat kopii?', 'Kopie zmizí z telefonu i z úložiště.', 'Smazat', async () => { await removeFile(f.path); closeSheet(); toast('Kopie smazána.'); draw(); }, true) }, 'Smazat') });
        } }, h('span', { class: 'pick__t' }, h('b', { text: f.path.replace('konflikty/', '').replace(/\.json$/, '') }), h('small', { text: 'Zobrazit' }))))))));
    }

    let theme = 'system';
    try { theme = localStorage.getItem('theme') || 'system'; } catch (e) { /* storage blocked */ }
    box.append(h('section', { class: 'panel' },
      h('h2', { text: 'Vzhled' }),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Vzhled' }, [['system', 'Podle systému'], ['light', 'Světlý'], ['dark', 'Tmavý']].map(([k, l]) =>
        h('button', { type: 'button', 'aria-pressed': String(theme === k), onclick: () => { try { localStorage.setItem('theme', k); } catch (e) { /* ignore */ } nav.applyTheme(k); draw(); } }, l)))));

    const offline = h('dl', { class: 'kv' });
    box.append(h('section', { class: 'panel' }, h('h2', { text: 'Data v telefonu' }), offline,
      h('div', { class: 'row-actions row-actions--wrap' },
        h('button', { class: 'btn', type: 'button', onclick: () => nav.go('#/plan') }, 'Tréninkový plán'),
        h('button', { class: 'btn btn--danger-quiet', type: 'button', onclick: () => confirmSheet('Načíst vše znovu?', pend.length + pm.length ? `Smaže kopii v telefonu i ${pend.length + pm.length} neodeslaných změn a stáhne vše znovu z GitHubu.` : 'Smaže kopii v telefonu a stáhne vše znovu z GitHubu. Stažená videa se stáhnou až při otevření.', 'Načíst znovu', async () => {
          await resetLocal();
          try { await sync(); toast('Staženo znovu.'); } catch (e) { toast(e.message); }
        }, true) }, 'Načíst vše znovu z GitHubu'))));

    box.append(h('p', { class: 'muted small center', text: `Trénink ${nav.version} · data zůstávají v telefonu a ve tvém úložišti na GitHubu.` }));
    put(root, box);

    let persisted = false, est = null;
    try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false; } catch (e) { /* ignore */ }
    try { est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; } catch (e) { /* ignore */ }
    put(offline,
      h('dt', { text: 'Tréninky' }), h('dd', { text: String(store.sessions.size) }),
      h('dt', { text: 'Trvalé úložiště' }), h('dd', { text: persisted ? 'ano, systém data nesmaže' : 'nepotvrzeno (aplikace přidaná na plochu má vlastní úložiště)' }),
      est ? h('dt', { text: 'Obsazeno' }) : null, est ? h('dd', { text: `${(est.usage / 1048576).toFixed(1)} MB` }) : null);
  }
  draw();
  return { refresh: draw };
}
