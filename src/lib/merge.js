// Pure merge logic for syncing between devices (tested).
//
// A snapshot = { version, txns, rules, categories, budgets, etfs, bills, tombstones, balance, balances }.
// (balances = the savings accounts' balances by account id, added in M2.6; `balance` stays Smart Access.
// An older app version drops `balances`; the next sync from a new version puts them back.)
// (categories = your renames, hidden flags and custom categories; added in M2.5.
// An older app version simply ignores them, and the next sync from a new one puts them back.)
// (budgets = from-month budget records, added in M3. An older app version drops them when it writes;
// the next sync from a new version puts them back.)
// (etfs = your ETF list, added in M4; same rule as budgets. ETF tags live on the transactions themselves.)
// (bills = your bills and dismissed bill suggestions, added in M5; same rule as budgets.)
// (cash = the cash balance you set: { cents, asOf, setAt, updatedAt }, added with Paid with cash Push 2;
// the newest one you saved wins. An older app version drops it; the next new-version sync puts it back.)
// (names = your nicknames for bank text, added with clean names; same rule as budgets.)
// (goal = your savings goal { name, targetCents, byDate, startDate, updatedAt }, added in batch 3; newest wins;
// an older app version drops it; the next new-version sync puts it back.)
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
    categories: [...(s?.categories ?? [])].sort(byUid),
    budgets: [...(s?.budgets ?? [])].sort(byUid),
    etfs: [...(s?.etfs ?? [])].sort(byUid),
    bills: [...(s?.bills ?? [])].sort(byUid),
    names: [...(s?.names ?? [])].sort(byUid),
    tombstones: { ...(s?.tombstones ?? {}) },
    balance: s?.balance ?? null,
    balances: { ...(s?.balances ?? {}) },
    cash: s?.cash ?? null,
    goal: s?.goal ?? null,
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

// Single-record settings (cash, goal): the newest one saved wins.
function newerSetting(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
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
    categories: mergeRecords(l.categories, r.categories, tombstones),
    budgets: mergeRecords(l.budgets, r.budgets, tombstones),
    etfs: mergeRecords(l.etfs, r.etfs, tombstones),
    bills: mergeRecords(l.bills, r.bills, tombstones),
    names: mergeRecords(l.names, r.names, tombstones),
    tombstones,
    balance: newerBalance(l.balance, r.balance),
    balances: Object.fromEntries([...new Set([...Object.keys(l.balances), ...Object.keys(r.balances)])]
      .map((id) => [id, newerBalance(l.balances[id], r.balances[id])])),
    cash: newerSetting(l.cash, r.cash),
    goal: newerSetting(l.goal, r.goal),
  });
}
