// Cloud copy of sessions in a private GitHub repo, one JSON file per session under sessions/.
// Uses GitHub's contents API with a fine-grained token limited to that repo.
// The phone keeps every change locally first; sync pushes changed sessions and pulls others.

const API = 'https://api.github.com';

function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64decode(b64) {
  const bin = atob(b64.replace(/\n/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

// Union of two copies of the same session. Entries, routes and problems are merged by id;
// deleted ids (tombstones) win; other fields come from `local`.
export function mergeSessions(local, remote) {
  if (!remote) return local;
  const deleted = [...new Set([...(local.deleted || []), ...(remote.deleted || [])])];
  const gone = new Set(deleted);
  const byId = (a, b) => {
    const m = new Map();
    for (const x of [...(b || []), ...(a || [])]) m.set(x.id, x);
    return [...m.values()].filter((x) => !gone.has(x.id));
  };
  return {
    ...remote,
    ...local,
    deleted,
    routes: byId(local.routes, remote.routes),
    problems: byId(local.problems, remote.problems),
    entries: byId(local.entries, remote.entries).sort((x, y) => new Date(x.t) - new Date(y.t)),
  };
}

// Strip local-only fields before upload.
function forUpload(session) {
  const { dirty, sha, ...rest } = session;
  return rest;
}

export function createSync({ owner, repo, token, fetchImpl = globalThis.fetch.bind(globalThis) }) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const url = (path) => `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`;

  async function call(path, opts = {}) {
    const res = await fetchImpl(url(path), { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
    if (res.status === 404) return { status: 404, body: null };
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error((body && body.message) || `GitHub error ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return { status: res.status, body };
  }

  async function getSession(id) {
    const { body } = await call(`sessions/${id}.json`);
    if (!body) return null;
    return { session: JSON.parse(b64decode(body.content)), sha: body.sha };
  }

  async function put(session, sha) {
    const content = b64encode(JSON.stringify(forUpload(session), null, 2) + '\n');
    const { body } = await call(`sessions/${session.id}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Session ${session.id}`, content, ...(sha ? { sha } : {}) }),
    });
    return body.content.sha;
  }

  return {
    // Checks the token can read the repo.
    async test() {
      const res = await fetchImpl(`${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { headers });
      if (!res.ok) throw new Error(res.status === 404 ? 'Repo not found or token has no access to it' : `GitHub error ${res.status}`);
      return true;
    },

    // Push one changed session. Returns the merged session with its new sha.
    async push(local) {
      let sha = local.sha;
      let toWrite = local;
      try {
        sha = await put(toWrite, sha);
      } catch (e) {
        if (e.status !== 409 && e.status !== 422) throw e;
        // Someone else (another device) wrote it: merge and retry once.
        const remote = await getSession(local.id);
        toWrite = mergeSessions(local, remote && remote.session);
        sha = await put(toWrite, remote && remote.sha);
      }
      return { ...toWrite, sha, dirty: false };
    },

    // List remote sessions: [{ id, sha }].
    async list() {
      const { body } = await call('sessions');
      if (!body) return [];
      return body
        .filter((f) => f.type === 'file' && f.name.endsWith('.json'))
        .map((f) => ({ id: f.name.replace(/\.json$/, ''), sha: f.sha }));
    },

    getSession,
  };
}

// Full sync: push every dirty local session, then pull remote sessions that are new or changed.
// local: { [id]: session }. Returns the new map.
export async function syncAll(sync, local) {
  const out = { ...local };
  for (const s of Object.values(out)) {
    if (s.dirty) out[s.id] = await sync.push(s);
  }
  for (const { id, sha } of await sync.list()) {
    const mine = out[id];
    if (mine && mine.sha === sha) continue;
    const remote = await sync.getSession(id);
    if (!remote) continue;
    out[id] = mine ? { ...mergeSessions(mine, remote.session), sha: remote.sha, dirty: !!mine.dirty } : { ...remote.session, sha: remote.sha, dirty: false };
  }
  return out;
}
