// NIAD Test scoring: Hans Florine's "Gym workout score card" (version January 2008),
// adopted whole, plus Rob's added exercises (decided 2026-11-10).
// Pure functions only: no DOM, no storage, so it can be tested in Node.

// Route rows A-I. rp = clean first go, rep = clean repeat,
// nc = not-clean first go for 1, 2, 3+ falls, ncRep = not-clean repeat (2 hangs or fewer).
export const ROUTES = {
  '5.6': { letter: 'A', rp: 2, rep: 1, nc: [1, 1, 1], ncRep: 1 },
  '5.7': { letter: 'B', rp: 3, rep: 2, nc: [2, 1, 0], ncRep: 1 },
  '5.8': { letter: 'C', rp: 6, rep: 2, nc: [4, 2, 0], ncRep: 1 },
  '5.9': { letter: 'D', rp: 10, rep: 4, nc: [7, 5, 3], ncRep: 3 },
  '5.10': { letter: 'E', rp: 18, rep: 8, nc: [12, 8, 4], ncRep: 4 },
  '5.11': { letter: 'F', rp: 30, rep: 17, nc: [18, 10, 5], ncRep: 7 },
  '5.12': { letter: 'G', rp: 50, rep: 29, nc: [30, 18, 12], ncRep: 15 },
  '5.13': { letter: 'H', rp: 80, rep: 45, nc: [50, 35, 20], ncRep: 25 },
  '5.14': { letter: 'I', rp: 120, rep: 70, nc: [80, 55, 35], ncRep: 40 },
};
export const ROUTE_GRADES = Object.keys(ROUTES);

// Boulder rows Q-AA: first send / repeat.
export const BOULDERS = {
  V0: { letter: 'Q', first: 2, rep: 1 },
  V1: { letter: 'R', first: 3, rep: 1 },
  V2: { letter: 'S', first: 8, rep: 4 },
  V3: { letter: 'T', first: 12, rep: 6 },
  V4: { letter: 'U', first: 20, rep: 10 },
  V5: { letter: 'V', first: 30, rep: 15 },
  V6: { letter: 'W', first: 45, rep: 22 },
  V7: { letter: 'X', first: 60, rep: 30 },
  V8: { letter: 'Y', first: 80, rep: 40 },
  V9: { letter: 'Z', first: 100, rep: 50 },
  V10: { letter: 'AA', first: 120, rep: 60 },
};
export const BOULDER_GRADES = Object.keys(BOULDERS);

export const MAX_REPEATS = 5;

// Exercises. `per`: amount per point. `each`: points per unit. `pool`: amounts in
// the same pool are summed before rounding down. `letter`: Hans's variety row, or
// null for Rob's additions, which are not rows on the sheet.
export const EXERCISES = [
  { key: 'pushups', label: 'Push-ups', unit: 'reps', per: 3, letter: 'J', source: 'Hans' },
  { key: 'kneePushups', label: 'Knee push-ups', unit: 'reps', per: 6, letter: 'J', source: 'Hans' },
  { key: 'situps', label: 'Sit-ups / crunches', unit: 'reps', per: 5, letter: 'K', source: 'Hans' },
  { key: 'pullups', label: 'Pull-ups', unit: 'reps', per: 1, letter: 'L', source: 'Hans' },
  { key: 'lunges', label: 'Lunges / squats', unit: 'reps', per: 8, letter: 'M', source: 'Hans' },
  { key: 'dips', label: 'Bar dips', unit: 'reps', per: 2, letter: 'N', source: 'Hans' },
  { key: 'abRollers', label: 'Ab rollers', unit: 'reps', per: 1, letter: 'O', source: 'Hans' },
  { key: 'backExt', label: 'Back extensions', unit: 'reps', per: 4, letter: 'O', source: 'Hans' },
  { key: 'stairmaster', label: 'Stairmaster', unit: 'cal', per: 3, pool: 'machines', letter: 'P', source: 'Hans (machine row)' },
  { key: 'rower', label: 'Rowing machine', unit: 'cal', per: 3, pool: 'machines', letter: 'P', source: 'Hans (machine row)' },
  { key: 'skierg', label: 'SkiErg', unit: 'cal', per: 3, pool: 'machines', letter: 'P', source: 'Hans (machine row)' },
  { key: 'running', label: 'Running', unit: '¼ mile', each: 8, letter: 'P', source: 'Hans' },
  { key: 'bandedPullups', label: 'Banded pull-ups', unit: 'reps', per: 2, letter: null, source: 'Rob' },
  { key: 'burpees', label: 'Burpees', unit: 'reps', per: 2, letter: null, source: 'Rob' },
  { key: 'threeFiveSeven', label: '3-5-7s (15 min)', unit: 'block', each: 15, letter: null, source: 'Rob' },
];
const EXERCISE_BY_KEY = Object.fromEntries(EXERCISES.map((e) => [e.key, e]));

// [count, points]: the highest threshold reached applies.
export const ROUTE_BONUS = [[10, 10], [15, 20], [20, 35], [25, 50], [30, 70], [35, 90], [40, 115], [45, 145], [50, 180], [55, 220], [60, 265], [65, 315]];
export const BOULDER_BONUS = [[10, 3], [15, 8], [20, 15], [25, 25], [30, 35], [35, 45], [40, 60], [45, 80], [50, 105], [55, 135], [60, 170], [65, 210], [70, 255], [75, 305]];
export const VARIETY_BONUS = [[7, 5], [8, 10], [9, 15], [10, 20], [11, 25], [12, 30], [13, 35], [14, 45], [15, 55], [16, 70], [17, 90], [18, 120], [19, 155], [20, 195], [21, 240], [22, 290], [23, 345], [24, 405], [25, 470], [26, 540]];

// Hans's lettered rows, A to AA, in sheet order. The variety bonus counts how many are used.
export const ROWS = [
  ...ROUTE_GRADES.map((g) => ({ letter: ROUTES[g].letter, label: g })),
  { letter: 'J', label: 'Push-ups' }, { letter: 'K', label: 'Sit-ups' }, { letter: 'L', label: 'Pull-ups' },
  { letter: 'M', label: 'Lunges/squats' }, { letter: 'N', label: 'Dips' }, { letter: 'O', label: 'Ab roll/back ext' },
  { letter: 'P', label: 'Cardio/run' },
  ...BOULDER_GRADES.map((g) => ({ letter: BOULDERS[g].letter, label: g })),
];

export const TIERS = [500, 750, 1000, 1500, 2000];
export const WEEKLY_MINUTES = 360;
export const MAX_MINUTES = 24 * 60;

export function bonusFor(table, count) {
  let pts = 0;
  for (const [n, p] of table) if (count >= n) pts = p;
  return pts;
}

// What the next threshold would add: { need, gain } or null at the top.
export function nextBonus(table, count) {
  const current = bonusFor(table, count);
  const next = table.find(([n]) => n > count);
  return next ? { need: next[0] - count, gain: next[1] - current } : null;
}

// First-go value of one route ascent. falls: 0 = clean; 3 means 3 or more.
export function routeFirstGo(grade, falls) {
  const r = ROUTES[grade];
  if (!falls) return r.rp;
  return r.nc[Math.min(falls, 3) - 1];
}

// Repeat value of one route ascent. falls here are hangs: 2 or fewer = not clean, 3+ = 1 point.
export function routeRepeat(grade, falls) {
  const r = ROUTES[grade];
  if (!falls) return r.rep;
  if (falls <= 2) return r.ncRep;
  return 1;
}

// One route's points from all its ascents. One ascent takes first-go points (you cannot
// take both clean and not-clean first-go points), the best five of the rest score as
// repeats. The ascent used as the first go is the one that gives the highest total.
export function scoreRoute(grade, fallsList) {
  if (!fallsList.length) return 0;
  let best = 0;
  fallsList.forEach((f, i) => {
    const repeats = fallsList
      .filter((_, j) => j !== i)
      .map((g) => routeRepeat(grade, g))
      .sort((a, b) => b - a)
      .slice(0, MAX_REPEATS);
    const total = routeFirstGo(grade, f) + repeats.reduce((a, b) => a + b, 0);
    if (total > best) best = total;
  });
  return best;
}

// One boulder problem: the first send earns first-go points on any attempt, up to five repeats.
export function scoreProblem(grade, sends) {
  if (sends <= 0) return 0;
  const b = BOULDERS[grade];
  return b.first + Math.min(sends - 1, MAX_REPEATS) * b.rep;
}

export function sessionEnd(session) {
  return new Date(new Date(session.startedAt).getTime() + session.durationMin * 60000);
}

const ms = (d) => new Date(d).getTime();

// Entries logged inside the session window count; later ones are kept but not scored.
// A hardcore session with a target scores into overtime: up to the tap that reached the
// target (its endedAt), and never at or past 24 hours from the start.
export function inWindow(session, entry) {
  const t = ms(entry.t);
  if (session.hardcore && session.target) {
    if (t >= ms(session.startedAt) + MAX_MINUTES * 60000) return false;
    return !session.endedAt || t <= ms(session.endedAt);
  }
  return t < ms(sessionEnd(session));
}

/**
 * When a hardcore session ends: { at: Date, reason: 'time' | 'target' | 'max' }, or null
 * while it is still running. It cannot be stopped by hand (an injury abort is separate).
 * - No target, or the target was reached by the planned end: ends at the planned end.
 * - Otherwise overtime: ends at the tap that reaches the target, or 24 h after the start.
 */
export function hardcoreEnd(session, now = new Date()) {
  const start = ms(session.startedAt);
  const planned = start + session.durationMin * 60000;
  const cap = start + MAX_MINUTES * 60000;
  const t = ms(now);
  if (t < planned) return null;
  const byTime = { at: new Date(planned), reason: 'time' };
  const target = Number(session.target) || 0;
  if (!target) return byTime;
  const open = { ...session, endedAt: null };
  const sorted = [...(session.entries || [])].sort((a, b) => ms(a.t) - ms(b.t));
  const totalWith = (list) => scoreSession({ ...open, entries: list }).total;
  const inTime = sorted.filter((e) => ms(e.t) < planned);
  if (totalWith(inTime) >= target) return byTime;
  const overtime = sorted.filter((e) => ms(e.t) >= planned && ms(e.t) < cap && ms(e.t) <= t);
  for (let i = 0; i < overtime.length; i++) {
    if (totalWith([...inTime, ...overtime.slice(0, i + 1)]) >= target) return { at: new Date(overtime[i].t), reason: 'target' };
  }
  return t >= cap ? { at: new Date(cap), reason: 'max' } : null;
}

// Minutes the tier ladder counts: the planned length, or the real elapsed time when a
// hardcore session ran into overtime.
export function ladderMinutes(session) {
  if (!session.hardcore || !session.endedAt) return session.durationMin;
  const elapsed = Math.ceil((ms(session.endedAt) - ms(session.startedAt)) / 60000);
  return Math.max(session.durationMin, elapsed);
}

/**
 * Score a session.
 * session: { startedAt, durationMin, routes: [{id, grade, label}], problems: [{id, grade, label}],
 *            entries: [{id, t, type: 'route'|'boulder'|'exercise', routeId?, problemId?, falls?, key?, amount?}] }
 */
export function scoreSession(session) {
  const entries = (session.entries || []).filter((e) => inWindow(session, e));
  const late = (session.entries || []).length - entries.length;
  const letters = new Set();

  // Routes
  const routeById = Object.fromEntries((session.routes || []).map((r) => [r.id, r]));
  const ascents = {};
  for (const e of entries) if (e.type === 'route' && routeById[e.routeId]) (ascents[e.routeId] ||= []).push(e.falls || 0);
  const routeRows = [];
  let routePoints = 0;
  for (const [id, list] of Object.entries(ascents)) {
    const r = routeById[id];
    const pts = scoreRoute(r.grade, list);
    routePoints += pts;
    letters.add(ROUTES[r.grade].letter);
    routeRows.push({ id, grade: r.grade, label: r.label, ascents: list.length, points: pts });
  }

  // Boulders
  const problemById = Object.fromEntries((session.problems || []).map((p) => [p.id, p]));
  const sends = {};
  for (const e of entries) if (e.type === 'boulder' && problemById[e.problemId]) sends[e.problemId] = (sends[e.problemId] || 0) + 1;
  const problemRows = [];
  let boulderPoints = 0;
  for (const [id, n] of Object.entries(sends)) {
    const p = problemById[id];
    const pts = scoreProblem(p.grade, n);
    boulderPoints += pts;
    letters.add(BOULDERS[p.grade].letter);
    problemRows.push({ id, grade: p.grade, label: p.label, sends: n, points: pts });
  }

  // Exercises
  const amounts = {};
  for (const e of entries) if (e.type === 'exercise' && EXERCISE_BY_KEY[e.key]) amounts[e.key] = (amounts[e.key] || 0) + (Number(e.amount) || 0);
  const pools = {};
  const exerciseRows = [];
  let exercisePoints = 0;
  for (const ex of EXERCISES) {
    const amount = amounts[ex.key] || 0;
    if (amount <= 0) continue;
    if (ex.letter) letters.add(ex.letter);
    if (ex.pool) {
      pools[ex.pool] = (pools[ex.pool] || 0) + amount;
      exerciseRows.push({ key: ex.key, label: ex.label, amount, unit: ex.unit, points: null, pool: ex.pool });
      continue;
    }
    const pts = ex.each ? Math.floor(amount) * ex.each : Math.floor(amount / ex.per);
    exercisePoints += pts;
    exerciseRows.push({ key: ex.key, label: ex.label, amount, unit: ex.unit, points: pts, toNext: ex.each ? null : ex.per - (amount % ex.per) });
  }
  for (const [pool, amount] of Object.entries(pools)) {
    const per = EXERCISES.find((e) => e.pool === pool).per;
    const pts = Math.floor(amount / per);
    exercisePoints += pts;
    exerciseRows.push({ key: `pool:${pool}`, label: 'Machines (pooled)', amount, unit: 'cal', points: pts, toNext: per - (amount % per) });
  }

  const differentRoutes = routeRows.length;
  const differentProblems = problemRows.length;
  const variety = letters.size;
  const bonuses = {
    routes: bonusFor(ROUTE_BONUS, differentRoutes),
    problems: bonusFor(BOULDER_BONUS, differentProblems),
    variety: bonusFor(VARIETY_BONUS, variety),
  };
  const total = routePoints + boulderPoints + exercisePoints + bonuses.routes + bonuses.problems + bonuses.variety;

  return {
    total,
    routePoints,
    boulderPoints,
    exercisePoints,
    bonuses,
    counts: { differentRoutes, differentProblems, variety },
    next: {
      routes: nextBonus(ROUTE_BONUS, differentRoutes),
      problems: nextBonus(BOULDER_BONUS, differentProblems),
      variety: nextBonus(VARIETY_BONUS, variety),
    },
    letters: [...letters].sort(),
    routeRows,
    problemRows,
    exerciseRows,
    late,
  };
}

// Points the next ascent of this route would add (for the "+N" preview).
export function previewRoute(session, routeId, grade, falls) {
  const list = (session.entries || [])
    .filter((e) => e.type === 'route' && e.routeId === routeId && inWindow(session, e))
    .map((e) => e.falls || 0);
  return scoreRoute(grade, [...list, falls]) - scoreRoute(grade, list);
}

export function previewProblem(session, problemId, grade) {
  const n = (session.entries || []).filter((e) => e.type === 'boulder' && e.problemId === problemId && inWindow(session, e)).length;
  return scoreProblem(grade, n + 1) - scoreProblem(grade, n);
}

/**
 * Tier ladder. Tiers pass in order. A tier passes on the second qualifying session:
 * total at or above the tier, flareAfter === false (no injury flare or red flag in the
 * week after), dated after the previous tier passed. The 500 tier must be scored in a
 * session of 6 hours or less; later tiers in up to 24 hours.
 * sessions: [{ id, startedAt, durationMin, total, flareAfter: true|false|null }]
 */
export function ladder(sessions) {
  const sorted = [...sessions].sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));
  const tiers = [];
  let since = null;
  let open = true;
  for (const tier of TIERS) {
    const maxMin = tier === TIERS[0] ? WEEKLY_MINUTES : MAX_MINUTES;
    const eligible = sorted.filter(
      (s) => open && (!since || new Date(s.startedAt) > since) && s.total >= tier && s.durationMin <= maxMin,
    );
    const qualifying = eligible.filter((s) => s.flareAfter === false);
    const pending = eligible.filter((s) => s.flareAfter == null);
    const passed = open && qualifying.length >= 2;
    tiers.push({
      tier,
      maxMin,
      unlocked: open,
      passed,
      qualifying: qualifying.length,
      pending: pending.length,
      passedOn: passed ? qualifying[1].startedAt : null,
    });
    if (passed) since = new Date(qualifying[1].startedAt);
    else open = false;
  }
  const current = tiers.find((t) => !t.passed) || null;
  return { tiers, current };
}
