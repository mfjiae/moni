// Backup and restore (28 Oct 2026, batch 4). A backup is ONE json file holding the same snapshot that sync uses
// (txns, learned rules, categories, budgets, ETFs, bills, names, tombstones, balances, cash, goal). It never holds
// the sync token. The pure parts (build, read, count, plan) are tested; the database parts are thin.
//
// Restore has two ways (Ken, prototype "Moni Batch 4"):
//  - Merge (safe): the same merge sync uses. Anything missing here is added; per record the newest edit wins;
//    nothing is deleted.
//  - Replace: this device becomes the backup. Everything on the device that is not in the file is removed (with a
//    delete mark, so the other devices follow on the next sync) and every record from the file is stamped "now" so
//    it beats older delete marks.
import { mergeSnapshots, normalize } from './merge.js';
import { todaySydney } from './dates.js';

export const BACKUP_APP = 'moni';
export const BACKUP_VERSION = 1;
export const REMIND_AFTER_MS = 30 * 24 * 3600 * 1000;
const LISTS = ['txns', 'rules', 'categories', 'budgets', 'etfs', 'bills', 'names'];

export function buildBackup(snapshot, now = Date.now()) {
  return { app: BACKUP_APP, backupVersion: BACKUP_VERSION, savedAt: now, snapshot: normalize(snapshot) };
}

export const backupFileName = (now = new Date()) => `moni-backup-${todaySydney(now)}.json`;

// Reads the text of a picked file. Throws an Error with a plain-words message when it isn't a moni backup.
export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('That file isn’t a moni backup (it can’t be read).'); }
  if (!data || data.app !== BACKUP_APP || typeof data.snapshot !== 'object' || !data.snapshot) {
    throw new Error('That file isn’t a moni backup.');
  }
  if (typeof data.backupVersion !== 'number' || data.backupVersion > BACKUP_VERSION) {
    throw new Error('This backup was made by a newer version of moni. Update moni first.');
  }
  const s = data.snapshot;
  for (const k of LISTS) {
    if (s[k] != null && !Array.isArray(s[k])) throw new Error('This backup file looks damaged.');
  }
  return { savedAt: Number(data.savedAt) || null, snapshot: normalize(s) };
}

// The numbers shown on the Backup card and the Restore sheet.
export function backupCounts(snapshot) {
  const s = normalize(snapshot);
  const accounts = (s.balance ? 1 : 0) + Object.values(s.balances).filter(Boolean).length;
  return { txns: s.txns.length, rules: s.rules.length, names: s.names.length, bills: s.bills.filter((b) => !b.dismissed).length, budgets: s.budgets.length, accounts };
}

// What a restore would do. `local` and `file` are snapshots. Returns { result } = the snapshot to write,
// plus for 'replace' the uids to remove (already turned into delete marks inside result.tombstones).
export function planRestore(local, file, mode, now = Date.now()) {
  const l = normalize(local);
  const f = normalize(file);
  if (mode !== 'replace') return { mode: 'merge', result: mergeSnapshots(l, f) };
  const stamp = (r) => ({ ...r, updatedAt: now });
  const tombstones = { ...f.tombstones };
  const out = {};
  for (const k of LISTS) {
    const inFile = new Set(f[k].map((r) => r.uid));
    for (const r of l[k]) if (!inFile.has(r.uid)) tombstones[r.uid] = now;
    out[k] = f[k].map(stamp);
    // A restored record must not be killed by a delete mark of its own.
    for (const r of out[k]) delete tombstones[r.uid];
  }
  return {
    mode: 'replace',
    result: normalize({
      ...out,
      tombstones,
      balance: f.balance,
      balances: f.balances,
      cash: f.cash ? stamp(f.cash) : null,
      goal: f.goal ? stamp(f.goal) : null,
    }),
  };
}

// The reminder: on Home when the last backup (or, if there never was one, the first day moni had data) is over 30 days old.
// meta = { at, since, remind } from the local-only `backup` meta row.
export function backupDue(meta, hasData, now = Date.now()) {
  if (!hasData || meta?.remind === false) return false;
  const from = meta?.at ?? meta?.since;
  if (from == null) return false; // clock not started yet
  return now - from > REMIND_AFTER_MS;
}

export function backupAgo(at, now = Date.now()) {
  if (at == null) return 'never';
  const days = Math.floor((now - at) / 86400000);
  if (days <= 0) return 'today';
  return days === 1 ? '1 day ago' : `${days} days ago`;
}
