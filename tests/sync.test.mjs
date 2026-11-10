import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSync, syncAll, mergeSessions, discardAll } from '../sync.js';

// In-memory fake of the GitHub contents API.
function fakeGitHub() {
  const files = new Map(); // path -> { content, sha }
  let shaN = 0;
  const calls = [];
  const json = (status, body) => ({ ok: status < 300, status, json: async () => body });
  async function fetchImpl(url, opts = {}) {
    calls.push({ url, method: opts.method || 'GET', auth: opts.headers.Authorization });
    const m = url.match(/\/contents\/(.*)$/);
    if (!m) return json(200, { full_name: 'x/y' });
    const path = decodeURIComponent(m[1]);
    if ((opts.method || 'GET') === 'GET') {
      if (path === 'sessions') {
        const list = [...files.entries()].map(([p, f]) => ({ type: 'file', name: p.split('/').pop(), sha: f.sha }));
        return list.length ? json(200, list) : json(404, { message: 'Not Found' });
      }
      const f = files.get(path);
      return f ? json(200, { content: f.content, sha: f.sha }) : json(404, { message: 'Not Found' });
    }
    const body = JSON.parse(opts.body);
    const existing = files.get(path);
    if (opts.method === 'DELETE') {
      if (!existing) return json(404, { message: 'Not Found' });
      if (body.sha !== existing.sha) return json(409, { message: 'sha mismatch' });
      files.delete(path);
      return json(200, { commit: {} });
    }
    if (existing && body.sha !== existing.sha) return json(409, { message: 'sha mismatch' });
    const sha = `sha${++shaN}`;
    files.set(path, { content: body.content, sha });
    return json(201, { content: { sha } });
  }
  return { files, calls, fetchImpl };
}

const s1 = () => ({
  id: '2026-11-14-0900', startedAt: '2026-11-14T09:00:00Z', durationMin: 360,
  routes: [{ id: 'r1', grade: '5.9', label: 'blue' }], problems: [],
  entries: [{ id: 'e1', t: '2026-11-14T09:05:00Z', type: 'route', routeId: 'r1', falls: 0 }],
  dirty: true,
});

test('push writes the session file without local-only fields and clears dirty', async () => {
  const gh = fakeGitHub();
  const sync = createSync({ owner: 'robdhyman', repo: 'niad-log', token: 't0k', fetchImpl: gh.fetchImpl });
  const pushed = await sync.push(s1());
  assert.equal(pushed.dirty, false);
  assert.equal(pushed.sha, 'sha1');
  const stored = JSON.parse(Buffer.from(gh.files.get('sessions/2026-11-14-0900.json').content, 'base64').toString());
  assert.equal(stored.dirty, undefined);
  assert.equal(stored.entries.length, 1);
  assert.equal(gh.calls[0].auth, 'Bearer t0k');
});

test('conflicting write from another device is merged, not lost', async () => {
  const gh = fakeGitHub();
  const phone = createSync({ owner: 'o', repo: 'r', token: 't', fetchImpl: gh.fetchImpl });
  const first = await phone.push(s1());
  // another device adds e2
  const other = { ...first, entries: [...first.entries, { id: 'e2', t: '2026-11-14T09:10:00Z', type: 'boulder', problemId: 'p1' }], dirty: true };
  await phone.push(other);
  // phone still has old sha and adds e3
  const mine = { ...first, entries: [...first.entries, { id: 'e3', t: '2026-11-14T09:20:00Z', type: 'exercise', key: 'pushups', amount: 9 }], dirty: true };
  const merged = await phone.push(mine);
  assert.deepEqual(merged.entries.map((e) => e.id), ['e1', 'e2', 'e3']);
});

test('deleted entries stay deleted after a merge', () => {
  const a = { ...s1(), entries: [], deleted: ['e1'] };
  const b = s1();
  assert.equal(mergeSessions(a, b).entries.length, 0);
});

test('syncAll pushes dirty sessions and pulls new remote ones', async () => {
  const gh = fakeGitHub();
  const sync = createSync({ owner: 'o', repo: 'r', token: 't', fetchImpl: gh.fetchImpl });
  await sync.push({ ...s1(), id: 'remote-only' });
  const out = await syncAll(sync, { [s1().id]: s1() });
  assert.equal(out[s1().id].dirty, false);
  assert.ok(out['remote-only']);
  assert.equal(out['remote-only'].dirty, false);
});

test('discardAll deletes the remote file, and a missing file counts as done', async () => {
  const gh = fakeGitHub();
  const sync = createSync({ owner: 'o', repo: 'r', token: 't', fetchImpl: gh.fetchImpl });
  await sync.push(s1());
  const done = await discardAll(sync, [s1().id, 'never-synced']);
  assert.deepEqual(done, [s1().id, 'never-synced']);
  assert.equal(gh.files.size, 0);
  assert.ok(gh.calls.some((c) => c.method === 'DELETE'));
});

test('syncAll does not pull back a discarded session', async () => {
  const gh = fakeGitHub();
  const sync = createSync({ owner: 'o', repo: 'r', token: 't', fetchImpl: gh.fetchImpl });
  await sync.push(s1());
  const out = await syncAll(sync, {}, [s1().id]);
  assert.equal(out[s1().id], undefined);
});
