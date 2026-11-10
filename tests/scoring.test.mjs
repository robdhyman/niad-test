import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreRoute, scoreProblem, scoreSession, bonusFor, nextBonus, ROUTE_BONUS, BOULDER_BONUS, VARIETY_BONUS,
  previewRoute, ladder,
} from '../scoring.js';

const START = '2026-11-14T09:00:00.000Z';
const at = (min) => new Date(new Date(START).getTime() + min * 60000).toISOString();
let n = 0;
const id = () => `e${++n}`;

function session({ routes = [], problems = [], entries = [], durationMin = 360 } = {}) {
  return { startedAt: START, durationMin, routes, problems, entries };
}

test('route first go: clean is the redpoint value, falls use the 1, 2, 3 values', () => {
  assert.equal(scoreRoute('5.10', [0]), 18);
  assert.equal(scoreRoute('5.10', [1]), 12);
  assert.equal(scoreRoute('5.10', [2]), 8);
  assert.equal(scoreRoute('5.10', [3]), 4);
  assert.equal(scoreRoute('5.10', [7]), 4, '3 or more falls');
  assert.equal(scoreRoute('5.8', [3]), 0);
  assert.equal(scoreRoute('5.6', [2]), 1, 'moves on 5.6');
});

test('route repeats: clean, 2 hangs or fewer, 3+ hangs, max five', () => {
  assert.equal(scoreRoute('5.9', [0, 0]), 10 + 4);
  assert.equal(scoreRoute('5.9', [0, 2]), 10 + 3);
  assert.equal(scoreRoute('5.9', [0, 3]), 10 + 1);
  assert.equal(scoreRoute('5.9', [0, 0, 0, 0, 0, 0, 0]), 10 + 5 * 4, 'only five repeats score');
});

test('route: a later clean ascent takes the first-go points, never both', () => {
  // fell first (12 as first go), then clean: best is clean as first go (18) + fallen as repeat (4)
  assert.equal(scoreRoute('5.10', [1, 0]), 18 + 4);
});

test('boulders: first send then up to five repeats', () => {
  assert.equal(scoreProblem('V3', 1), 12);
  assert.equal(scoreProblem('V3', 3), 12 + 2 * 6);
  assert.equal(scoreProblem('V0', 10), 2 + 5 * 1);
  assert.equal(scoreProblem('V3', 0), 0);
});

test('bonus tables take the highest threshold reached', () => {
  assert.equal(bonusFor(ROUTE_BONUS, 9), 0);
  assert.equal(bonusFor(ROUTE_BONUS, 10), 10);
  assert.equal(bonusFor(ROUTE_BONUS, 24), 35);
  assert.equal(bonusFor(ROUTE_BONUS, 99), 315);
  assert.equal(bonusFor(BOULDER_BONUS, 75), 305);
  assert.equal(bonusFor(VARIETY_BONUS, 6), 0);
  assert.equal(bonusFor(VARIETY_BONUS, 26), 540);
  assert.deepEqual(nextBonus(ROUTE_BONUS, 12), { need: 3, gain: 10 });
  assert.equal(nextBonus(ROUTE_BONUS, 65), null);
});

test('exercises round down per exercise, machines pool calories, added exercises score', () => {
  const s = session({
    entries: [
      { id: id(), t: at(1), type: 'exercise', key: 'pushups', amount: 20 }, // 6
      { id: id(), t: at(2), type: 'exercise', key: 'situps', amount: 12 }, // 2
      { id: id(), t: at(3), type: 'exercise', key: 'rower', amount: 10 },
      { id: id(), t: at(4), type: 'exercise', key: 'skierg', amount: 5 }, // pooled 15 cal = 5
      { id: id(), t: at(5), type: 'exercise', key: 'running', amount: 2 }, // 16
      { id: id(), t: at(6), type: 'exercise', key: 'burpees', amount: 9 }, // 4
      { id: id(), t: at(7), type: 'exercise', key: 'bandedPullups', amount: 10 }, // 5
      { id: id(), t: at(8), type: 'exercise', key: 'threeFiveSeven', amount: 2 }, // 30
    ],
  });
  const r = scoreSession(s);
  assert.equal(r.exercisePoints, 6 + 2 + 5 + 16 + 4 + 5 + 30);
  assert.deepEqual(r.letters, ['J', 'K', 'P'], 'Rob\'s additions are not variety rows');
});

test('session total adds routes, boulders, exercises and the three bonuses', () => {
  const routes = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, grade: '5.9', label: '' }));
  const problems = [{ id: 'p1', grade: 'V2', label: '' }];
  const entries = [
    ...routes.map((r, i) => ({ id: id(), t: at(i * 10), type: 'route', routeId: r.id, falls: 0 })),
    { id: id(), t: at(120), type: 'boulder', problemId: 'p1' },
  ];
  const r = scoreSession(session({ routes, problems, entries }));
  assert.equal(r.routePoints, 100);
  assert.equal(r.boulderPoints, 8);
  assert.equal(r.bonuses.routes, 10);
  assert.equal(r.bonuses.variety, 0, 'two letters');
  assert.equal(r.total, 118);
});

test('entries after the 6-hour window are kept but not scored', () => {
  const s = session({
    routes: [{ id: 'r1', grade: '5.10', label: '' }],
    entries: [
      { id: id(), t: at(359), type: 'route', routeId: 'r1', falls: 0 },
      { id: id(), t: at(361), type: 'route', routeId: 'r1', falls: 0 },
    ],
  });
  const r = scoreSession(s);
  assert.equal(r.total, 18);
  assert.equal(r.late, 1);
});

test('preview shows what the next ascent adds', () => {
  const s = session({
    routes: [{ id: 'r1', grade: '5.10', label: '' }],
    entries: [{ id: id(), t: at(1), type: 'route', routeId: 'r1', falls: 1 }],
  });
  assert.equal(previewRoute(s, 'r1', '5.10', 0), 18 + 4 - 12);
});

test('ladder: two qualifying sessions pass a tier; flares and pending do not count', () => {
  const s = (day, total, flareAfter, durationMin = 360) => ({ id: day, startedAt: `2027-01-${day}T09:00:00Z`, durationMin, total, flareAfter });
  let l = ladder([s('02', 510, false), s('09', 520, true)]);
  assert.equal(l.current.tier, 500);
  assert.equal(l.tiers[0].qualifying, 1);
  l = ladder([s('02', 510, false), s('09', 520, null)]);
  assert.equal(l.tiers[0].pending, 1);
  l = ladder([s('02', 510, false), s('09', 800, false)]);
  assert.equal(l.tiers[0].passed, true);
  assert.equal(l.current.tier, 750);
  assert.equal(l.tiers[1].qualifying, 0, 'sessions before the unlock do not count');
  assert.equal(l.tiers[2].unlocked, false);
});

test('ladder: 500 must come inside 6 hours', () => {
  const s = (day, total) => ({ id: day, startedAt: `2027-01-${day}T09:00:00Z`, durationMin: 600, total, flareAfter: false });
  assert.equal(ladder([s('02', 600), s('09', 600)]).tiers[0].passed, false);
});
