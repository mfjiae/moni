// Database actions used by the screens.
import { db } from './db.js';
import { parseNetBankCsv } from './csv.js';
import { DEFAULT_RULES, makeUserRule, ruleMatches } from './rules.js';
import { prepareImport, nextBalance } from './importer.js';
import { kindForCategory } from './categories.js';

// User rules first (newest first), then the built-in ones.
export async function getRules() {
  const user = await db.rules.orderBy('order').reverse().toArray();
  return [...user, ...DEFAULT_RULES];
}

export async function importCsvText(text) {
  const { rows, errors } = parseNetBankCsv(text);
  if (!rows.length) return { rows: 0, added: 0, duplicates: 0, merged: 0, review: 0, errors };

  const rules = await getRules();
  const existingKeys = new Set(await db.transactions.orderBy('importKey').keys());
  const manualTxns = await db.transactions.filter((t) => t.source === 'manual').toArray();
  const plan = prepareImport(rows, { existingKeys, manualTxns, rules });

  await db.transaction('rw', db.transactions, db.meta, async () => {
    if (plan.toAdd.length) await db.transactions.bulkAdd(plan.toAdd);
    if (plan.mergedManualIds.length) await db.transactions.bulkDelete(plan.mergedManualIds);
    const bal = nextBalance(rows, await db.meta.get('balance'));
    if (bal) await db.meta.put(bal);
  });

  return {
    rows: rows.length,
    added: plan.toAdd.length,
    duplicates: plan.duplicates,
    merged: plan.mergedManualIds.length,
    review: plan.reviewCount,
    errors,
  };
}

export function addManual({ date, time, amountCents, description, categoryId, note }) {
  return db.transactions.add({
    date, postedDate: date, time, amountCents,
    description, rawDescription: description,
    source: 'manual',
    kind: kindForCategory(categoryId),
    categoryId,
    refund: false,
    note: note ?? '',
  });
}

export function setCategory(id, categoryId, note) {
  const changes = { categoryId, kind: kindForCategory(categoryId) };
  if (note !== undefined) changes.note = note;
  return db.transactions.update(id, changes);
}

// Save "always put KEYWORD in CATEGORY" and apply it to matching items still in Review.
// Returns how many other transactions it sorted.
export async function saveRule(keyword, categoryId, exceptId) {
  const kind = kindForCategory(categoryId);
  const rule = makeUserRule(keyword, categoryId, kind);
  await db.rules.add({ ...rule, order: Date.now() });
  const matches = await db.transactions
    .filter((t) => t.kind === 'review' && t.id !== exceptId && ruleMatches(rule, t.description, t.amountCents))
    .toArray();
  await Promise.all(matches.map((t) => db.transactions.update(t.id, { kind, categoryId })));
  return matches.length;
}

export const deleteTxn = (id) => db.transactions.delete(id);

export async function clearAll() {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}
