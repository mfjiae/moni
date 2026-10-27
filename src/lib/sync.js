// Sync this device with moni.json in the private moni-data repo.
// Flow: read remote -> merge with local -> save merged locally -> write remote if it changed.
import { db } from './db.js';
import { mergeSnapshots, normalize, sameSnapshot, stableStringify } from './merge.js';
import { checkRepo, readFile, writeFile, SyncError } from './github.js';
import { SAVERS, balanceKey } from './accounts.js';

export const DATA_PATH = 'moni.json';
export const DEFAULT_REPO = 'mfjiae/moni-data';

export const getSyncConfig = () => db.meta.get('sync');

async function readLocal() {
  const [txns, rules, categories, budgets, etfs, bills, tombs, balance, cashMeta, goalMeta, ...saverBalances] = await Promise.all([
    db.txns.toArray(),
    db.userRules.toArray(),
    db.categories.toArray(),
    db.budgetPlans.toArray(),
    db.etfs.toArray(),
    db.bills.toArray(),
    db.tombstones.toArray(),
    db.meta.get('balance'),
    db.meta.get('cash'),
    db.meta.get('goal'),
    ...SAVERS.map((a) => db.meta.get(balanceKey(a.id))),
  ]);
  const balances = {};
  SAVERS.forEach((a, i) => {
    if (saverBalances[i]) { const { key: _k, ...b } = saverBalances[i]; balances[a.id] = b; }
  });
  return normalize({
    txns,
    rules,
    categories,
    budgets,
    etfs,
    bills,
    tombstones: Object.fromEntries(tombs.map((t) => [t.key, t.deletedAt])),
    balance: balance ?? null,
    balances,
    cash: cashMeta ? (({ key: _k, ...c }) => c)(cashMeta) : null,
    goal: goalMeta ? (({ key: _k, ...c }) => c)(goalMeta) : null,
  });
}

// Apply the merged snapshot without losing edits made while the sync was running:
// a record is only overwritten by a version at least as new, and only deleted by a newer delete.
async function writeLocal(merged) {
  await db.transaction('rw', db.txns, db.userRules, db.categories, db.budgetPlans, db.etfs, db.bills, db.tombstones, db.meta, async () => {
    for (const [table, list] of [[db.txns, merged.txns], [db.userRules, merged.rules], [db.categories, merged.categories], [db.budgetPlans, merged.budgets], [db.etfs, merged.etfs], [db.bills, merged.bills]]) {
      const current = new Map((await table.toArray()).map((r) => [r.uid, r]));
      // (categories are keyed by id, which is also their uid)
      const puts = list.filter((r) => {
        const cur = current.get(r.uid);
        return !cur || ((cur.updatedAt ?? 0) <= (r.updatedAt ?? 0) && stableStringify(cur) !== stableStringify(r));
      });
      if (puts.length) await table.bulkPut(puts);
      const dels = [...current.values()]
        .filter((r) => merged.tombstones[r.uid] != null && merged.tombstones[r.uid] >= (r.updatedAt ?? 0))
        .map((r) => r.uid);
      if (dels.length) await table.bulkDelete(dels);
    }
    await db.tombstones.bulkPut(Object.entries(merged.tombstones).map(([key, deletedAt]) => ({ key, deletedAt })));
    if (merged.balance) {
      const cur = await db.meta.get('balance');
      if (!cur || stableStringify(cur) !== stableStringify(merged.balance)) {
        await db.meta.put({ ...merged.balance, key: 'balance' });
      }
    }
    if (merged.cash) {
      const cur = await db.meta.get('cash');
      if (!cur || stableStringify(cur) !== stableStringify({ ...merged.cash, key: 'cash' })) await db.meta.put({ ...merged.cash, key: 'cash' });
    }
    if (merged.goal) {
      const cur = await db.meta.get('goal');
      if (!cur || stableStringify(cur) !== stableStringify({ ...merged.goal, key: 'goal' })) await db.meta.put({ ...merged.goal, key: 'goal' });
    }
    for (const [id, b] of Object.entries(merged.balances ?? {})) {
      if (!b) continue;
      const key = balanceKey(id);
      const cur = await db.meta.get(key);
      if (!cur || stableStringify(cur) !== stableStringify({ ...b, key })) await db.meta.put({ ...b, key });
    }
  });
}

const deviceName = () =>
  (typeof window !== 'undefined' && window.matchMedia?.('(min-width: 900px)').matches ? 'desktop' : 'phone');

async function setStatus(changes) {
  const cfg = await db.meta.get('sync');
  if (cfg) await db.meta.put({ ...cfg, ...changes });
}

async function runSync() {
  const cfg = await db.meta.get('sync');
  if (!cfg?.token) return { status: 'off' };
  await setStatus({ syncing: true });
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const remote = await readFile(cfg.token, cfg.repo, DATA_PATH);
      const local = await readLocal();
      const merged = mergeSnapshots(local, remote?.data);
      if (!sameSnapshot(merged, local)) await writeLocal(merged);
      if (!remote || !sameSnapshot(merged, remote.data)) {
        try {
          await writeFile(cfg.token, cfg.repo, DATA_PATH, merged, remote?.sha, `moni sync from ${deviceName()}`);
        } catch (e) {
          if (e.kind === 'conflict' && attempt < 2) continue; // another device saved first: merge again
          throw e;
        }
      }
      await setStatus({ syncing: false, lastSyncAt: Date.now(), lastError: null });
      return { status: 'ok' };
    }
    throw new SyncError('conflict', 'Kept clashing with another device. Will try again shortly.');
  } catch (e) {
    const kind = e.kind ?? 'other';
    // Being offline isn't an error worth showing; everything else is.
    await setStatus({ syncing: false, lastError: kind === 'offline' ? null : { kind, message: e.message, at: Date.now() } });
    return { status: 'error', kind, message: e.message };
  }
}

let running = null;
let again = false;
export function syncNow() {
  if (running) { again = true; return running; }
  running = runSync().finally(() => {
    running = null;
    if (again) { again = false; syncNow(); }
  });
  return running;
}

let timer = null;
export function requestSync(delayMs = 1500) {
  clearTimeout(timer);
  timer = setTimeout(() => { syncNow(); }, delayMs);
}

// Connect: verify the token can see a PRIVATE repo, save it on this device, then sync.
export async function connect(token, repo) {
  const t = token.trim();
  const r = repo.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
  await checkRepo(t, r);
  await db.meta.put({ key: 'sync', token: t, repo: r, connectedAt: Date.now(), lastSyncAt: null, lastError: null });
  return syncNow();
}

export const disconnect = () => db.meta.delete('sync');
