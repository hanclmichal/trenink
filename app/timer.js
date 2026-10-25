// Rest timer shown above the tab bar after a set is ticked off, and the screen wake lock
// that keeps the display on while a training is open.
import { h, icon, put } from './ui.js';
import { mmss } from './format.js';

let el = null, end = 0, total = 0, tick = 0, label = '', kind = 'pauza', doneTimer = 0;

export const prefs = {
  get sound() { try { return localStorage.getItem('zvuk') !== '0'; } catch (e) { return true; } },
  set sound(v) { try { localStorage.setItem('zvuk', v ? '1' : '0'); } catch (e) { /* ignore */ } },
  get wake() { try { return localStorage.getItem('wake') !== '0'; } catch (e) { return true; } },
  set wake(v) { try { localStorage.setItem('wake', v ? '1' : '0'); } catch (e) { /* ignore */ } }
};

let audio = null;
function beep() {
  if (!prefs.sound) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    for (const [i, f] of [[0, 880], [0.18, 1175]]) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t + i); g.gain.exponentialRampToValueAtTime(0.25, t + i + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i + 0.16);
      o.connect(g).connect(audio.destination); o.start(t + i); o.stop(t + i + 0.18);
    }
  } catch (e) { /* audio unavailable */ }
}
/** iOS only plays sound from a context created during a tap: call this from the tap that starts the timer. */
export function unlockAudio() {
  if (!prefs.sound) return;
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch (e) { /* ignore */ }
}

function ensure() {
  if (el) return el;
  el = h('div', { class: 'rest', role: 'timer', 'aria-live': 'off', hidden: true });
  document.body.append(el);
  return el;
}

function render() {
  const left = Math.max(0, (end - Date.now()) / 1000);
  const done = left <= 0;
  ensure().classList.toggle('rest--done', done);
  put(el,
    h('div', { class: 'rest__bar', style: { width: `${done ? 100 : (1 - left / total) * 100}%` } }),
    h('span', { class: 'rest__ico' }, icon('timer')),
    h('div', { class: 'rest__t' }, h('b', { text: done ? (kind === 'kardio' ? 'Kardio je hotové' : 'Pauza je u konce') : mmss(left) }), h('small', { text: done ? (kind === 'kardio' ? 'Odškrtni ho v tréninku' : label) : `${kind} · ${label}` })),
    done ? null : h('button', { class: 'rest__btn', type: 'button', 'aria-label': 'Ubrat 15 sekund', onclick: () => { end -= 15000; render(); } }, '−15'),
    done ? null : h('button', { class: 'rest__btn', type: 'button', 'aria-label': 'Přidat 15 sekund', onclick: () => { end += 15000; total += 15; render(); } }, '+15'),
    h('button', { class: 'rest__btn rest__x', type: 'button', 'aria-label': 'Zavřít pauzu', onclick: stopRest }, icon('close')));
  if (done && tick) {
    clearInterval(tick); tick = 0;
    beep();
    clearTimeout(doneTimer);
    doneTimer = setTimeout(stopRest, kind === 'kardio' ? 30000 : 12000);
  }
}

export function startRest(seconds, what = '', what2 = 'pauza') {
  if (!seconds) return;
  unlockAudio();
  clearInterval(tick); clearTimeout(doneTimer);
  total = seconds; end = Date.now() + seconds * 1000; label = what; kind = what2;
  ensure().hidden = false;
  document.body.classList.add('has-rest');
  render();
  tick = setInterval(render, 500);
}
export function stopRest() {
  clearInterval(tick); tick = 0; clearTimeout(doneTimer);
  if (el) el.hidden = true;
  document.body.classList.remove('has-rest');
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && tick) render(); });

/* ---------- wake lock ---------- */
let lock = null, wanted = false;
async function acquire() {
  if (!wanted || !prefs.wake || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } catch (e) { lock = null; }
}
export function keepAwake(on) {
  wanted = on;
  if (on) { if (!lock) acquire(); }
  else if (lock) { lock.release().catch(() => {}); lock = null; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && wanted && !lock) acquire(); });
