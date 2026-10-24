// Muscle map: a front and a back figure with the exercise's target muscles highlighted.
// Shapes are drawn for the left half (x < 60) and mirrored.
import { s } from './ui.js';
import { SVALY } from './data.js';

const SIL = {
  arm: 'M31 46C24 46 19 52 18 62C17 74 17 86 18 98C16 108 14 120 15 134L14 147C16 152 22 152 24 147L25 134C27 122 29 110 29 100C31 88 32 74 32 60Z',
  torso: 'M60 37L47 39C39 41 33 44 31 50C30 58 32 66 34 72C35 84 36 98 37 110L38 121L60 123Z',
  leg: 'M38 118C35 132 34 150 35 168C36 177 37 186 38 194C36 206 37 220 39 233L37 242L50 242L50 233C52 220 53 206 52 194C54 184 55 176 56 166C58 152 59 138 60 124Z'
};

const FRONT = {
  'ramena-bocni': 'M31 46C24 46 19.5 51 18.5 60L22 62.5C23 56 26 50.5 31 48.5Z',
  'ramena-predni': 'M31 48.5C26 50.5 23 56 22 62.5C25.5 65 29.5 65.5 33 63.5C34 58 35 53 35.5 50C34 49 32.5 48.5 31 48.5Z',
  'hrudnik': 'M59 47C52 46 43 46 37 50C34 55 34 62 37 67C44 72 53 72 59 69Z',
  'biceps': 'M22 66C20 74 19.5 84 20.5 95L28 95C29.5 86 30.5 76 31 66C28 67.5 25 67.5 22 66Z',
  'predlokti': 'M18.5 100C16.5 111 15.5 123 16 133L24 133C26 123 27.5 112 28.5 100C25 101.5 21.5 101.5 18.5 100Z',
  'brisni': 'M51.5 74L59 74L59 117L53 115.5C51.5 104 51 89 51.5 74Z',
  'sikme': 'M37.5 71C36.5 83 37.5 97 39.5 110L52 115.5C50.5 104 49.5 89 50 74C45 74 41 73 37.5 71Z',
  'kvadricepsy': 'M39.5 124C35.5 138 35.5 155 37.5 171C40.5 179 46 181 52 179C55 165 56.5 148 56.5 129C51 128 45 126.5 39.5 124Z',
  'adduktory': 'M57 129.5C57.5 141 57 153 55 166C57.5 158 59 145 59 131Z',
  'lytka': 'M39.5 197C37.5 207 38 218 40.5 228L45.5 228C44.5 217 44.5 206 45 197Z'
};

const BACK = {
  'trapezy': 'M59 34C56 38 50 41 41 44C47 46 53 50 59 55Z',
  'ramena-zadni': 'M41 44.5C34 44 28 46 24.5 50.5C26.5 55 31 58 35.5 58C37.5 54 39 49 41 44.5Z',
  'ramena-bocni': 'M24.5 50.5C20.5 54 18.5 58 18.5 62.5L22 63.5C23 59.5 25 56 28 55Z',
  'triceps': 'M22 66C20 76 19.5 86 20.5 97L28 97C29.5 87 30.5 76 31.5 62.5C28.5 64.5 25 65.5 22 66Z',
  'predlokti': 'M18.5 101C16.5 112 15.5 123 16 133L24 133C26 123 27.5 112 28.5 101C25 102.5 21.5 102.5 18.5 101Z',
  'stred-zad': 'M41.5 47C47 49 53 53 59 57.5L59 84C55 74 49 62 39.5 54.5Z',
  'siroky-zadovy': 'M36 58C35 72 37 88 44 103C48.5 101 52 97 54.5 91C51.5 79 46 67 39 56.5Z',
  'bederni': 'M53.5 92L59 92L59 117L54.5 116C53 108 53 100 53.5 92Z',
  'hyzde': 'M39.5 117C35.5 127 37 138 45 142C51 144 56.5 142 59 137.5L59 119C53 119 46 118 39.5 117Z',
  'hamstringy': 'M38.5 146C35.5 158 36 170 39 180C44 183 50 183 54 180C56 168 57.5 156 58 144.5C51 146.5 44.5 146.5 38.5 146Z',
  'lytka': 'M38.5 192C34.5 202 35.5 214 39.5 222C42.5 224 47 224 50 222C53 212 53 202 51 192C47 194 42.5 194 38.5 192Z'
};

function figure(x, regions, hl, ved, label) {
  const g = s('g', { transform: `translate(${x} 0)` });
  const both = (d, cls) => [s('path', { d, class: cls }), s('path', { d, class: cls, transform: 'translate(120 0) scale(-1 1)' })];
  g.append(s('circle', { cx: 60, cy: 20, r: 12.5, class: 'm-sil' }), s('rect', { x: 54, y: 30, width: 12, height: 10, class: 'm-sil' }));
  for (const d of Object.values(SIL)) g.append(...both(d, 'm-sil'));
  for (const [id, d] of Object.entries(regions)) {
    const cls = hl.includes(id) ? 'm-reg m-hl' : ved.includes(id) ? 'm-reg m-ved' : 'm-reg';
    for (const el of both(d, cls)) { el.append(s('title', null, SVALY[id] || id)); g.append(el); }
  }
  g.append(s('text', { x: 60, y: 258, class: 'm-cap', 'text-anchor': 'middle' }, label));
  return g;
}

/** SVG with front and back views. */
export function muscleMap(cvik) {
  const hl = cvik.hlavni || [], ved = cvik.vedlejsi || [];
  const svg = s('svg', { viewBox: '0 0 260 264', class: 'mmap', role: 'img', 'aria-label': 'Procvičované partie: ' + [...hl, ...ved].map(m => SVALY[m] || m).join(', ') });
  svg.append(figure(4, FRONT, hl, ved, 'zepředu'), figure(136, BACK, hl, ved, 'zezadu'));
  return svg;
}
