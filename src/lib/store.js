// Database actions used by the screens. Every write stamps updatedAt and asks
// for a sync, so changes reach your other devices.
import { db, newUid } from './db.js';
import { parseNetBankCsv } from './csv.js';
import { DEFAULT_RULES, makeUserRule, ruleMatches, isBroadKeyword } from './rules.js';
import { prepareImport, nextBalance } from './importer.js';
import { kindForCategory, customCategoryId } from './categories.js';
import { resortPlan, usableUserRules } from './resort.js';
import { requestSync } from './sync.js';
import { MAIN, balanceKey, guessAccount, looksLike } from './accounts.js';
import { planChange, planChanges } from './budgets.js';

// User rules first (newest first, too-broad ones skipped), then the built-in ones.
export async function getRules() {
  return [...usableUserRules(await db.userRules.toArray()), ...DEFAULT_RULES];
}

// What the import picker shows before importing: row count, dates, closing balance and moni's guess.
export async function previewCsv(text) {
  const { rows, errors } = parseNetBankCsv(text);
  const existingKeys = new Set(await db.txns.orderBy('importKey').keys());
  const dates = rows.map((r) => r.postedDate).sort();
  const newest = rows.find((r) => r.postedDate === dates[dates.length - 1]);
  return {
    rows,
    errors,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
    closingCents: newest ? newest.balanceCents : null,
    looks: looksLike(rows),
    guess: guessAccount(rows, existingKeys),
  };
}

export async function importCsvText(text, account = MAIN) {
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
  const plan = prepareImport(rows, { existingKeys, manualTxns, rules, now, account });

  await db.transaction('rw', db.txns, db.meta, db.tombstones, async () => {
    if (plan.toAdd.length) await db.txns.bulkPut(plan.toAdd);
    if (plan.mergedManualIds.length) {
      await db.txns.bulkDelete(plan.mergedManualIds);
      await db.tombstones.bulkPut(plan.mergedManualIds.map((key) => ({ key, deletedAt: now })));
    }
    const bal = nextBalance(rows, await db.meta.get(balanceKey(account)), account);
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
  if (isBroadKeyword(keyword)) throw new Error(`"${keyword}" would match too many transactions. Use the merchant's name.`);
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

export async function deleteRule(uid) {
  await db.transaction('rw', db.userRules, db.tombstones, async () => {
    await db.userRules.delete(uid);
    await db.tombstones.put({ key: uid, deletedAt: Date.now() });
  });
  requestSync();
}

// ---------- Categories (renames, hide, custom; synced) ----------

export async function updateCategory(id, changes) {
  const cur = (await db.categories.get(id)) ?? { id, uid: id };
  await db.categories.put({ ...cur, ...changes, id, uid: id, updatedAt: Date.now() });
  requestSync();
}

// type: 'spend' | 'income'. Returns the new category's id.
export async function addCategory(name, type) {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean) throw new Error('Give the category a name');
  const id = customCategoryId(clean);
  await db.categories.put({ id, uid: id, name: clean, type, custom: true, hidden: false, updatedAt: Date.now() });
  requestSync();
  return id;
}

// ---------- Re-sorting with the latest rules ----------

async function applyPlan(plan) {
  if (!plan.length) return 0;
  const now = Date.now();
  await db.transaction('rw', db.txns, async () => {
    for (const c of plan) {
      await db.txns.update(c.uid, { kind: c.kind, categoryId: c.categoryId, bill: !!c.bill, updatedAt: now });
    }
  });
  requestSync();
  return plan.length;
}

// "Re-sort Review": sorts whatever in Review the current rules now know.
export async function resortReview() {
  const [txns, userRules] = await Promise.all([db.txns.where('kind').equals('review').toArray(), db.userRules.toArray()]);
  return applyPlan(resortPlan(txns, { userRules, mode: 'review' }));
}

// One-time M2.5 catch-up (see resort.js). Runs once per device after the first sync;
// a second device finds nothing left to change.
export const RULES_VERSION = 2;
export async function migrateRules() {
  const done = await db.meta.get('rulesVersion');
  if ((done?.value ?? 1) >= RULES_VERSION) return null;
  const [txns, userRules] = await Promise.all([db.txns.toArray(), db.userRules.toArray()]);
  if (!txns.length) return null; // nothing here yet (new device): try again after data arrives
  const plan = resortPlan(txns, { userRules, mode: 'migrate' });
  const n = await applyPlan(plan);
  await db.meta.put({ key: 'rulesVersion', value: RULES_VERSION, at: Date.now(), changed: n });
  return n;
}

// ---------- Budgets (M3; synced) ----------

async function applyBudgetPlan(plan) {
  if (!plan.puts.length && !plan.deletes.length) return;
  const now = Date.now();
  await db.transaction('rw', db.budgetPlans, db.tombstones, async () => {
    if (plan.deletes.length) {
      await db.budgetPlans.bulkDelete(plan.deletes);
      await db.tombstones.bulkPut(plan.deletes.map((key) => ({ key, deletedAt: now })));
    }
    if (plan.puts.length) await db.budgetPlans.bulkPut(plan.puts);
  });
  requestSync();
}

// One category's monthly amount (cents; 0 removes it), from `fromMonth` on, or from the beginning with alsoPast.
export async function setBudget(categoryId, cents, fromMonth, alsoPast = false) {
  const records = await db.budgetPlans.toArray();
  await applyBudgetPlan(planChange(records, categoryId, cents, fromMonth, alsoPast, Date.now()));
}

// The paste box: [{ categoryId, cents }, ...] all at once.
export async function setBudgets(changes, fromMonth, alsoPast = false) {
  const records = await db.budgetPlans.toArray();
  await applyBudgetPlan(planChanges(records, changes, fromMonth, alsoPast, Date.now()));
}
