// Pure merge logic for syncing between devices (tested).
//
// A snapshot = { version, txns, rules, tombstones, balance }.
// - Every record has a stable `uid` and an `updatedAt` (ms).
// - The newest edit of a record wins.
// - A tombstone { uid: deletedAt } removes a record unless it was edited after the delete.

export const SNAPSHOT_VERSION = 1;

export function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

const byUid = (a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0);

export function normalize(s) {
  return {
    version: SNAPSHOT_VERSION,
    txns: [...(s?.txns ?? [])].sort(byUid),
    rules: [...(s?.rules ?? [])].sort(byUid),
    tombstones: { ...(s?.tombstones ?? {}) },
    balance: s?.balance ?? null,
  };
}

export const sameSnapshot = (a, b) => stableStringify(normalize(a)) === stableStringify(normalize(b));

function mergeRecords(a, b, tombstones) {
  const out = new Map();
  for (const r of [...a, ...b]) {
    const cur = out.get(r.uid);
    if (!cur || (r.updatedAt ?? 0) > (cur.updatedAt ?? 0)) out.set(r.uid, r);
  }
  for (const [uid, r] of out) {
    const deletedAt = tombstones[uid];
    if (deletedAt != null && deletedAt >= (r.updatedAt ?? 0)) out.delete(uid);
  }
  return [...out.values()];
}

function newerBalance(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  if (a.asOf !== b.asOf) return a.asOf > b.asOf ? a : b;
  return (a.updatedAt ?? 0) >= (b.updatedAt ?? 0) ? a : b;
}

export function mergeSnapshots(local, remote) {
  const l = normalize(local);
  if (!remote) return l;
  const r = normalize(remote);
  const tombstones = { ...r.tombstones };
  for (const [k, v] of Object.entries(l.tombstones)) tombstones[k] = Math.max(v, tombstones[k] ?? 0);
  return normalize({
    txns: mergeRecords(l.txns, r.txns, tombstones),
    rules: mergeRecords(l.rules, r.rules, tombstones),
    tombstones,
    balance: newerBalance(l.balance, r.balance),
  });
}
