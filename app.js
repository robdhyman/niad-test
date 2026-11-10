import {
  ROUTES, ROUTE_GRADES, BOULDERS, BOULDER_GRADES, EXERCISES, ROWS, TIERS, WEEKLY_MINUTES, MAX_MINUTES,
  scoreSession, previewRoute, previewProblem, routeFirstGo, sessionEnd, ladder, hardcoreEnd, ladderMinutes,
  ROUTE_BONUS, BOULDER_BONUS, VARIETY_BONUS, MAX_REPEATS,
} from './scoring.js';
import { createSync, syncAll, discardAll } from './sync.js';

// ---------- State ----------
const KEY = 'niad.v1';
// discarded: ids whose GitHub copy still has to be deleted.
const blank = () => ({ sessions: {}, activeId: null, discarded: [], settings: { owner: 'robdhyman', repo: 'niad-log', token: '' } });

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const s = JSON.parse(raw);
    return { ...blank(), ...s, settings: { ...blank().settings, ...(s.settings || {}) } };
  } catch {
    return blank();
  }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable: keep in memory */ }
}

let state = load();
const ui = { tab: 'session', seg: 'routes', sheet: null, toast: null, sync: { status: 'idle', msg: '' }, hardcore: false, target: '' };

const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const active = () => (state.activeId ? state.sessions[state.activeId] : null);
const pad = (n) => String(n).padStart(2, '0');

function sessionId(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}-${uid().slice(0, 4)}`;
}

function touch(session) {
  session.dirty = true;
  session.updatedAt = new Date().toISOString();
  save();
  scheduleSync();
}

// ---------- Actions ----------
function startSession(kind, hours, { hardcore = false, target = null } = {}) {
  const now = new Date();
  const durationMin = kind === 'weekly' ? WEEKLY_MINUTES : Math.min(MAX_MINUTES, Math.max(60, Math.round(hours * 60)));
  const s = {
    id: sessionId(now), version: 1, kind, startedAt: now.toISOString(), durationMin,
    hardcore, target: hardcore && target > 0 ? Math.round(target) : null,
    endedAt: null, endReason: null, flareAfter: null, routes: [], problems: [], entries: [], deleted: [],
  };
  state.sessions[s.id] = s;
  state.activeId = s.id;
  ui.seg = 'routes';
  touch(s);
}

// reason: 'stop' (saved by hand), 'time', 'target', 'max' (hardcore, automatic), 'abort' (injury).
function finishSession(s, { at = new Date(), reason = 'stop' } = {}) {
  s.endedAt = new Date(at).toISOString();
  s.endReason = reason;
  if (reason === 'abort') s.flareAfter = true;
  s.total = scoreSession(s).total;
  if (state.activeId === s.id) state.activeId = null;
  ui.tab = 'history';
  ui.sheet = null;
  touch(s);
}

// Delete the active session here and, on the next sync, its GitHub copy.
function discardSession() {
  const s = active();
  if (!s || s.hardcore) return;
  delete state.sessions[s.id];
  state.activeId = null;
  state.discarded = [...new Set([...(state.discarded || []), s.id])];
  ui.sheet = null;
  ui.tab = 'session';
  save();
  scheduleSync(500);
}

const END_NOTE = {
  time: 'Time: session saved',
  target: 'Target reached: session saved',
  max: '24 hours up: session saved',
};
// Ends the active hardcore session when its time, target or 24-hour cap says so.
function checkHardcore() {
  const s = active();
  if (!s || !s.hardcore) return false;
  const end = hardcoreEnd(s, new Date());
  if (!end) return false;
  finishSession(s, end);
  showToast(END_NOTE[end.reason]);
  return true;
}

function addEntry(entry, label) {
  if (checkHardcore()) { render(); return; }
  const s = active();
  const before = scoreSession(s).total;
  const e = { id: uid(), t: new Date().toISOString(), ...entry };
  s.entries.push(e);
  s.total = scoreSession(s).total;
  touch(s);
  showToast(`${label}  +${s.total - before}`, e.id);
  checkHardcore();
}

function removeEntry(id) {
  const s = active() || Object.values(state.sessions).find((x) => x.entries.some((e) => e.id === id));
  if (!s || (s.hardcore && s.endedAt)) return;
  s.entries = s.entries.filter((e) => e.id !== id);
  s.deleted = [...(s.deleted || []), id];
  s.total = scoreSession(s).total;
  touch(s);
}

let toastTimer;
function showToast(text, undoId) {
  ui.toast = { text, undoId };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast = null; render(); }, 4000);
}

// ---------- Sync ----------
const configured = () => state.settings.owner && state.settings.repo && state.settings.token;
let syncTimer;
function scheduleSync(delay = 3000) {
  if (!configured()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(runSync, delay);
}
async function runSync() {
  if (!configured()) return;
  if (!navigator.onLine) { ui.sync = { status: 'wait', msg: 'Offline: saved on phone' }; render(); return; }
  ui.sync = { status: 'wait', msg: 'Syncing…' };
  renderHeaderOnly();
  try {
    const sync = createSync(state.settings);
    const gone = await discardAll(sync, state.discarded || []);
    state.discarded = (state.discarded || []).filter((id) => !gone.includes(id));
    const before = JSON.stringify(state.sessions);
    const next = await syncAll(sync, state.sessions, [...state.discarded, ...gone]);
    // keep any taps made while the sync ran
    for (const [id, s] of Object.entries(state.sessions)) {
      if (s.dirty && JSON.stringify(s) !== JSON.stringify(JSON.parse(before)[id] || null)) next[id] = s;
    }
    // drop sessions discarded while the sync ran
    for (const id of Object.keys(next)) if (!state.sessions[id] && JSON.parse(before)[id]) delete next[id];
    state.sessions = next;
    save();
    ui.sync = { status: 'ok', msg: 'Saved to GitHub' };
  } catch (e) {
    ui.sync = { status: 'err', msg: `Sync failed: ${e.message}` };
  }
  render();
}
window.addEventListener('online', () => scheduleSync(500));

function syncLabel() {
  if (!configured()) return { cls: '', msg: 'Phone only: connect GitHub in Settings' };
  const dirty = Object.values(state.sessions).filter((s) => s.dirty).length;
  if (ui.sync.status === 'err') return { cls: 'err', msg: ui.sync.msg };
  if (ui.sync.status === 'wait') return { cls: 'wait', msg: ui.sync.msg };
  if (dirty) return { cls: 'wait', msg: `${dirty} unsynced` };
  return { cls: 'ok', msg: 'Saved to GitHub' };
}

// ---------- Views ----------
function fmtClock(ms) {
  const neg = ms < 0;
  const t = Math.abs(Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return `${neg ? '+' : ''}${h}:${pad(m)}:${pad(sec)}`;
}

// Hardcore clock: T−h:mm:ss before the planned end, T+h:mm:ss in overtime.
function fmtT(msToEnd) {
  const t = Math.abs(Math.floor(msToEnd / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return `T${msToEnd > 0 ? '−' : '+'}${h}:${pad(m)}:${pad(sec)}`;
}

// Clock text and note for the header and the 1-second tick.
function clockParts(s) {
  const left = sessionEnd(s) - Date.now();
  if (!s.hardcore) return { clock: left > 0 ? fmtClock(left) : 'Time', note: left > 0 ? 'left' : 'Window over: new taps don’t score' };
  if (left > 0) return { clock: fmtT(left), note: s.target ? `Hardcore · target ${s.target}` : 'Hardcore · no stopping' };
  const capLeft = new Date(s.startedAt).getTime() + MAX_MINUTES * 60000 - Date.now();
  const need = s.target - scoreSession(s).total;
  return { clock: fmtT(left), note: `Overtime · ${need} to target · ${fmtClock(capLeft)} to 24 h` };
}

function tierFor(total, s) {
  const l = ladder(sessionsForLadder());
  const target = s?.target || (l.current ? l.current.tier : TIERS[TIERS.length - 1]);
  return { target, word: s?.target ? 'target' : 'tier', pct: Math.min(100, (total / target) * 100) };
}

function sessionsForLadder() {
  return Object.values(state.sessions)
    .filter((s) => s.endedAt)
    .map((s) => ({ id: s.id, startedAt: s.startedAt, durationMin: ladderMinutes(s), total: scoreSession(s).total, flareAfter: s.flareAfter ?? null }));
}

function header() {
  const s = active();
  const sync = syncLabel();
  if (!s) {
    return `<header class="top"><div class="wrap"><div><div class="total">NIAD Test</div>
      <div class="sync"><i class="dot ${sync.cls}"></i>${esc(sync.msg)}</div></div></div></header>`;
  }
  const r = scoreSession(s);
  const c = clockParts(s);
  const tier = tierFor(r.total, s);
  return `<header class="top"><div class="wrap">
    <div><div class="total" id="total">${r.total}<small>pts</small></div>
      <div class="sync"><i class="dot ${sync.cls}"></i><span id="syncmsg">${esc(sync.msg)}</span></div></div>
    <div class="clock"><b id="clock">${c.clock}</b>
      <span id="clocknote">${esc(c.note)}</span></div>
  </div>
  <div class="wrap"><div class="tierbar"><i style="width:${tier.pct}%"></i></div>
    <div class="tiernote">${r.total} / ${tier.target} ${tier.word}${r.late ? ` · ${r.late} late entr${r.late === 1 ? 'y' : 'ies'} not scored` : ''}</div></div>
  </header>`;
}

function startView() {
  const l = ladder(sessionsForLadder());
  const cur = l.current;
  return `<div class="wrap">
    <div class="empty"><h1>Start a session</h1>
      <p>The clock starts when you tap Start and runs through breaks.</p></div>
    <div class="card">
      <label class="check"><input type="checkbox" id="hardcore" ${ui.hardcore ? 'checked' : ''}> <b>Hardcore</b></label>
      <p class="muted">No stop and no discard. Ends on its own at the planned time. Injury is the only way out.</p>
      <div class="field" ${ui.hardcore ? '' : 'hidden'} id="targetField"><label for="target">Target score (optional)</label>
        <input class="text" id="target" type="number" inputmode="numeric" min="1" step="1" placeholder="e.g. 750" value="${esc(ui.target || '')}">
        <p class="muted">Short of it at the planned time? The clock goes to T+ and keeps scoring until you reach it, up to 24 h from the start.</p></div>
    </div>
    <button class="btn primary" data-action="start-weekly">Weekly · 6 hours</button>
    <div class="card" style="margin-top:14px">
      <h3>Long day</h3>
      <p class="muted">For tiers past 500. One clock, up to 24 hours.</p>
      <div class="kind"><input class="text" id="longHours" type="number" inputmode="decimal" min="1" max="24" step="0.5" value="12" aria-label="Hours">
      <button class="btn" data-action="start-long">Start long day</button></div>
    </div>

    ${cur ? `<p class="muted" style="text-align:center">Current tier: <b>${cur.tier}</b> · ${cur.qualifying}/2 sessions${cur.pending ? ` · ${cur.pending} waiting on the week-after check` : ''}</p>` : '<p class="ok" style="text-align:center"><b>All tiers passed.</b></p>'}
  </div>`;
}

function routesView(s) {
  const usedLetters = new Set(scoreSession(s).letters);
  const counts = {};
  for (const r of s.routes) counts[r.grade] = (counts[r.grade] || 0) + 1;
  return `<div class="grid">${ROUTE_GRADES.map((g) => `
    <button class="tile${usedLetters.has(ROUTES[g].letter) ? ' used' : ''}" data-action="open-route" data-grade="${g}">
      <i class="ltr">${ROUTES[g].letter}</i><b>${g}</b><span>${ROUTES[g].rp} clean · ${ROUTES[g].rep} rpt</span>
      ${counts[g] ? `<em>${counts[g]} route${counts[g] > 1 ? 's' : ''}</em>` : ''}
    </button>`).join('')}</div>
    <p class="muted" style="margin-top:12px">5.10a–d all score as 5.10. Lead, top rope and auto-belay score the same.</p>`;
}

function bouldersView(s) {
  const usedLetters = new Set(scoreSession(s).letters);
  const counts = {};
  for (const p of s.problems) counts[p.grade] = (counts[p.grade] || 0) + 1;
  return `<div class="grid">${BOULDER_GRADES.map((g) => `
    <button class="tile${usedLetters.has(BOULDERS[g].letter) ? ' used' : ''}" data-action="open-boulder" data-grade="${g}">
      <i class="ltr">${BOULDERS[g].letter}</i><b>${g}</b><span>${BOULDERS[g].first} send · ${BOULDERS[g].rep} rpt</span>
      ${counts[g] ? `<em>${counts[g]} problem${counts[g] > 1 ? 's' : ''}</em>` : ''}
    </button>`).join('')}</div>
    <p class="muted" style="margin-top:12px">Log sends only. A send on any attempt earns first-go points.</p>`;
}

const QUICK = {
  pushups: [10, 20], kneePushups: [12, 24], situps: [20, 50], pullups: [3, 5], lunges: [16, 32], dips: [6, 10],
  abRollers: [5, 10], backExt: [12, 20], stairmaster: [10, 25], rower: [10, 25], skierg: [10, 25], running: [1],
  bandedPullups: [5, 10], burpees: [10, 20], threeFiveSeven: [1],
};
function quickAdds(ex) {
  return QUICK[ex.key] || [5, 10];
}

function exercisesView(s) {
  const r = scoreSession(s);
  const rowFor = (key) => r.exerciseRows.find((x) => x.key === key);
  const pool = rowFor('pool:machines');
  return `<div class="card">${EXERCISES.map((ex) => {
    const row = rowFor(ex.key);
    const rate = ex.each ? `1 ${ex.unit} = ${ex.each} pts` : ex.per === 1 ? `1 rep = 1 pt` : `${ex.per} ${ex.unit} = 1 pt`;
    const pts = ex.pool ? '' : row ? `${row.points} pts` : '';
    return `<div class="ex">
      <div class="ex-head"><div>${ex.letter ? `<i class="ltr inline${r.letters.includes(ex.letter) ? ' on' : ''}">${ex.letter}</i>` : ''}<b>${esc(ex.label)}</b> <span class="muted">${rate}</span></div><span class="pts">${pts}</span></div>
      <div class="muted">${row ? `${row.amount} ${ex.unit} so far${row.toNext && row.toNext !== ex.per ? ` · ${row.toNext} more for next point` : ''}` : '&nbsp;'}</div>
      <div class="ex-actions">
        ${quickAdds(ex).map((n) => `<button class="chip" data-action="add-ex" data-key="${ex.key}" data-amount="${n}">+${n}</button>`).join('')}
        <input class="num" type="number" inputmode="numeric" min="1" placeholder="#" data-num="${ex.key}" aria-label="${esc(ex.label)} amount">
        <button class="chip" data-action="add-ex-num" data-key="${ex.key}">Add</button>
      </div></div>`;
  }).join('')}
  ${pool ? `<p class="muted">Machines pooled: ${pool.amount} cal = ${pool.points} pts${pool.toNext !== 3 ? ` · ${pool.toNext} cal for next point` : ''}</p>` : ''}
  </div>
  <p class="muted">Reps inside a 3-5-7 block don't also count as pull-ups, push-ups or squats. Calories from the machine's display.</p>`;
}

function scoreView(s) {
  const r = scoreSession(s);
  const nxt = (n, word) => (n ? `<div class="hint">${n.need} more ${word} → +${n.gain}</div>` : '<div class="muted">Top of table</div>');
  const usedRoutes = new Set(r.routeRows.map((x) => x.grade));
  const usedV = new Set(r.problemRows.map((x) => x.grade));
  const cheap = [
    ...['5.6', '5.7', '5.8', '5.9', '5.10'].filter((g) => !usedRoutes.has(g)),
    ...['V0', 'V1', 'V2'].filter((g) => !usedV.has(g)),
  ];
  const entries = [...s.entries].reverse();
  const routeById = Object.fromEntries(s.routes.map((x) => [x.id, x]));
  const probById = Object.fromEntries(s.problems.map((x) => [x.id, x]));
  const exByKey = Object.fromEntries(EXERCISES.map((e) => [e.key, e]));
  const late = (e) => new Date(e.t) >= sessionEnd(s);
  const describe = (e) => {
    if (e.type === 'route') { const x = routeById[e.routeId]; return `${x?.grade} ${x?.label ? `“${esc(x.label)}”` : ''} · ${e.falls ? `${e.falls === 3 ? '3+' : e.falls} fall/hang` : 'clean'}`; }
    if (e.type === 'boulder') { const x = probById[e.problemId]; return `${x?.grade} ${x?.label ? `“${esc(x.label)}”` : ''} · send`; }
    const x = exByKey[e.key]; return `${esc(x?.label)} · ${e.amount} ${x?.unit}`;
  };
  return `
  <div class="card"><h3>Rows used: ${r.counts.variety} of ${ROWS.length}</h3>
    <div class="rows">${ROWS.map((x) => `<div class="rowcell${r.letters.includes(x.letter) ? ' on' : ''}"><b>${x.letter}</b><span>${esc(x.label)}</span></div>`).join('')}</div>
    <p class="muted">Each lit row counts once toward the variety bonus. Banded pull-ups, burpees and 3-5-7s are not rows.</p>
  </div>
  <div class="card"><h3>Score</h3>
    <div class="row"><span>Routes (${r.counts.differentRoutes} different)</span><span class="pts">${r.routePoints}</span></div>
    <div class="row"><span>Boulders (${r.counts.differentProblems} different)</span><span class="pts">${r.boulderPoints}</span></div>
    <div class="row"><span>Exercises</span><span class="pts">${r.exercisePoints}</span></div>
    <div class="row"><div>Route bonus${nxt(r.next.routes, 'different routes')}</div><span class="pts">${r.bonuses.routes}</span></div>
    <div class="row"><div>Problem bonus${nxt(r.next.problems, 'different problems')}</div><span class="pts">${r.bonuses.problems}</span></div>
    <div class="row"><div>Variety bonus (${r.counts.variety} rows)${nxt(r.next.variety, 'rows')}
      ${cheap.length && r.next.variety ? `<div class="muted">Cheap new rows: ${cheap.slice(0, 5).join(', ')}, or an exercise you haven't done</div>` : ''}</div><span class="pts">${r.bonuses.variety}</span></div>
    <div class="row"><b>Total</b><b class="pts">${r.total}</b></div>
  </div>
  <div class="card"><h3>Log</h3>
    ${entries.length ? entries.map((e) => `<div class="row"><div>${describe(e)}<div class="muted">${new Date(e.t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${late(e) ? ' · after window, not scored' : ''}</div></div>
      <button class="chip" data-action="del" data-id="${e.id}" aria-label="Delete entry">✕</button></div>`).join('') : '<p class="muted">Nothing logged yet.</p>'}
  </div>
  ${s.hardcore ? `<p class="muted" style="text-align:center">Hardcore: ends at the planned time${s.target ? `, or in overtime when you reach ${s.target} (24 h max)` : ''}.</p>
    <button class="btn danger" data-action="abort">Injury: end now</button>`
    : '<button class="btn primary" data-action="stop">Stop session</button>'}`;
}

function sessionView() {
  const s = active();
  if (!s) return startView();
  const segs = [['routes', 'Routes'], ['boulders', 'Boulders'], ['exercises', 'Exercise'], ['score', 'Score']];
  const body = { routes: routesView, boulders: bouldersView, exercises: exercisesView, score: scoreView }[ui.seg](s);
  return `<div class="wrap">
    <div class="seg" role="tablist">${segs.map(([k, l]) => `<button role="tab" aria-pressed="${ui.seg === k}" data-action="seg" data-seg="${k}">${l}</button>`).join('')}</div>
    ${body}</div>`;
}

function endNote(s) {
  if (!s.endedAt) return '';
  const h = (new Date(s.endedAt) - new Date(s.startedAt)) / 36e5;
  const took = `${Math.floor(h)}:${pad(Math.floor((h % 1) * 60))}`;
  return {
    target: ` · <span class="ok">hit target at ${took}</span>`,
    max: ` · missed target in 24 h`,
    abort: ` · <span class="err">ended for injury at ${took}</span>`,
    stop: Number(h) < s.durationMin / 60 ? ` · stopped at ${took}` : '',
  }[s.endReason] || '';
}

function historyView() {
  const l = ladder(sessionsForLadder());
  const list = Object.values(state.sessions).sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  return `<div class="wrap"><h1>History</h1>
  <div class="card"><h3>Tier ladder</h3>
    ${l.tiers.map((t) => `<div class="tier ${t.unlocked ? '' : 'locked'}"><span class="badge">${t.tier}</span>
      <span class="muted" style="flex:1">${t.passed ? `<span class="ok">Passed</span> ${new Date(t.passedOn).toLocaleDateString()}` : t.unlocked ? `${t.qualifying}/2 sessions${t.pending ? ` · ${t.pending} waiting on week-after check` : ''} · within ${t.maxMin / 60} h` : 'Locked'}</span></div>`).join('')}
    <p class="muted">A tier passes on two sessions at or above it with no injury flare or red flag in the week after each.</p>
  </div>
  ${list.length ? list.map((s) => {
    const r = scoreSession(s);
    const d = new Date(s.startedAt);
    const isActive = s.id === state.activeId;
    const weekDone = s.endedAt && Date.now() - new Date(s.endedAt) >= 7 * 864e5;
    return `<div class="card"><div class="row" style="border:0;padding-top:0">
        <div><b>${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</b>
          <div class="muted">${s.hardcore ? '<b>Hardcore</b> · ' : ''}${s.kind === 'weekly' ? 'Weekly' : 'Long day'} · ${s.durationMin / 60} h${s.target ? ` · target ${s.target}` : ''}${endNote(s)} · ${r.counts.differentRoutes} routes · ${r.counts.differentProblems} problems${isActive ? ' · in progress' : ''}${s.dirty ? ' · unsynced' : ''}</div></div>
        <b class="total" style="font-size:28px">${r.total}</b></div>
      ${s.endedAt ? `<div class="label" style="margin-top:6px">Week after: flare or red flag?</div>
        <div class="falls" style="grid-template-columns:repeat(3,1fr)">
          ${[[null, 'Not yet'], [false, 'None'], [true, 'Yes']].map(([v, lbl]) => `<button class="pick" aria-pressed="${(s.flareAfter ?? null) === v}" data-action="flare" data-id="${s.id}" data-v="${v}">${lbl}</button>`).join('')}
        </div>${!weekDone && s.flareAfter === false ? '<p class="muted">Marked early: the week after isn’t over yet.</p>' : ''}` : ''}
    </div>`;
  }).join('') : '<p class="muted">No sessions yet.</p>'}</div>`;
}

function settingsView() {
  const st = state.settings;
  return `<div class="wrap"><h1>Settings</h1>
  <div class="card"><h3>Cloud copy (private GitHub repo)</h3>
    <div class="field"><label for="owner">Owner</label><input class="text" id="owner" value="${esc(st.owner)}" autocapitalize="off" autocorrect="off"></div>
    <div class="field"><label for="repo">Repo</label><input class="text" id="repo" value="${esc(st.repo)}" autocapitalize="off" autocorrect="off"></div>
    <div class="field"><label for="token">Fine-grained token</label><input class="text" id="token" type="password" value="${esc(st.token)}" placeholder="github_pat_…" autocomplete="off"></div>
    <button class="btn primary" data-action="save-settings">Save and test</button>
    <button class="btn" data-action="sync-now" ${configured() ? '' : 'disabled'}>Sync now</button>
    <p class="muted">${esc(syncLabel().msg)}</p>
    <details><summary class="muted">How to make the token</summary><ol class="steps">
      <li>On GitHub: Settings → Developer settings → Fine-grained tokens → Generate new token.</li>
      <li>Repository access: <b>Only select repositories</b> → <b>${esc(st.repo || 'niad-log')}</b>.</li>
      <li>Permissions → Repository → <b>Contents: Read and write</b>. Nothing else.</li>
      <li>Pick an expiry, generate, copy, paste above. It stays on this phone only.</li>
    </ol></details>
  </div>
  <div class="card"><h3>Backup</h3>
    <button class="btn" data-action="export">Export all sessions (JSON)</button>
    <label class="btn" style="display:flex;align-items:center;justify-content:center;margin-top:10px">Import JSON<input type="file" accept="application/json" id="importFile" hidden></label>
  </div>
  <div class="card"><h3>Remove</h3>
    <p class="muted">Deletes sessions and the token from this phone. The GitHub copy stays until you delete the repo.</p>
    <button class="btn danger" data-action="wipe">Delete all data on this phone</button>
  </div>
  <p class="muted" style="text-align:center">Scoring: Hans Florine's Gym workout score card (Jan 2008) plus Rob's added exercises.</p>
  </div>`;
}

function sheetView() {
  const sh = ui.sheet;
  if (!sh) return '';
  const s = active();
  if (sh.kind === 'stop') {
    const r = scoreSession(s);
    return `<div class="scrim" data-action="close"></div><div class="sheet" role="dialog" aria-label="Stop session">
      <h2>Stop session</h2>
      <p class="muted">${r.total} points, ${s.entries.length} entr${s.entries.length === 1 ? 'y' : 'ies'}.</p>
      <button class="btn primary" data-action="stop-save">Save to History</button>
      <button class="btn danger" data-action="stop-discard">Discard</button>
      <p class="muted">Discard deletes this session from this device and from GitHub.</p>
      <button class="btn" data-action="close">Keep going</button></div>`;
  }
  if (sh.kind === 'abort') {
    return `<div class="scrim" data-action="close"></div><div class="sheet" role="dialog" aria-label="End for injury">
      <h2>End for injury?</h2>
      <p class="muted">Hardcore sessions only end early for an injury. The session is saved as ended for injury, with the week-after flare set to Yes, so it can't count toward a tier.</p>
      <button class="btn danger" data-action="abort-confirm">End now: injury</button>
      <button class="btn" data-action="close">Keep going</button></div>`;
  }
  if (sh.kind === 'route') {
    const routes = s.routes.filter((r) => r.grade === sh.grade);
    const isNew = sh.routeId === 'new';
    const ascents = isNew ? 0 : s.entries.filter((e) => e.routeId === sh.routeId).length;
    const gain = isNew ? routeFirstGo(sh.grade, sh.falls) : previewRoute(s, sh.routeId, sh.grade, sh.falls);
    const word = ascents ? 'hangs' : 'falls';
    return `<div class="scrim" data-action="close"></div><div class="sheet" role="dialog" aria-label="${sh.grade} route">
      <h2>${sh.grade} route</h2>
      <div class="label">Which route</div>
      <div class="picks">
        ${routes.map((r, i) => {
          const n = s.entries.filter((e) => e.routeId === r.id).length;
          return `<button class="pick" aria-pressed="${sh.routeId === r.id}" data-action="pick-route" data-id="${r.id}">${esc(r.label || `#${i + 1}`)}<small>${n} ascent${n === 1 ? '' : 's'}${n > 5 ? ' · repeats maxed' : ''}</small></button>`;
        }).join('')}
        <button class="pick" aria-pressed="${isNew}" data-action="pick-route" data-id="new">+ New route<small>first go</small></button>
      </div>
      ${isNew ? `<div class="label">Name (optional)</div><input class="text" id="newLabel" value="${esc(sh.label || '')}" placeholder="e.g. blue tape, lane 4" autocomplete="off">` : ''}
      <div class="label">${ascents ? 'Repeat: hangs' : 'First go: falls'}</div>
      <div class="falls">${[0, 1, 2, 3].map((f) => `<button class="pick" aria-pressed="${sh.falls === f}" data-action="falls" data-f="${f}">${f === 0 ? 'Clean' : f === 3 ? `3+ ${word}` : `${f}`}</button>`).join('')}</div>
      <div class="gain">+${gain}</div>
      <button class="btn primary" data-action="save-route">Log ascent</button>
      <button class="btn" data-action="close">Cancel</button></div>`;
  }
  const probs = s.problems.filter((p) => p.grade === sh.grade);
  const isNew = sh.problemId === 'new';
  const gain = isNew ? BOULDERS[sh.grade].first : previewProblem(s, sh.problemId, sh.grade);
  return `<div class="scrim" data-action="close"></div><div class="sheet" role="dialog" aria-label="${sh.grade} problem">
    <h2>${sh.grade} problem</h2>
    <div class="label">Which problem</div>
    <div class="picks">
      ${probs.map((p, i) => {
        const n = s.entries.filter((e) => e.problemId === p.id).length;
        return `<button class="pick" aria-pressed="${sh.problemId === p.id}" data-action="pick-problem" data-id="${p.id}">${esc(p.label || `#${i + 1}`)}<small>${n} send${n === 1 ? '' : 's'}${n > 5 ? ' · repeats maxed' : ''}</small></button>`;
      }).join('')}
      <button class="pick" aria-pressed="${isNew}" data-action="pick-problem" data-id="new">+ New problem<small>first send</small></button>
    </div>
    ${isNew ? `<div class="label">Name (optional)</div><input class="text" id="newLabel" value="${esc(sh.label || '')}" placeholder="e.g. yellow, cave" autocomplete="off">` : ''}
    <div class="gain">+${gain}</div>
    <button class="btn primary" data-action="save-problem">Log send</button>
    <button class="btn" data-action="close">Cancel</button></div>`;
}

function rulesView() {
  const bonusChips = (table, unit) => `<div class="bchips">${table.map(([n, p]) => `<span class="bchip"><b>${n}</b> ${unit}<em>+${p}</em></span>`).join('')}</div>`;
  const maxRp = ROUTES['5.14'].rp;
  return `<div class="wrap"><h1>Points</h1>

  <div class="card"><h3>How a total is built</h3>
    <div class="flow">
      <div class="fbox">Routes<small>per route: 1 first go + up to ${MAX_REPEATS} repeats</small></div>
      <div class="fop">+</div>
      <div class="fbox">Boulders<small>per problem: 1 first send + up to ${MAX_REPEATS} repeats</small></div>
      <div class="fop">+</div>
      <div class="fbox">Exercises<small>reps or calories ÷ rate, rounded down</small></div>
      <div class="fop">+</div>
      <div class="fbox bonus">Bonuses<small>different routes · different problems · rows used (A–AA)</small></div>
      <div class="fop">=</div>
      <div class="fbox total-box">Total<small>everything logged inside the session clock</small></div>
    </div>
  </div>

  <div class="card"><h3>Routes</h3>
    <p class="muted">Clean = no falls or hangs. Lead, top rope and auto-belay score the same. 5.10a–d all score as 5.10.</p>
    <table class="rubric"><thead><tr><th>Row</th><th>Grade</th><th>Clean<br>1st / rpt</th><th>Falls on 1st<br>1 · 2 · 3+</th><th>Hangs rpt<br>≤2</th></tr></thead><tbody>
    ${ROUTE_GRADES.map((g) => { const r = ROUTES[g]; return `<tr><td class="ltrc">${r.letter}</td><td><b>${g}</b><i class="bar" style="width:${Math.max(4, (r.rp / maxRp) * 100)}%"></i></td><td><b>${r.rp}</b> / ${r.rep}</td><td>${g === '5.6' ? '1 (“moves”)' : r.nc.join(' · ')}</td><td>${r.ncRep}</td></tr>`; }).join('')}
    </tbody></table>
    <ul class="rules">
      <li>One ascent per route takes the first-go points; the rest are repeats, max ${MAX_REPEATS}.</li>
      <li>A repeat with 3 or more hangs scores 1.</li>
      <li>Never both clean and fallen first-go points on one route: the app keeps the better one.</li>
      <li>Down-climbing: same route = a repeat, a different route = its first go.</li>
    </ul>
  </div>

  <div class="card"><h3>Boulders</h3>
    <p class="muted">Log sends only. A send on any attempt earns first-send points.</p>
    <table class="rubric"><thead><tr><th>Row</th><th>Grade</th><th>1st send</th><th>Repeat</th></tr></thead><tbody>
    ${BOULDER_GRADES.map((g) => { const b = BOULDERS[g]; return `<tr><td class="ltrc">${b.letter}</td><td><b>${g}</b></td><td><b>${b.first}</b></td><td>${b.rep}</td></tr>`; }).join('')}
    </tbody></table>
  </div>

  <div class="card"><h3>Exercises</h3>
    <table class="rubric"><thead><tr><th>Row</th><th>Exercise</th><th>Rate</th><th>From</th></tr></thead><tbody>
    ${EXERCISES.map((ex) => `<tr><td class="ltrc">${ex.letter || '–'}</td><td>${esc(ex.label)}</td><td>${ex.each ? `${ex.each} pts per ${ex.unit}` : ex.per === 1 ? '1 pt each' : `1 pt per ${ex.per}${ex.unit === 'cal' ? ' cal' : ''}`}</td><td class="muted">${ex.source.startsWith('Hans') ? 'Hans' : 'Rob'}</td></tr>`).join('')}
    </tbody></table>
    <ul class="rules">
      <li>Machine calories (Stairmaster, rower, SkiErg) are added together before rounding down.</li>
      <li>Reps inside a 3-5-7 block don't also count as pull-ups, push-ups or squats.</li>
      <li>Rob's additions have no row letter, so they don't count toward the variety bonus.</li>
    </ul>
  </div>

  <div class="card"><h3>Bonuses</h3>
    <p class="muted">The highest step reached applies; steps don't add up.</p>
    <div class="label">Different routes</div>${bonusChips(ROUTE_BONUS, 'routes')}
    <div class="label">Different problems</div>${bonusChips(BOULDER_BONUS, 'probs')}
    <div class="label">Rows used (A–AA)</div>${bonusChips(VARIETY_BONUS, 'rows')}
  </div>

  <div class="card"><h3>Tier ladder</h3>
    <div class="ladderdiag">${TIERS.map((t, i) => `<div class="rung" style="--h:${20 + i * 16}%"><i></i><b>${t.toLocaleString()}</b><small>${i === 0 ? 'in 6 h' : '≤ 24 h'}</small></div>`).join('')}</div>
    <p class="muted">Pass a tier with two sessions at or above it and no injury flare or red flag in the week after each. Passing unlocks the next.</p>
  </div>

  <p class="muted" style="text-align:center">Hans Florine's Gym workout score card (Jan 2008), plus Rob's added exercises.</p>
  </div>`;
}

function tabsView() {
  const t = [['session', active() ? 'Session' : 'Start'], ['rules', 'Points'], ['history', 'History'], ['settings', 'Settings']];
  return `<nav class="tabs">${t.map(([k, l]) => `<button data-action="tab" data-tab="${k}" ${ui.tab === k ? 'aria-current="page"' : ''}>${l}</button>`).join('')}</nav>`;
}

function toastView() {
  if (!ui.toast) return '';
  return `<div class="toast" role="status"><span>${esc(ui.toast.text)}</span>${ui.toast.undoId ? `<button data-action="undo">Undo</button>` : ''}</div>`;
}

const root = document.getElementById('app');
function render() {
  const view = { session: sessionView, rules: rulesView, history: historyView, settings: settingsView }[ui.tab]();
  const y = window.scrollY;
  root.innerHTML = header() + view + tabsView() + toastView() + sheetView();
  window.scrollTo(0, y);
}
function renderHeaderOnly() {
  const el = document.getElementById('syncmsg');
  if (el) el.textContent = syncLabel().msg;
}

// Tick the clock without re-rendering inputs.
setInterval(() => {
  const s = active();
  if (!s) return;
  if (checkHardcore()) { render(); return; }
  const el = document.getElementById('clock');
  if (!el) return;
  const c = clockParts(s);
  const note = document.getElementById('clocknote');
  if (!s.hardcore && c.clock === 'Time' && el.textContent !== 'Time') { render(); return; }
  el.textContent = c.clock;
  if (note && note.textContent !== c.note) note.textContent = c.note;
}, 1000);

// ---------- Events ----------
root.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  const s = active();
  switch (a) {
    case 'tab': ui.tab = el.dataset.tab; ui.sheet = null; window.scrollTo(0, 0); break;
    case 'seg': ui.seg = el.dataset.seg; break;
    case 'start-weekly': startSession('weekly', 6, hardcoreChoice()); break;
    case 'start-long': {
      const h = parseFloat(document.getElementById('longHours').value) || 12;
      startSession('long', h, hardcoreChoice());
      break;
    }
    case 'stop': if (s && !s.hardcore) ui.sheet = { kind: 'stop' }; break;
    case 'stop-save': if (s && !s.hardcore) finishSession(s, { reason: 'stop' }); break;
    case 'stop-discard':
      if (!s || s.hardcore) return;
      if (!confirm('Discard this session? It is deleted from this device and from GitHub. This cannot be undone.')) return;
      discardSession(); break;
    case 'abort': if (s?.hardcore) ui.sheet = { kind: 'abort' }; break;
    case 'abort-confirm': if (s?.hardcore) finishSession(s, { reason: 'abort' }); break;
    case 'open-route': {
      const g = el.dataset.grade;
      const last = [...s.entries].reverse().find((e) => e.type === 'route' && s.routes.find((r) => r.id === e.routeId)?.grade === g);
      ui.sheet = { kind: 'route', grade: g, routeId: last ? last.routeId : 'new', falls: 0, label: '' };
      break;
    }
    case 'open-boulder': {
      const g = el.dataset.grade;
      const last = [...s.entries].reverse().find((e) => e.type === 'boulder' && s.problems.find((p) => p.id === e.problemId)?.grade === g);
      ui.sheet = { kind: 'boulder', grade: g, problemId: last ? last.problemId : 'new', label: '' };
      break;
    }
    case 'pick-route': ui.sheet.routeId = el.dataset.id; ui.sheet.falls = 0; break;
    case 'pick-problem': ui.sheet.problemId = el.dataset.id; break;
    case 'falls': keepLabel(); ui.sheet.falls = Number(el.dataset.f); break;
    case 'save-route': {
      keepLabel();
      const sh = ui.sheet;
      let routeId = sh.routeId;
      if (routeId === 'new') {
        routeId = uid();
        s.routes.push({ id: routeId, grade: sh.grade, label: (sh.label || '').trim() });
      }
      ui.sheet = null;
      addEntry({ type: 'route', routeId, falls: sh.falls }, `${sh.grade} ${sh.falls ? `(${sh.falls === 3 ? '3+' : sh.falls})` : 'clean'}`);
      break;
    }
    case 'save-problem': {
      keepLabel();
      const sh = ui.sheet;
      let problemId = sh.problemId;
      if (problemId === 'new') {
        problemId = uid();
        s.problems.push({ id: problemId, grade: sh.grade, label: (sh.label || '').trim() });
      }
      ui.sheet = null;
      addEntry({ type: 'boulder', problemId }, `${sh.grade} send`);
      break;
    }
    case 'close': ui.sheet = null; break;
    case 'add-ex': {
      const ex = EXERCISES.find((e) => e.key === el.dataset.key);
      addEntry({ type: 'exercise', key: ex.key, amount: Number(el.dataset.amount) }, `${ex.label} ${el.dataset.amount}`);
      break;
    }
    case 'add-ex-num': {
      const ex = EXERCISES.find((e) => e.key === el.dataset.key);
      const input = root.querySelector(`[data-num="${ex.key}"]`);
      const n = Number(input.value);
      if (!(n > 0)) { input.focus(); return; }
      addEntry({ type: 'exercise', key: ex.key, amount: n }, `${ex.label} ${n}`);
      break;
    }
    case 'undo': if (ui.toast?.undoId) removeEntry(ui.toast.undoId); ui.toast = null; break;
    case 'del': if (confirm('Delete this entry?')) removeEntry(el.dataset.id); break;
    case 'flare': {
      const sess = state.sessions[el.dataset.id];
      sess.flareAfter = el.dataset.v === 'null' ? null : el.dataset.v === 'true';
      touch(sess);
      break;
    }
    case 'save-settings': {
      state.settings = {
        owner: document.getElementById('owner').value.trim(),
        repo: document.getElementById('repo').value.trim(),
        token: document.getElementById('token').value.trim(),
      };
      save();
      if (!configured()) { ui.sync = { status: 'err', msg: 'Fill in owner, repo and token' }; break; }
      ui.sync = { status: 'wait', msg: 'Testing…' }; render();
      try {
        await createSync(state.settings).test();
        for (const x of Object.values(state.sessions)) x.dirty = true;
        save();
        await runSync();
        return;
      } catch (e) {
        ui.sync = { status: 'err', msg: e.message };
      }
      break;
    }
    case 'sync-now': await runSync(); return;
    case 'export': {
      const blob = new Blob([JSON.stringify(Object.values(state.sessions).map(({ sha, dirty, ...x }) => x), null, 2)], { type: 'application/json' });
      const a2 = document.createElement('a');
      a2.href = URL.createObjectURL(blob);
      a2.download = `niad-sessions-${new Date().toISOString().slice(0, 10)}.json`;
      a2.click();
      setTimeout(() => URL.revokeObjectURL(a2.href), 1000);
      return;
    }
    case 'wipe':
      if (!confirm('Delete every session and the token from this phone? This cannot be undone here. The GitHub copy is not touched.')) return;
      state = blank(); save(); break;
    default: return;
  }
  render();
});

function keepLabel() {
  const el = document.getElementById('newLabel');
  if (el && ui.sheet) ui.sheet.label = el.value;
}

function hardcoreChoice() {
  const target = Number(document.getElementById('target')?.value) || null;
  const choice = { hardcore: !!ui.hardcore, target: ui.hardcore ? target : null };
  ui.hardcore = false;
  ui.target = '';
  return choice;
}

root.addEventListener('input', (ev) => {
  if (ev.target.id === 'target') ui.target = ev.target.value;
});

root.addEventListener('change', async (ev) => {
  if (ev.target.id === 'hardcore') {
    ui.hardcore = ev.target.checked;
    document.getElementById('targetField').hidden = !ui.hardcore;
    return;
  }
  if (ev.target.id !== 'importFile') return;
  const file = ev.target.files[0];
  if (!file) return;
  try {
    const list = JSON.parse(await file.text());
    for (const s of list) if (s.id && s.startedAt && Array.isArray(s.entries)) state.sessions[s.id] = { ...s, dirty: true };
    save(); scheduleSync(500);
    showToast(`Imported ${list.length} sessions`);
  } catch {
    showToast('Import failed: not a NIAD export');
  }
  render();
});

root.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && ev.target.matches('[data-num]')) root.querySelector(`[data-action="add-ex-num"][data-key="${ev.target.dataset.num}"]`)?.click();
});

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

render();
scheduleSync(300);
