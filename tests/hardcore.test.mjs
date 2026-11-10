import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreSession, hardcoreEnd, ladderMinutes, inWindow } from '../scoring.js';

const START = '2026-11-14T09:00:00.000Z';
const t0 = new Date(START).getTime();
const at = (min) => new Date(t0 + min * 60000).toISOString();
const now = (min) => new Date(t0 + min * 60000);
let n = 0;
const id = () => `e${++n}`;

// One 5.10 route per entry: 18 clean first-go points each (bonuses only start at 10 routes).
function hc({ target = null, durationMin = 360, mins = [], endedAt = null } = {}) {
  const routes = mins.map((_, i) => ({ id: `r${i}`, grade: '5.10', label: '' }));
  const entries = mins.map((m, i) => ({ id: id(), t: at(m), type: 'route', routeId: `r${i}`, falls: 0 }));
  return { startedAt: START, durationMin, hardcore: true, target, routes, problems: [], entries, endedAt };
}

test('hardcore with no target ends at the planned time', () => {
  const s = hc({ mins: [10] });
  assert.equal(hardcoreEnd(s, now(359)), null);
  assert.deepEqual(hardcoreEnd(s, now(360)), { at: now(360), reason: 'time' });
  assert.deepEqual(hardcoreEnd(s, now(2000)), { at: now(360), reason: 'time' }, 'app reopened later: ends at the planned time');
});

test('hardcore target met inside the planned time: runs to the planned end, no overtime', () => {
  const s = hc({ target: 30, mins: [10, 20] }); // 36 by 20 min
  assert.equal(hardcoreEnd(s, now(100)), null, 'does not stop early on hitting the target');
  assert.deepEqual(hardcoreEnd(s, now(360)), { at: now(360), reason: 'time' });
});

test('hardcore target not met: overtime runs until the tap that reaches it', () => {
  const s = hc({ target: 50, mins: [10, 20] }); // 36 at the planned end
  assert.equal(hardcoreEnd(s, now(361)), null, 'overtime');
  s.entries.push({ id: id(), t: at(400), type: 'route', routeId: 'r2', falls: 0 });
  s.routes.push({ id: 'r2', grade: '5.10', label: '' });
  assert.deepEqual(hardcoreEnd(s, now(400)), { at: now(400), reason: 'target' });
});

test('hardcore overtime taps score; taps after the end do not', () => {
  const s = hc({ target: 50, mins: [10, 20, 400] });
  assert.equal(scoreSession(s).total, 54, 'overtime tap at 400 min counts');
  s.endedAt = at(400);
  assert.equal(inWindow(s, { t: at(400) }), true, 'the tap that hit the target counts');
  assert.equal(inWindow(s, { t: at(401) }), false);
});

test('hardcore overtime stops 24 h after the start', () => {
  const s = hc({ target: 1000, mins: [10] });
  assert.equal(hardcoreEnd(s, now(24 * 60 - 1)), null);
  assert.deepEqual(hardcoreEnd(s, now(24 * 60)), { at: now(24 * 60), reason: 'max' });
  assert.equal(inWindow(s, { t: at(24 * 60) }), false, 'nothing scores at or past 24 h');
});

test('normal sessions keep the planned window', () => {
  const s = { ...hc({ mins: [10, 400] }), hardcore: false, target: 50 };
  assert.equal(scoreSession(s).total, 18);
  assert.equal(scoreSession(s).late, 1);
});

test('ladder minutes: hardcore overtime uses real elapsed time', () => {
  assert.equal(ladderMinutes(hc({ endedAt: at(360) })), 360);
  assert.equal(ladderMinutes(hc({ target: 50, endedAt: at(421.5) })), 422, 'rounded up');
  assert.equal(ladderMinutes({ ...hc({ endedAt: at(90) }), hardcore: false }), 360, 'normal: planned length');
  assert.equal(ladderMinutes(hc({ endedAt: at(90) })), 360, 'early injury abort: planned length');
});
