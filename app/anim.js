// Own exercise animations: a jointed figure drawn in SVG and moved with simple kinematics.
// Every exercise defines pose(k) for k in [0, 1] (0 = start position, 1 = the other end of the movement);
// the player eases between them in a loop, like a GIF. Segments that carry the exercise's target
// muscles are tinted (primary = accent, secondary = lighter accent).
import { s } from './ui.js';

const R = Math.PI / 180;
const P = (x, y) => ({ x, y });
const at = (p, len, deg) => P(p.x + len * Math.cos(deg * R), p.y + len * Math.sin(deg * R));
const ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x) / R;
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const mix = (a, b, t) => a + (b - a) * t;
const mixP = (a, b, t) => P(mix(a.x, b.x, t), mix(a.y, b.y, t));
const add = (p, dx, dy) => P(p.x + dx, p.y + dy);

/** Body proportions (px), roughly a 188 cm figure at 1 px ≈ 1.25 cm. */
const L = { shin: 37, thigh: 36, torso: 45, upper: 28, fore: 27, neck: 5, head: 9.5, foot: 13 };
const W = 200, H = 196, FLOOR = 189;

/** Two-bone inverse kinematics: joint between a and c. bend +1 = counter-clockwise side of a→c. */
function ik(a, c, l1, l2, bend) {
  let d = dist(a, c);
  d = Math.min(Math.max(d, Math.abs(l1 - l2) + 0.01), l1 + l2 - 0.01);
  const base = Math.atan2(c.y - a.y, c.x - a.x);
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const A = Math.acos(Math.max(-1, Math.min(1, cosA)));
  return P(a.x + l1 * Math.cos(base + bend * A), a.y + l1 * Math.sin(base + bend * A));
}
/** Arm from shoulder to a hand target; the hand is clamped to the reachable distance. */
function arm(shoulder, target, bend) {
  const elbow = ik(shoulder, target, L.upper, L.fore, bend);
  return { elbow, wrist: at(elbow, L.fore, ang(elbow, target)) };
}
/** Leg from hip to a foot target (knee by IK). */
function leg(hip, ankle, bend) {
  const knee = ik(hip, ankle, L.thigh, L.shin, bend);
  return { knee, ankle: at(knee, L.shin, ang(knee, ankle)) };
}
/** Standing chain from a fixed ankle: shin and thigh angles are absolute (0 = right, 90 = up). */
function stand(ankle, shin, thigh) {
  const knee = at(ankle, L.shin, shin);
  return { ankle, knee, hip: at(knee, L.thigh, thigh) };
}
const hang = sh => { const elbow = add(sh, 0.5, -L.upper); return { elbow, wrist: add(elbow, 0.5, -L.fore) }; };

/* ---------- gear ---------- */
const plate = (c, r = 17) => ({ t: 'plate', c, r });
const db = c => ({ t: 'db', c });
const line = (a, b, w = 3, cls = 'g') => ({ t: 'line', a, b, w, cls });
const cable = (a, b) => ({ t: 'line', a, b, w: 1.2, cls: 'cable' });
const pulley = c => ({ t: 'pulley', c });
const box = (x, y, w, h) => ({ t: 'rect', x, y, w, h });
const poly = pts => ({ t: 'poly', pts });
/** Flat bench: top surface at height y from x1 to x2, with legs. */
const bench = (x1, x2, y = 33) => [box(x1, y - 5, x2 - x1, 5), line(P(x1 + 6, 0), P(x1 + 6, y - 5), 3), line(P(x2 - 6, 0), P(x2 - 6, y - 5), 3)];
/** Inclined back pad along a line from p (seat end) at angle deg, offset behind the body. */
const pad = (p, deg, len, off = 5) => { const a = at(p, off, deg - 90 * Math.sign(Math.cos(deg * R) || 1)); return line(a, at(a, len, deg), 6, 'pad'); };

/* ---------- exercise poses ---------- */

function squatPose(k, o) {
  const ankle = P(98, 5);
  const { knee, hip } = stand(ankle, mix(88, o.shin, k), mix(93, o.thigh, k));
  const torso = mix(88, o.torso, k);
  const shoulder = at(hip, L.torso, torso);
  return { ankle, knee, hip, shoulder, torso };
}

function benchBody(hipX = 98, y = 39) {
  const hip = P(hipX, y), shoulder = P(hipX - L.torso, y + 1);
  const { knee, ankle } = leg(hip, P(hipX + 26, 5), 1);
  return { hip, shoulder, knee, ankle };
}

function seatedBody(hip, torsoDeg, ankle = add(hip, 34, -38)) {
  const shoulder = at(hip, L.torso, torsoDeg);
  const { knee, ankle: a } = leg(hip, ankle, 1);
  return { hip, shoulder, knee, ankle: a };
}

const EX = {
  'back-squat': { pose: k => {
    const b = squatPose(k, { shin: 57, thigh: 178, torso: 56 });
    const bar = at(at(b.shoulder, 4, b.torso + 90), 2, b.torso + 180);
    return { ...b, ...arm(b.shoulder, at(bar, 2, b.torso - 90), 1), gear: [plate(bar)] };
  } },
  'front-squat': { pose: k => {
    const b = squatPose(k, { shin: 52, thigh: 180, torso: 73 });
    const bar = at(at(b.shoulder, 5, b.torso - 90), 1, b.torso + 180);
    const elbow = at(b.shoulder, L.upper, b.torso - 75);
    return { ...b, elbow, wrist: bar, gear: [plate(bar)] };
  } },
  'goblet-squat': { pose: k => {
    const b = squatPose(k, { shin: 55, thigh: 180, torso: 70 });
    const elbow = at(b.shoulder, L.upper, b.torso - 165);
    const wrist = at(elbow, L.fore, b.torso - 20);
    return { ...b, elbow, wrist, gear: [db(wrist)] };
  } },
  'leg-press': { pose: k => {
    const hip = P(68, 34);
    const shoulder = at(hip, L.torso, 128);
    const dir = 38;
    const foot = at(hip, mix(70, 36, k), dir);
    const { knee, ankle } = leg(hip, foot, 1);
    const toe = at(ankle, L.foot, dir + 90);
    const pa = at(ankle, 18, dir + 90), pb = at(ankle, 12, dir - 90);
    return { hip, shoulder, knee, ankle, toe, ...arm(shoulder, add(hip, 6, 4), -1),
      back: [line(at(at(hip, 22, dir), 17, dir - 90), at(at(hip, 135, dir), 17, dir - 90), 4, 'pad'), line(add(hip, -14, -6), add(hip, 10, -6), 7, 'pad'), pad(hip, 128, 50, 7)],
      gear: [line(pa, pb, 6, 'g')] };
  } },
  'bulgarian-split-squat': { pose: k => {
    const ankle = P(122, 5);
    const { knee, hip } = stand(ankle, mix(84, 66, k), mix(100, 164, k));
    const shoulder = at(hip, L.torso, mix(86, 76, k));
    const back = leg(hip, P(62, 36), 1);
    return { ankle, knee, hip, shoulder, ...hang(shoulder), far: { leg: { knee: back.knee, ankle: back.ankle, toe: P(49, 36) } },
      back: bench(36, 72, 34), gear: [db(add(shoulder, 1, -55))] };
  } },
  'dumbbell-lunge': { pose: k => lungePose(k) },
  'reverse-lunge': { pose: k => lungePose(k) },
  'step-up': { pose: k => {
    const front = P(124, 25);
    const hip = P(mix(100, 121, k), mix(62, 96, k));
    const f = leg(hip, front, 1);
    const shoulder = at(hip, L.torso, mix(80, 88, k));
    const backAnkle = mixP(P(80, 5), P(102, 46), Math.max(0, k * 1.3 - 0.3));
    const b = leg(hip, backAnkle, 1);
    return { hip, shoulder, knee: f.knee, ankle: f.ankle, ...hang(shoulder),
      far: { leg: { knee: b.knee, ankle: b.ankle, toe: at(b.ankle, L.foot, k > 0.5 ? -10 : 0) } },
      back: [box(104, 0, 44, 20)], gear: [db(add(shoulder, 1, -55))] };
  } },
  'deadlift': { pose: k => hingeFromFloor(k, { barX: 104, shin0: 75, sh0: P(108, 73), r: 17 }) },
  'trap-bar-deadlift': { pose: k => hingeFromFloor(k, { barX: 99, shin0: 66, sh0: P(104, 80), r: 15 }) },
  'rdl': { pose: k => {
    const ankle = P(98, 5);
    const knee = at(ankle, L.shin, 84);
    const bar = P(106, mix(66, 33, k));
    const shoulder = P(bar.x + mix(1, 6, k), bar.y + mix(55, 53, k));
    const hip = ik(knee, shoulder, L.thigh, L.torso, 1);
    return { ankle, knee, hip, shoulder, ...arm(shoulder, bar, 1), gear: [plate(bar)] };
  } },
  'hip-thrust': { pose: k => {
    const shoulder = P(40, 40);
    const hip = at(shoulder, L.torso, mix(-37, 2, k));
    const { knee, ankle } = leg(hip, P(116, 5), 1);
    const bar = add(hip, 2, 11);
    return { hip, shoulder, knee, ankle, ...arm(shoulder, bar, -1), headDeg: mix(160, 175, k), back: bench(14, 46, 34), gear: [plate(bar, 15)] };
  } },
  'leg-curl': { pose: k => {
    const hip = P(88, 40), shoulder = P(43, 40);
    const knee = P(124, 40);
    const ankle = at(knee, L.shin, mix(0, 105, k));
    return { hip, shoulder, knee, ankle, toe: at(ankle, 10, mix(-80, 20, k)), elbow: P(47, 34), wrist: P(70, 34), headDeg: 175,
      back: bench(28, 130, 34), gear: [{ t: 'circle', c: at(ankle, 6, mix(90, 195, k)), r: 5 }] };
  } },
  'back-extension': { pose: k => {
    const ankle = P(52, 12), hip = at(ankle, L.shin + L.thigh - 2, 40);
    const knee = at(ankle, L.shin, 40);
    const torso = mix(-48, 40, k);
    const shoulder = at(hip, L.torso, torso);
    const chest = at(at(shoulder, 10, torso + 180), 6, torso - 90);
    return { ankle, knee, hip, shoulder, ...arm(shoulder, chest, 1), toe: at(ankle, 11, 130),
      back: [line(add(hip, 4, -9), add(hip, 14, 3), 7, 'pad'), line(P(48, 3), P(60, 0), 6, 'pad'), line(add(hip, 9, -3), P(96, 0), 3), line(P(54, 4), P(60, 0), 3)] };
  } },
  'bench-press': { pose: k => benchPress(k, { r: 17 }) },
  'paused-bench': { holdB: 0.22, pose: k => benchPress(k, { r: 17 }) },
  'close-grip-bench': { pose: k => benchPress(k, { r: 17, low: 2 }) },
  'incline-bench': { pose: k => inclinePress(k, false) },
  'db-bench': { pose: k => benchPress(k, { dumbbell: true }) },
  'incline-db-press': { pose: k => inclinePress(k, true) },
  'dips': { pose: k => {
    const hand = P(104, 84);
    const shoulder = P(mix(101, 108, k), mix(138, 109, k));
    const torso = mix(-94, -112, k);
    const hip = at(shoulder, L.torso, torso);
    const knee = at(hip, L.thigh, torso + 25);
    const ankle = at(knee, L.shin, torso - 70);
    return { shoulder, hip, knee, ankle, toe: at(ankle, 10, -60), ...arm(shoulder, hand, 1), headDeg: torso + 180 + mix(4, 12, k),
      back: [line(P(124, 0), P(124, 84), 3, 'pad'), line(P(86, 84), P(124, 84), 4, 'pad')], gear: [line(P(90, 84), P(118, 84), 4)] };
  } },
  'chest-press-machine': { pose: k => {
    const b = seatedBody(P(70, 44), 95);
    const target = add(b.shoulder, mix(14, 50, k), -6);
    const a = arm(b.shoulder, target, -1);
    return { ...b, ...a, back: [pad(b.hip, 95, 50), line(add(b.hip, -12, -6), add(b.hip, 14, -6), 7, 'pad'), line(add(b.hip, 0, -9), P(70, 0), 3)], gear: [line(add(a.wrist, 0, -7), add(a.wrist, 0, 7), 5)] };
  } },
  'ohp': { pose: k => {
    const ankle = P(98, 5);
    const { knee, hip } = stand(ankle, 90, 90);
    const shoulder = at(hip, L.torso, mix(92, 89, k));
    const bar = P(shoulder.x + mix(6, 1, k), shoulder.y + mix(2, 53, k));
    return { ankle, knee, hip, shoulder, ...arm(shoulder, bar, -1), headDeg: mix(96, 90, k), gear: [plate(bar, 13)] };
  } },
  'seated-db-press': { pose: k => {
    const b = seatedBody(P(80, 44), 94);
    const t = add(b.shoulder, mix(3, 0, k), mix(6, 54, k));
    return { ...b, ...arm(b.shoulder, t, -1), back: [pad(b.hip, 94, 52), line(add(b.hip, -12, -6), add(b.hip, 16, -6), 7, 'pad'), line(add(b.hip, 0, -9), P(80, 0), 3)], gear: [db(t)] };
  } },
  'shoulder-press-machine': { pose: k => {
    const b = seatedBody(P(80, 44), 94);
    const t = add(b.shoulder, mix(4, 1, k), mix(6, 52, k));
    const a = arm(b.shoulder, t, -1);
    return { ...b, ...a, back: [pad(b.hip, 94, 52), line(add(b.hip, -12, -6), add(b.hip, 16, -6), 7, 'pad'), line(add(b.hip, 0, -9), P(80, 0), 3)], gear: [line(add(a.wrist, -7, 0), add(a.wrist, 7, 0), 5)] };
  } },
  'barbell-row': { pose: k => {
    const ankle = P(96, 5);
    const { knee, hip } = stand(ankle, 76, 141);
    const torso = 38;
    const shoulder = at(hip, L.torso, torso);
    const hangPt = add(shoulder, 1, -54);
    const belly = at(at(hip, 15, torso), 7, torso - 90);
    const a = arm(shoulder, mixP(hangPt, belly, k), -1);
    return { ankle, knee, hip, shoulder, ...a, gear: [plate(a.wrist)] };
  } },
  'db-row': { pose: k => {
    const hip = P(70, 62), shoulder = P(115, 63);
    const st = leg(hip, P(60, 5), 1);
    const hangPt = add(shoulder, 0, -54), up = add(hip, 14, -4);
    const a = arm(shoulder, mixP(hangPt, up, k), 1);
    return { hip, shoulder, knee: st.knee, ankle: st.ankle, ...a, headDeg: 8,
      far: { leg: { knee: P(76, 35), ankle: P(42, 37), toe: P(31, 38) }, arm: { elbow: add(shoulder, -2, -16), wrist: P(112, 35) } },
      back: bench(36, 124, 34), gear: [db(a.wrist)] };
  } },
  'seated-cable-row': { pose: k => {
    const hip = P(64, 26);
    const torso = mix(98, 86, k);
    const shoulder = at(hip, L.torso, torso);
    const { knee, ankle } = leg(hip, P(126, 26), 1);
    const target = mixP(add(shoulder, 53, -6), add(hip, 16, 14), k);
    const a = arm(shoulder, target, -1);
    return { hip, shoulder, knee, ankle, toe: at(ankle, L.foot, 80), ...a,
      back: [box(40, 0, 50, 20), poly([P(130, 0), P(130, 40), P(136, 40), P(136, 0)]), pulley(P(178, 34))], gear: [cable(a.wrist, P(178, 34)), line(add(a.wrist, 0, -5), add(a.wrist, 0, 5), 4)] };
  } },
  'chest-supported-row': { pose: k => {
    const hip = P(76, 50), shoulder = at(hip, L.torso, 42);
    const { knee, ankle } = leg(hip, P(48, 5), -1);
    const hangPt = add(shoulder, 2, -54), up = at(at(hip, 14, 42), 6, -48);
    const a = arm(shoulder, mixP(hangPt, up, k), -1);
    const benchA = at(hip, 9, -48), benchB = at(benchA, 58, 42);
    return { hip, shoulder, knee, ankle, ...a,
      back: [line(benchA, benchB, 7, 'pad'), line(at(benchA, 20, 42), P(benchA.x + 30, 0), 3)], gear: [db(a.wrist)] };
  } },
  'pull-up': { pose: k => pullUp(k) },
  'chin-up': { pose: k => pullUp(k) },
  'lat-pulldown': { pose: k => pulldown(k) },
  'close-grip-pulldown': { pose: k => pulldown(k, true) },
  'ez-curl': { pose: k => curl(k, 'bar') },
  'hammer-curl': { pose: k => curl(k, 'db') },
  'cable-curl': { pose: k => curl(k, 'cable') },
  'incline-db-curl': { pose: k => {
    const b = seatedBody(P(86, 44), 118, P(128, 5));
    const elbow = add(b.shoulder, 0, -L.upper);
    const wrist = at(elbow, L.fore, mix(-90, 72, k));
    return { ...b, elbow, wrist, back: [pad(b.hip, 118, 52, 6), line(add(b.hip, -12, -6), add(b.hip, 16, -6), 7, 'pad'), line(add(b.hip, 0, -9), P(86, 0), 3)], gear: [db(wrist)] };
  } },
  'rope-pushdown': { pose: k => {
    const ankle = P(96, 5);
    const { knee, hip } = stand(ankle, 86, 98);
    const shoulder = at(hip, L.torso, 80);
    const elbow = add(shoulder, 3, -L.upper);
    const wrist = at(elbow, L.fore, mix(18, -86, k));
    return { ankle, knee, hip, shoulder, elbow, wrist, back: [pulley(P(122, 158)), line(P(128, 0), P(128, 162), 3)], gear: [cable(wrist, P(122, 158))] };
  } },
  'skull-crusher': { pose: k => {
    const b = benchBody();
    const elbow = at(b.shoulder, L.upper, 102);
    const wrist = at(elbow, L.fore, mix(98, 196, k));
    return { ...b, elbow, wrist, headDeg: 180, back: bench(26, 110, 34), gear: [plate(wrist, 9)] };
  } },
  'overhead-cable-extension': { pose: k => {
    const ankle = P(108, 5);
    const { knee, hip } = stand(ankle, 84, 100);
    const shoulder = at(hip, L.torso, 72);
    const elbow = at(shoulder, L.upper, 78);
    const wrist = at(elbow, L.fore, mix(-140, 70, k));
    const back = leg(hip, P(76, 5), -1);
    return { ankle, knee, hip, shoulder, elbow, wrist, far: { leg: { knee: back.knee, ankle: back.ankle, toe: at(back.ankle, 11, -15) } },
      back: [pulley(P(26, 40)), line(P(20, 0), P(20, 162), 3)], gear: [cable(wrist, P(26, 40))] };
  } },
  'lateral-raise': { view: 'front', pose: k => frontPose({ arm: mix(8, 86, k), bend: 12, gear: 'db' }) },
  'cable-lateral-raise': { view: 'front', pose: k => frontPose({ arm: mix(14, 86, k), bend: 10, gear: 'cable', oneArm: true }) },
  'face-pull': { pose: k => {
    const ankle = P(84, 5);
    const { knee, hip } = stand(ankle, 88, 94);
    const shoulder = at(hip, L.torso, 86);
    const target = mixP(add(shoulder, 54, 6), add(shoulder, 9, 15), k);
    const a = arm(shoulder, target, 1);
    return { ankle, knee, hip, shoulder, ...a, back: [pulley(P(176, 132)), line(P(184, 0), P(184, 162), 3)], gear: [cable(a.wrist, P(176, 132))] };
  } },
  'reverse-fly-machine': { view: 'front', pose: k => frontPose({ arm: 90, reach: mix(0.18, 1, k), bend: 8, seated: true, gear: 'handle' }) },
  'bent-over-reverse-fly': { pose: k => {
    // side view, torso almost horizontal; the arms rise out to the sides (towards the viewer), so they foreshorten
    const ankle = P(92, 5);
    const { knee, hip } = stand(ankle, 78, 132);
    const shoulder = at(hip, L.torso, 14);
    const c = Math.cos(mix(4, 84, k) * R);
    const elbow = add(shoulder, 2, -L.upper * c), wrist = add(elbow, 1, -L.fore * c);
    return { ankle, knee, hip, shoulder, elbow, wrist, far: { arm: { elbow: add(shoulder, -1, -L.upper * c + 1), wrist: add(shoulder, -1, -(L.upper + L.fore) * c + 1) } }, gear: [db(wrist)] };
  } },
  'plank': { still: true, pose: () => {
    const shoulder = P(126, 30), ankle = P(36, 7);
    const hip = at(ankle, L.shin + L.thigh, ang(ankle, shoulder));
    const knee = at(ankle, L.shin, ang(ankle, shoulder));
    return { ankle, knee, hip, shoulder, elbow: P(127, 4), wrist: P(146, 4), toe: P(37, 0), headDeg: 8 };
  } },
  'pallof-press': { pose: k => {
    const ankle = P(96, 5);
    const { knee, hip } = stand(ankle, 84, 98);
    const shoulder = at(hip, L.torso, 88);
    const chest = add(shoulder, 10, -12);
    const target = mixP(chest, add(shoulder, 50, -8), k);
    const a = arm(shoulder, target, -1);
    return { ankle, knee, hip, shoulder, ...a, back: [pulley(P(40, 106))], gear: [{ t: 'line', a: a.wrist, b: P(40, 106), w: 1.2, cls: 'cable dash' }] };
  } },
  'ab-wheel': { pose: k => {
    const knee = P(44, 5), ankle = P(10, 5);
    const hip = mixP(at(knee, L.thigh, 86), at(knee, L.thigh, 36), k);
    const torso = mix(18, 2, k);
    const shoulder = at(hip, L.torso, torso);
    const wheel = P(mix(shoulder.x + 4, shoulder.x + 46, k), 8);
    const a = arm(shoulder, wheel, 1);
    return { knee, ankle, hip, shoulder, ...a, toe: P(2, 1), gear: [{ t: 'wheel', c: P(a.wrist.x, 8), r: 8 }] };
  } },
  'hanging-leg-raise': { pose: k => {
    const bar = P(100, 180);
    const shoulder = P(99, 125);
    const hip = at(shoulder, L.torso, -92 + k * 6);
    const knee = at(hip, L.thigh, mix(-86, 8, k));
    const ankle = at(knee, L.shin, mix(-96, -52, k));
    return { shoulder, hip, knee, ankle, toe: at(ankle, 10, mix(-10, 20, k)), ...arm(shoulder, bar, 1),
      back: [line(P(56, 180), P(56, 0), 3, 'pad'), line(P(56, 180), P(132, 180), 4)] };
  } },
  'dead-bug': { pose: k => {
    const shoulder = P(58, 10), hip = P(103, 10);
    const knee = at(hip, L.thigh, 92), ankle = at(knee, L.shin, 2);
    const farKnee = at(hip, L.thigh, mix(92, 20, k)), farAnkle = at(farKnee, L.shin, mix(2, 12, k));
    const wrist0 = at(at(shoulder, L.upper, 90), L.fore, 90);
    const a = arm(shoulder, mixP(wrist0, at(shoulder, L.upper + L.fore - 2, 172), k), 1);
    return { shoulder, hip, knee, ankle, toe: at(ankle, 10, 80), ...a, headDeg: 180,
      far: { leg: { knee: farKnee, ankle: farAnkle, toe: at(farAnkle, 10, 80) }, arm: { elbow: at(shoulder, L.upper, 90), wrist: wrist0 } } };
  } }
};

function lungePose(k) {
  const front = P(132, 5), backToe = P(52, 2);
  const hip = P(mix(96, 92, k), mix(70, 42, k));
  const f = leg(hip, front, 1);
  const backAnkle = P(mix(62, 61, k), mix(10, 8, k));
  const b = leg(hip, backAnkle, 1);
  const shoulder = at(hip, L.torso, 88);
  return { hip, shoulder, knee: f.knee, ankle: f.ankle, ...hang(shoulder), far: { leg: { knee: b.knee, ankle: b.ankle, toe: backToe } }, gear: [db(add(shoulder, 1, -55))] };
}

function hingeFromFloor(k, o) {
  const ankle = P(98, 5);
  const ke = Math.min(1, k * 1.6);
  const knee = at(ankle, L.shin, mix(o.shin0, 90, ke));
  const lock = P(97, 124);
  const shoulder = mixP(o.sh0, lock, k);
  const bar = P(o.barX, mix(o.r + 1, 68, k));
  const hip = ik(knee, shoulder, L.thigh, L.torso, 1);
  return { ankle, knee, hip, shoulder, ...arm(shoulder, bar, 1), gear: [plate(bar, o.r)] };
}

function benchPress(k, o) {
  const b = benchBody();
  const top = add(b.shoulder, 4, L.upper + L.fore - 1);
  const chest = add(b.shoulder, 13 + (o.low || 0), 12);
  const a = arm(b.shoulder, mixP(top, chest, k), -1);
  return { ...b, ...a, headDeg: 180, back: bench(26, 110, 34), gear: [o.dumbbell ? db(a.wrist) : plate(a.wrist, o.r)] };
}

function inclinePress(k, dumbbell) {
  const hip = P(98, 36);
  const shoulder = at(hip, L.torso, 150);
  const { knee, ankle } = leg(hip, P(126, 5), 1);
  const top = add(shoulder, 0, L.upper + L.fore - 1);
  const chest = at(at(shoulder, 13, -30), 8, 60);
  const a = arm(shoulder, mixP(top, chest, k), -1);
  return { hip, shoulder, knee, ankle, ...a, headDeg: 150,
    back: [pad(hip, 150, 56, 6), line(add(hip, -8, -7), add(hip, 18, -7), 7, 'pad'), line(add(hip, 0, -10), P(98, 0), 3)], gear: [dumbbell ? db(a.wrist) : plate(a.wrist)] };
}

function pullUp(k) {
  const bar = P(100, 157);
  const shoulder = P(mix(98, 95, k), mix(103, 140, k));
  const torso = mix(-92, -100, k);
  const hip = at(shoulder, L.torso, torso);
  const knee = at(hip, L.thigh, torso + 22);
  const ankle = at(knee, L.shin, torso - 90);
  return { shoulder, hip, knee, ankle, toe: at(ankle, 10, -40), ...arm(shoulder, bar, 1), headDeg: torso + 180,
    back: [line(P(56, 157), P(56, 0), 3, 'pad'), line(P(56, 157), P(132, 157), 4)] };
}

function pulldown(k, close) {
  const b = seatedBody(P(78, 42), mix(96, 104, k), P(112, 5));
  const target = mixP(add(b.shoulder, 10, 53), add(b.shoulder, 9, -3), k);
  const a = arm(b.shoulder, target, -1);
  const top = P(104, 160);
  return { ...b, ...a, back: [line(add(b.hip, -12, -6), add(b.hip, 16, -6), 7, 'pad'), line(add(b.hip, 0, -9), P(78, 0), 3), line(add(b.knee, -4, 6), add(b.knee, 10, 6), 6, 'pad'), pulley(top)],
    gear: [cable(a.wrist, top), close ? { t: 'circle', c: a.wrist, r: 4 } : line(add(a.wrist, -9, 1), add(a.wrist, 9, -1), 3.5)] };
}

function curl(k, kind) {
  const ankle = P(98, 5);
  const { knee, hip } = stand(ankle, 90, 91);
  const shoulder = at(hip, L.torso, 90);
  const elbow = add(shoulder, 1, -L.upper);
  const wrist = at(elbow, L.fore, mix(-84, 76, k));
  const gear = kind === 'bar' ? [plate(wrist, 8)] : kind === 'db' ? [db(wrist)] : [cable(wrist, P(138, 10)), line(add(wrist, 0, -4), add(wrist, 0, 4), 4)];
  return { ankle, knee, hip, shoulder, elbow, wrist, back: kind === 'cable' ? [pulley(P(138, 10)), line(P(146, 0), P(146, 162), 3)] : [], gear };
}

/* ---------- front view ---------- */
function frontPose(o) {
  const cx = 100;
  const lean = o.lean || 0;
  const hipY = o.seated ? 44 : 78;
  const torsoLen = L.torso * (1 - lean * 0.55);
  const shY = hipY + torsoLen;
  return { front: true, cx, hipY, shY, lean, armDeg: o.arm, bend: o.bend || 0, reach: o.reach == null ? 1 : o.reach, seated: !!o.seated, gear: o.gear, oneArm: !!o.oneArm };
}

/* ---------- muscle → segment mapping for tinting ---------- */
const SEG = {
  thigh: ['kvadricepsy', 'hamstringy', 'adduktory'],
  glute: ['hyzde'],
  shin: ['lytka'],
  torso: ['hrudnik', 'brisni', 'sikme', 'bederni', 'siroky-zadovy', 'stred-zad', 'trapezy'],
  delt: ['ramena-predni', 'ramena-bocni', 'ramena-zadni'],
  upper: ['biceps', 'triceps'],
  fore: ['predlokti']
};
function tints(cvik) {
  const out = {};
  for (const [seg, list] of Object.entries(SEG)) {
    if ((cvik.hlavni || []).some(m => list.includes(m))) out[seg] = 'hl';
    else if ((cvik.vedlejsi || []).some(m => list.includes(m))) out[seg] = 'ved';
  }
  return out;
}

/* ---------- renderer ---------- */
const Y = y => FLOOR - y;

function sceneSide(p, tint) {
  const items = [];
  const L2 = (a, b, w, cls) => items.push({ t: 'line', a, b, w, cls });
  const tc = seg => tint[seg] ? ` t-${tint[seg]}` : '';
  for (const g of p.back || []) items.push(g);
  const toe = p.toe || (p.ankle ? at(p.ankle, L.foot, 0) : null);
  const heel = p.ankle ? at(p.ankle, 3, ang(toe, p.ankle)) : null;
  // far side (lighter)
  const off = (q) => q && add(q, -3, 1.5);
  const far = p.far || {};
  const fl = far.leg || (p.knee && { knee: off(p.knee), ankle: off(p.ankle), toe: off(toe) });
  if (fl && p.hip) {
    L2(p.hip, fl.knee, 9, 'far' + tc('thigh'));
    L2(fl.knee, fl.ankle, 7.5, 'far' + tc('shin'));
    if (fl.toe) L2(fl.ankle, fl.toe, 4.5, 'far');
  }
  const fa = far.arm || (p.elbow && { elbow: off(p.elbow), wrist: off(p.wrist) });
  if (fa && p.shoulder) {
    L2(p.shoulder, fa.elbow, 7, 'far' + tc('upper'));
    L2(fa.elbow, fa.wrist, 6, 'far' + tc('fore'));
  }
  // torso and head
  if (p.hip && p.shoulder) {
    L2(p.hip, p.shoulder, 15, 'body' + tc('torso'));
    const hd = p.headDeg != null ? p.headDeg : ang(p.hip, p.shoulder);
    items.push({ t: 'head', c: at(p.shoulder, L.neck + L.head, hd), r: L.head });
    items.push({ t: 'dot', c: p.hip, r: 7.5, cls: 'body' + tc('glute') });
  }
  // near leg
  if (p.knee && p.hip) {
    L2(p.hip, p.knee, 10, 'body' + tc('thigh'));
    L2(p.knee, p.ankle, 8, 'body' + tc('shin'));
    if (toe) L2(heel, toe, 5, 'body');
  }
  // near arm
  if (p.elbow && p.shoulder) {
    items.push({ t: 'dot', c: p.shoulder, r: 6.5, cls: 'body' + tc('delt') });
    L2(p.shoulder, p.elbow, 7.5, 'body' + tc('upper'));
    L2(p.elbow, p.wrist, 6.5, 'body' + tc('fore'));
  }
  for (const g of p.gear || []) items.push(g);
  return items;
}

function sceneFront(p, tint) {
  const items = [];
  const L2 = (a, b, w, cls) => items.push({ t: 'line', a, b, w, cls });
  const tc = seg => tint[seg] ? ` t-${tint[seg]}` : '';
  const { cx, hipY, shY } = p;
  const lean = p.lean;
  // legs
  for (const sgn of [-1, 1]) {
    const hip = P(cx + sgn * 8, hipY);
    if (p.seated) {
      const knee = P(cx + sgn * 13, hipY - 4), ankle = P(cx + sgn * 14, 5);
      L2(hip, knee, 10, 'body' + tc('thigh'));
      L2(knee, ankle, 8, 'body' + tc('shin'));
    } else {
      const knee = P(cx + sgn * 10, hipY - L.thigh), ankle = P(cx + sgn * 11, 5);
      L2(hip, knee, 10, 'body' + tc('thigh'));
      L2(knee, ankle, 8, 'body' + tc('shin'));
      L2(ankle, P(cx + sgn * 16, 2), 5, 'body');
    }
  }
  if (p.seated) items.push({ t: 'rect', x: cx - 22, y: hipY - 12, w: 44, h: 6 });
  // torso
  items.push({ t: 'poly', pts: [P(cx - 15, shY), P(cx + 15, shY), P(cx + 10, hipY), P(cx - 10, hipY)], cls: 'body' + tc('torso') });
  items.push({ t: 'head', c: P(cx, shY + (L.neck + L.head) * (1 - lean * 0.9)), r: L.head });
  // arms: abduction angle from hanging (0) to horizontal (90)
  const sides = p.oneArm ? [1] : [-1, 1];
  if (p.oneArm) {
    const sh = P(cx - 16, shY - 2);
    L2(sh, add(sh, -1, -L.upper), 7, 'body' + tc('upper'));
    L2(add(sh, -1, -L.upper), add(sh, -1, -L.upper - L.fore), 6, 'body' + tc('fore'));
  }
  for (const sgn of sides) {
    const sh = P(cx + sgn * 16, shY - 2);
    items.push({ t: 'dot', c: sh, r: 6.5, cls: 'body' + tc('delt') });
    const a = -90 + p.armDeg;
    const dir = sgn > 0 ? a : 180 - a;
    const reach = p.reach;
    const elbow = add(sh, L.upper * Math.cos(dir * R) * reach, L.upper * Math.sin(dir * R) * (reach < 1 ? 1 : 1));
    const fdir = sgn > 0 ? dir - p.bend : dir + p.bend;
    const wrist = add(elbow, L.fore * Math.cos(fdir * R) * reach, L.fore * Math.sin(fdir * R));
    L2(sh, elbow, 7.5, 'body' + tc('upper'));
    L2(elbow, wrist, 6.5, 'body' + tc('fore'));
    if (p.gear === 'db') items.push({ t: 'db', c: wrist });
    if (p.gear === 'handle') items.push({ t: 'line', a: add(wrist, 0, -6), b: add(wrist, 0, 6), w: 4, cls: 'g' });
    if (p.gear === 'cable') {
      const pul = P(cx - 52, 10);
      items.unshift({ t: 'pulley', c: pul }, { t: 'line', a: P(cx - 60, 0), b: P(cx - 60, 162), w: 3, cls: 'g' });
      items.push({ t: 'line', a: wrist, b: pul, w: 1.2, cls: 'cable' });
    }
  }
  return items;
}

function draw(svg, items, pool) {
  let i = 0;
  const get = (tag) => {
    let el = pool[i];
    if (!el || el.tagName !== tag) {
      el = s(tag);
      if (pool[i]) pool[i].replaceWith(el); else svg.append(el);
      pool[i] = el;
    }
    i++;
    return el;
  };
  for (const it of items) {
    if (it.t === 'line') {
      const el = get('line');
      el.setAttribute('x1', it.a.x.toFixed(1)); el.setAttribute('y1', Y(it.a.y).toFixed(1));
      el.setAttribute('x2', it.b.x.toFixed(1)); el.setAttribute('y2', Y(it.b.y).toFixed(1));
      el.setAttribute('stroke-width', it.w);
      el.setAttribute('class', 'a-' + (it.cls || 'g').split(' ').join(' a-'));
    } else if (it.t === 'head' || it.t === 'dot' || it.t === 'circle') {
      const el = get('circle');
      el.setAttribute('cx', it.c.x.toFixed(1)); el.setAttribute('cy', Y(it.c.y).toFixed(1)); el.setAttribute('r', it.r);
      el.setAttribute('class', it.t === 'head' ? 'a-head' : it.t === 'dot' ? 'a-' + it.cls.split(' ').join(' a-') + ' a-dot' : 'a-gfill');
    } else if (it.t === 'plate' || it.t === 'wheel') {
      const el = get('circle');
      el.setAttribute('cx', it.c.x.toFixed(1)); el.setAttribute('cy', Y(it.c.y).toFixed(1)); el.setAttribute('r', it.r);
      el.setAttribute('class', 'a-plate');
      const hub = get('circle');
      hub.setAttribute('cx', it.c.x.toFixed(1)); hub.setAttribute('cy', Y(it.c.y).toFixed(1)); hub.setAttribute('r', it.t === 'wheel' ? 2.5 : 3);
      hub.setAttribute('class', 'a-hub');
    } else if (it.t === 'db') {
      const el = get('rect');
      el.setAttribute('x', (it.c.x - 6.5).toFixed(1)); el.setAttribute('y', (Y(it.c.y) - 6.5).toFixed(1));
      el.setAttribute('width', 13); el.setAttribute('height', 13); el.setAttribute('rx', 3.5);
      el.setAttribute('class', 'a-plate');
    } else if (it.t === 'rect') {
      const el = get('rect');
      el.setAttribute('x', it.x); el.setAttribute('y', Y(it.y + it.h)); el.setAttribute('width', it.w); el.setAttribute('height', it.h); el.setAttribute('rx', 2);
      el.setAttribute('class', 'a-gsoft');
    } else if (it.t === 'poly') {
      const el = get('polygon');
      el.setAttribute('points', it.pts.map(q => `${q.x.toFixed(1)},${Y(q.y).toFixed(1)}`).join(' '));
      el.setAttribute('class', it.cls ? 'a-' + it.cls.split(' ').join(' a-') + ' a-fill' : 'a-gsoft');
    } else if (it.t === 'pulley') {
      const el = get('circle');
      el.setAttribute('cx', it.c.x); el.setAttribute('cy', Y(it.c.y)); el.setAttribute('r', 5);
      el.setAttribute('class', 'a-pulley');
    }
  }
  for (let j = i; j < pool.length; j++) pool[j].remove();
  pool.length = i;
}

export const hasAnimation = id => Object.prototype.hasOwnProperty.call(EX, id);

/**
 * Mount a looping animation for an exercise. Returns { stop, el }.
 * opts: { size: 'sm' | 'lg', autoplay: true }
 */
export function mountAnimation(container, cvik, opts = {}) {
  const def = EX[cvik.id];
  if (!def) return null;
  const tint = tints(cvik);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'anim', role: 'img', 'aria-label': `Animace cviku ${cvik.nazev}` });
  svg.append(s('line', { x1: 0, y1: FLOOR + 1, x2: W, y2: FLOOR + 1, class: 'a-floor' }));
  const layer = s('g');
  svg.append(layer);
  container.append(svg);
  const pool = [];
  let lastItems = [];
  const render = k => {
    const pose = def.pose(k);
    lastItems = pose.front ? sceneFront(pose, tint) : sceneSide(pose, tint);
    draw(layer, lastItems, pool);
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const T = (def.T || 3.2) * 1000;
  const holdA = def.holdA ?? 0.1, holdB = def.holdB ?? 0.1;
  const move = (1 - holdA - holdB) / 2;
  const ease = x => x * x * (3 - 2 * x);
  const phase = f => {
    if (f < holdA) return 0;
    if (f < holdA + move) return ease((f - holdA) / move);
    if (f < holdA + move + holdB) return 1;
    return 1 - ease((f - holdA - move - holdB) / move);
  };
  let playing = !def.still && opts.autoplay !== false && !reduce;
  let raf = 0, t0 = performance.now(), pausedAt = 0;
  const frame = now => {
    if (!svg.isConnected) { raf = 0; return; }
    render(phase(((now - t0) % T) / T));
    raf = requestAnimationFrame(frame);
  };
  render(def.still ? 0 : (playing ? 0 : 1));
  if (playing) raf = requestAnimationFrame(frame);
  const api = {
    el: svg,
    still: !!def.still,
    get playing() { return playing; },
    play() { if (playing || def.still) return; playing = true; t0 = performance.now() - pausedAt; raf = requestAnimationFrame(frame); },
    pause() { if (!playing) return; playing = false; pausedAt = (performance.now() - t0) % T; cancelAnimationFrame(raf); raf = 0; },
    toggle() { playing ? api.pause() : api.play(); return playing; },
    stop() { cancelAnimationFrame(raf); raf = 0; playing = false; },
    renderAt: render,
    /** Crop the view to the drawn figure (for small thumbnails). */
    fit(pad = 6) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const add = (x, y, r = 0) => { x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r); y0 = Math.min(y0, Y(y) - r); y1 = Math.max(y1, Y(y) + r); };
      for (const it of lastItems) {
        if (it.t === 'line') { add(it.a.x, it.a.y, it.w / 2); add(it.b.x, it.b.y, it.w / 2); }
        else if (it.c) add(it.c.x, it.c.y, it.r || 7);
        else if (it.t === 'rect') { add(it.x, it.y); add(it.x + it.w, it.y + it.h); }
        else if (it.pts) it.pts.forEach(q => add(q.x, q.y));
      }
      if (!isFinite(x0)) return;
      const size = Math.max(x1 - x0, y1 - y0) + pad * 2;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      svg.setAttribute('viewBox', `${(cx - size / 2).toFixed(1)} ${(cy - size / 2).toFixed(1)} ${size.toFixed(1)} ${size.toFixed(1)}`);
    }
  };
  return api;
}
