// Database actions used by the screens. Every write stamps updatedAt and asks
// for a sync, so changes reach your other devices.
import { db, newUid } from './db.js';
import { parseNetBankCsv } from './csv.js';
import { DEFAULT_RULES, makeUserRule, ruleMatches } from './rules.js';
import { prepareImport, nextBalance } from './importer.js';
import { kindForCategory } from './categories.js';
import { requestSync } from './sync.js';

// User rules first (newest first), then the built-in ones.
export async function getRules() {
  const user = await db.userRules.orderBy('order').reverse().toArray();
  return [...user, ...DEFAULT_RULES];
}

export async function importCsvText(text) {
  const { rows, errors } = parseNetBankCsv(text);
  if (!rows.length) return { rows: 0, added: 0, duplicates: 0, merged: 0, review: 0, errors };

  const now = Date.now();
  const rules = await getRules();
  const existingKeys = new Set(await db.txns.orderBy('importKey').keys());
  // Bank rows you deleted on purpose stay deleted on re-import.
  for (const t of await db.tombstones.toArray()) {
    if (t.key.startsWith('csv|')) existingKeys.add(t.key.slice(4));
  }
  const manualTxns = await db.txns.filter((t) => t.source === 'manual').toArray();
  const plan = prepareImport(rows, { existingKeys, manualTxns, rules, now });

  await db.transaction('rw', db.txns, db.meta, db.tombstones, async () => {
    if (plan.toAdd.length) await db.txns.bulkPut(plan.toAdd);
    if (plan.mergedManualIds.length) {
      await db.txns.bulkDelete(plan.mergedManualIds);
      await db.tombstones.bulkPut(plan.mergedManualIds.map((key) => ({ key, deletedAt: now })));
    }
    const bal = nextBalance(rows, await db.meta.get('balance'));
    if (bal) await db.meta.put({ ...bal, updatedAt: now });
  });
  requestSync();

  return {
    rows: rows.length,
    added: plan.toAdd.length,
    duplicates: plan.duplicates,
    merged: plan.mergedManualIds.length,
    review: plan.reviewCount,
    errors,
  };
}

export async function addManual({ date, time, amountCents, description, categoryId, note }) {
  const now = Date.now();
  await db.txns.add({
    uid: newUid(), updatedAt: now, createdAt: now,
    date, postedDate: date, time, amountCents,
    description, rawDescription: description,
    source: 'manual',
    kind: kindForCategory(categoryId),
    categoryId,
    refund: false,
    note: note ?? '',
  });
  requestSync();
}

export async function setCategory(uid, categoryId, note) {
  const changes = { categoryId, kind: kindForCategory(categoryId), updatedAt: Date.now() };
  if (note !== undefined) changes.note = note;
  await db.txns.update(uid, changes);
  requestSync();
}

// Save "always put KEYWORD in CATEGORY" and apply it to matching items still in Review.
// Returns how many other transactions it sorted.
export async function saveRule(keyword, categoryId, exceptUid) {
  const now = Date.now();
  const kind = kindForCategory(categoryId);
  const rule = makeUserRule(keyword, categoryId, kind);
  await db.userRules.add({ ...rule, uid: newUid(), order: now, updatedAt: now });
  const matches = await db.txns
    .filter((t) => t.kind === 'review' && t.uid !== exceptUid && ruleMatches(rule, t.description, t.amountCents))
    .toArray();
  await Promise.all(matches.map((t) => db.txns.update(t.uid, { kind, categoryId, updatedAt: now })));
  requestSync();
  return matches.length;
}

export async function deleteTxn(uid) {
  await db.transaction('rw', db.txns, db.tombstones, async () => {
    await db.txns.delete(uid);
    await db.tombstones.put({ key: uid, deletedAt: Date.now() });
  });
  requestSync();
}

// Removes everything from THIS device (and disconnects sync). Synced data stays in moni-data.
export async function clearDevice() {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}
