// Reading and writing the data file in the private moni-data repo.
const API = 'https://api.github.com';

export class SyncError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // offline | auth | notfound | public | conflict | other
  }
}

export function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function fromBase64(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

async function call(token, path, init = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new SyncError('offline', "Couldn't reach GitHub. moni will try again when you're online.");
  }
  if (res.status === 401) throw new SyncError('auth', 'GitHub rejected the token. It may have expired: paste a new one in Settings.');
  return res;
}

// Checks the token can see the repo and that the repo is private.
export async function checkRepo(token, repo) {
  const res = await call(token, `/repos/${repo}`);
  if (res.status === 404 || res.status === 403) {
    throw new SyncError('notfound', `This token can't see ${repo}. Check the repo name and that the token has access to it.`);
  }
  if (!res.ok) throw new SyncError('other', `GitHub error ${res.status}`);
  const info = await res.json();
  if (!info.private) throw new SyncError('public', `${repo} is public. Make it private on GitHub first; your bank data must not be public.`);
  return info;
}

// Returns { data, sha } or null if the file doesn't exist yet.
export async function readFile(token, repo, path) {
  const res = await call(token, `/repos/${repo}/contents/${path}`);
  if (res.status === 404) return null;
  if (res.status === 403) throw new SyncError('notfound', `This token can't read ${repo}.`);
  if (!res.ok) throw new SyncError('other', `GitHub error ${res.status}`);
  const meta = await res.json();
  let text;
  if (meta.content) {
    text = fromBase64(meta.content);
  } else {
    // Files over 1 MB come back without content; fetch the blob instead.
    const blob = await call(token, `/repos/${repo}/git/blobs/${meta.sha}`);
    if (!blob.ok) throw new SyncError('other', `GitHub error ${blob.status}`);
    text = fromBase64((await blob.json()).content);
  }
  return { data: JSON.parse(text), sha: meta.sha };
}

export async function writeFile(token, repo, path, data, sha, message) {
  const res = await call(token, `/repos/${repo}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: toBase64(JSON.stringify(data)), ...(sha ? { sha } : {}) }),
  });
  if (res.status === 409 || res.status === 422) throw new SyncError('conflict', 'The file changed on another device.');
  if (res.status === 403 || res.status === 404) {
    throw new SyncError('notfound', `This token can't write to ${repo}. It needs Contents: Read and write.`);
  }
  if (!res.ok) throw new SyncError('other', `GitHub error ${res.status}`);
  return (await res.json()).content.sha;
}
