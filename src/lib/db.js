// Local database (IndexedDB via Dexie). This device's copy of the data;
// when sync is on, it is merged with moni.json in the private moni-data repo.
import Dexie from 'dexie';
import { newUid, csvUid } from './ids.js';

export { newUid, csvUid };
export const db = new Dexie('moni');

// v1 (M1–M2): numeric auto ids, which differ per device.
db.version(1).stores({
  transactions: '++id, date, categoryId, kind, &importKey',
  budgets: '[categoryId+month], month',
  bills: '++id, nextDue, active',
  rules: '++id, order',
  categories: 'id',
  meta: 'key',
});

// v2: stable string ids (uid) + updatedAt on every record, so devices can merge.
db.version(2).stores({
  txns: 'uid, date, kind, importKey',
  userRules: 'uid, order',
  tombstones: 'key',
}).upgrade(async (tx) => {
  const now = Date.now();
  const old = await tx.table('transactions').toArray();
  await tx.table('txns').bulkPut(old.map(({ id: _id, ...t }) => ({
    ...t,
    uid: t.importKey ? csvUid(t.importKey) : newUid(),
    updatedAt: now,
  })));
  const rules = await tx.table('rules').toArray();
  await tx.table('userRules').bulkPut(rules.map(({ id: _id, ...r }) => ({ ...r, uid: newUid(), updatedAt: now })));
});

// v3: drop the old tables.
db.version(3).stores({ transactions: null, rules: null });

// Ask the browser not to evict our data under storage pressure.
// Some browsers (Firefox, Zen) show a prompt, so only ask once per device.
export async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist || (await navigator.storage.persisted())) return true;
    if (await db.meta.get('persistAsked')) return false;
    await db.meta.put({ key: 'persistAsked', at: Date.now() });
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
