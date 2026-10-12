// Local database (IndexedDB via Dexie). All data stays on the device.
import Dexie from 'dexie';

export const db = new Dexie('moni');

db.version(1).stores({
  // amountCents: integer; date: 'YYYY-MM-DD' (Sydney); importKey unique for CSV de-duplication
  transactions: '++id, date, categoryId, kind, &importKey',
  budgets: '[categoryId+month], month',
  bills: '++id, nextDue, active',
  rules: '++id, order',
  categories: 'id',
  meta: 'key',
});

// Ask the browser not to evict our data under storage pressure.
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      return await navigator.storage.persist();
    }
    return true;
  } catch {
    return false;
  }
}
