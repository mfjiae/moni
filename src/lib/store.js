// Database actions used by the screens. Every write stamps updatedAt and asks
// for a sync, so changes reach your other devices.
import { db, newUid } from './db.js';
import { parseNetBankCsv } from './csv.js';
import { DEFAULT_RULES, makeUserRule, ruleMatches, isBroadKeyword } from './rules.js';
import { prepareImport, nextBalance } from './importer.js';
import { kindForCategory, customCategoryId } from './categories.js';
import { resortPlan, usableUserRules } from './resort.js';
import { requestSync } from './sync.js';
import { MAIN, balanceKey, guessAccount, looksLike, transferRow } from './accounts.js';
import { planChange, planChanges } from './budgets.js';
import { cleanTicker, etfUid, planRenameEtf, planRemoveEtf } from './investing.js';
import { manualUid, skipUid, billFromSuggestion } from './bills.js';
import { planResolve } from './typed.js';
import { atmRule } from './cash.js';
import { cleanName, nameUid } from './names.js';

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
    confirms: plan.confirms,
    review: plan.reviewCount,
    errors,
  };
}

// Your answer to "which typed entry is this bank row?" (UI bundle 2, typed.js). typedUid = the typed entry it
// replaces, or null for "Neither" (both stay and both count).
export async function resolveMatch(bankUid, typedUid) {
  const now = Date.now();
  await db.transaction('rw', db.txns, db.tombstones, async () => {
    const all = await db.txns.toArray();
    const { updates, deletes } = planResolve(all, bankUid, typedUid);
    for (const u of updates) await db.txns.update(u.uid, { ...u.changes, updatedAt: now });
    if (deletes.length) {
      await db.txns.bulkDelete(deletes);
      await db.tombstones.bulkPut(deletes.map((key) => ({ key, deletedAt: now })));
    }
  });
  requestSync();
}

// cash: true = Paid with cash (cash.js): counts in Spending, never in the Smart Access balance or the importer.
export async function addManual({ date, time, amountCents, description, categoryId, note, cash = false }) {
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
    ...(cash && amountCents < 0 ? { cash: true } : {}),
  });
  requestSync();
}

// A transfer between Smart Access and a saver, typed in (M4.1). Stored once, as the Smart Access row the
// bank would show; see transferRow in accounts.js. Throws on a bad pick.
export async function addTransfer({ date, time, from, to, cents, note }) {
  const row = transferRow({ from, to, cents });
  const now = Date.now();
  await db.txns.add({
    uid: newUid(), updatedAt: now, createdAt: now,
    date, postedDate: date, time, amountCents: row.amountCents,
    description: row.description, rawDescription: row.description,
    source: 'manual', transfer: true,
    kind: 'saving', categoryId: 'saving',
    refund: false,
    note: note ?? '',
  });
  requestSync();
}

// extra: other fields to save in the same write, e.g. { cash: true } from the transaction sheet.
export async function setCategory(uid, categoryId, note, extra = {}) {
  const changes = { ...extra, categoryId, kind: kindForCategory(categoryId), updatedAt: Date.now() };
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
      await db.txns.update(c.uid, { kind: c.kind, categoryId: c.categoryId, bill: !!c.bill, ...(c.atm ? { atm: true } : {}), updatedAt: now });
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

// ---------- Investments (M4; synced) ----------

// Add a ticker to your ETF list. Returns the cleaned ticker.
export async function addEtf(text) {
  const ticker = cleanTicker(text);
  await db.etfs.put({ uid: etfUid(ticker), ticker, updatedAt: Date.now() });
  requestSync();
  return ticker;
}

// Tag an investing transaction: split = [{ ticker, cents }] adding up to its size, or [] for Not tagged.
export async function setEtfSplit(uid, split) {
  await db.txns.update(uid, { etfSplit: split, updatedAt: Date.now() });
  requestSync();
}

// Rename an ETF (or merge it into one that exists). Every buy's tag and the synced list follow.
// Returns { to, merge, buys }.
export async function renameEtf(from, toText) {
  const plan = planRenameEtf(await db.etfs.toArray(), await db.txns.toArray(), from, toText);
  if (!plan.put) return plan;
  const now = Date.now();
  await db.transaction('rw', db.txns, db.etfs, db.tombstones, async () => {
    for (const u of plan.updates) await db.txns.update(u.uid, { etfSplit: u.etfSplit, updatedAt: now });
    await db.etfs.put({ ...plan.put, updatedAt: now });
    await db.etfs.bulkDelete(plan.del);
    await db.tombstones.bulkPut(plan.del.map((key) => ({ key, deletedAt: now })));
  });
  requestSync();
  return plan;
}

// Remove an ETF from the list. Its buys become Not tagged. Returns { buys }.
export async function removeEtf(ticker) {
  const plan = planRemoveEtf(await db.txns.toArray(), ticker);
  const now = Date.now();
  await db.transaction('rw', db.txns, db.etfs, db.tombstones, async () => {
    for (const u of plan.updates) await db.txns.update(u.uid, { etfSplit: u.etfSplit, updatedAt: now });
    await db.etfs.bulkDelete(plan.del);
    await db.tombstones.bulkPut(plan.del.map((key) => ({ key, deletedAt: now })));
  });
  requestSync();
  return plan;
}

// ---------- Bills (M5; synced) ----------

// Add or change a bill. rec = { uid?, name, cents, every, anchor, categoryId, key?, since? }.
export async function saveBill(rec) {
  const now = Date.now();
  const uid = rec.uid ?? manualUid(newUid());
  await db.bills.put({ since: rec.anchor, ...rec, uid, updatedAt: now });
  requestSync();
  return uid;
}

export async function deleteBill(uid) {
  await db.transaction('rw', db.bills, db.tombstones, async () => {
    await db.bills.delete(uid);
    await db.tombstones.put({ key: uid, deletedAt: Date.now() });
  });
  requestSync();
}

// "Looks like a bill" -> Add (with the rhythm picked in the sheet).
export async function confirmBill(suggestion, every) {
  await db.bills.put(billFromSuggestion(suggestion, every));
  requestSync();
}

// "Not a bill": remembered (synced) so moni never suggests it again.
export async function dismissBill(key) {
  await db.bills.put({ uid: skipUid(key), key, dismissed: true, updatedAt: Date.now() });
  requestSync();
}

// ---------- Paid with cash, Push 2 ----------

// "Set cash balance": the cash you have right now, as of today (Home > Cash). Synced (snapshot field `cash`).
export async function setCashBalance(cents, asOf) {
  if (!Number.isInteger(cents) || cents < 0) throw new Error('Enter an amount, like 50.00');
  const now = Date.now();
  await db.meta.put({ key: 'cash', cents, asOf, setAt: now, updatedAt: now });
  requestSync();
}

// Savings goal (batch 3): one goal. The progress starts counting on the day it is set (`startDate`).
// Removing it saves a { removed: true } marker so the removal syncs; the newest save wins.
export async function setGoal({ name, targetCents, byDate, startDate }) {
  if (!Number.isInteger(targetCents) || targetCents <= 0) throw new Error('Enter a target, like 5000.00');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(byDate ?? '')) throw new Error('Pick a date');
  const start = startDate;
  if (byDate <= start) throw new Error('Pick a date after today');
  await db.meta.put({ key: 'goal', name: (name ?? '').trim() || 'Savings goal', targetCents, byDate, startDate: start, updatedAt: Date.now() });
  requestSync();
}

export async function clearGoal() {
  await db.meta.put({ key: 'goal', removed: true, updatedAt: Date.now() });
  requestSync();
}

// Your answer to "Was this a cash withdrawal?". yes: file it as Transfers & payments and count it as cash
// withdrawn (`atm: true`); no: leave it in To sort and never ask again (`atm: false`).
// remember + keyword: also save a learned rule, so similar rows are filed (yes) or never asked about (no).
// Returns how many other rows a remembered "yes" filed.
export async function answerAtm(uid, yes, { remember = false, keyword = '' } = {}) {
  const now = Date.now();
  await db.txns.update(uid, yes ? { atm: true, kind: 'internal', categoryId: 'internal', updatedAt: now } : { atm: false, updatedAt: now });
  let n = 0;
  if (remember && keyword.trim()) {
    if (isBroadKeyword(keyword)) throw new Error(`"${keyword}" would match too many transactions.`);
    const rule = atmRule(keyword, yes);
    await db.userRules.add({ ...rule, uid: newUid(), order: now, updatedAt: now });
    if (yes) {
      const matches = await db.txns
        .filter((t) => t.uid !== uid && t.source === 'csv' && t.kind === 'review' && t.atm == null && ruleMatches(rule, t.description, t.amountCents))
        .toArray();
      await Promise.all(matches.map((t) => db.txns.update(t.uid, { atm: true, kind: 'internal', categoryId: 'internal', updatedAt: now })));
      n = matches.length;
    }
  }
  requestSync();
  return n;
}

// ---------- Quick sort (Ken, 27 Oct 2026, batch 3) ----------

// Runs one sorting action and remembers what it changed (the To sort rows it touched and any learned rule it
// added), so "Undo" can put everything back exactly. Reuses setCategory / saveRule / answerAtm, so syncing and
// rules behave the same as in the row sheet.
async function withUndo(action) {
  const rowsBefore = await db.txns.filter((t) => t.kind === 'review').toArray();
  const rulesBefore = new Set((await db.userRules.toArray()).map((r) => r.uid));
  const result = await action();
  const rules = (await db.userRules.toArray()).filter((r) => !rulesBefore.has(r.uid)).map((r) => r.uid);
  return { result, undo: { rows: rowsBefore, rules } };
}

// Quick sort: put one row in a category. remember + keyword also saves "always use this category for KEYWORD"
// and sorts the other To sort rows it matches. Returns { n: other rows sorted, undo }.
export async function quickSortCategory(uid, categoryId, { remember = false, keyword = '' } = {}) {
  const { result, undo } = await withUndo(async () => {
    await setCategory(uid, categoryId);
    return remember && keyword.trim() ? saveRule(keyword, categoryId, uid) : 0;
  });
  return { n: result, undo };
}

// Quick sort: the "Cash withdrawal?" question (same as the row sheet's Yes / No).
export async function quickSortAtm(uid, yes, opts = {}) {
  const { result, undo } = await withUndo(() => answerAtm(uid, yes, opts));
  return { n: result, undo };
}

// Undo the last quick sort: rows it changed go back to To sort, its learned rule is deleted.
export async function undoQuickSort(undo) {
  const now = Date.now();
  for (const before of undo.rows) {
    const cur = await db.txns.get(before.uid);
    if (cur && cur.updatedAt !== before.updatedAt) await db.txns.put({ ...before, updatedAt: now });
  }
  for (const uid of undo.rules) await deleteRule(uid);
  requestSync();
}

// ---------- Clean names / nicknames (27 Oct 2026; display only, the bank text never changes) ----------

// "Rename similar rows": every row whose bank text contains `key` shows `name`. The row's own nickname, if it had one,
// is cleared so the shared name shows.
export async function renameSimilar(rowUid, key, text) {
  const name = cleanName(text);
  const k = String(key ?? '').toUpperCase().trim();
  if (!k || isBroadKeyword(k)) throw new Error('That bank text is too general to rename similar rows.');
  const now = Date.now();
  await db.transaction('rw', db.names, db.txns, async () => {
    await db.names.put({ uid: nameUid(k), key: k, name, updatedAt: now });
    const row = rowUid ? await db.txns.get(rowUid) : null;
    if (row && typeof row.nickname === 'string') await db.txns.update(rowUid, { nickname: undefined, updatedAt: now });
  });
  requestSync();
  return name;
}

// This row only. text '' = show the bank name on this row even when a similar-rows name matches.
export async function renameRow(uid, text) {
  const name = text === '' ? '' : cleanName(text);
  await db.txns.update(uid, { nickname: name, updatedAt: Date.now() });
  requestSync();
}

// Back to the bank name: removes the row's own nickname and, when `nameRecordUid` is given, the similar-rows name too.
export async function clearName(rowUid, nameRecordUid = null) {
  const now = Date.now();
  await db.transaction('rw', db.names, db.txns, db.tombstones, async () => {
    if (nameRecordUid) {
      await db.names.delete(nameRecordUid);
      await db.tombstones.put({ key: nameRecordUid, deletedAt: now });
    }
    const row = rowUid ? await db.txns.get(rowUid) : null;
    if (row && typeof row.nickname === 'string') await db.txns.update(rowUid, { nickname: undefined, updatedAt: now });
  });
  requestSync();
}

// Settings → Names: delete a similar-rows name (the bank name comes back on every row it covered).
export async function deleteName(uid) {
  await db.transaction('rw', db.names, db.tombstones, async () => {
    await db.names.delete(uid);
    await db.tombstones.put({ key: uid, deletedAt: Date.now() });
  });
  requestSync();
}
