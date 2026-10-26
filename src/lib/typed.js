// Typed entries vs the bank (Ken, 26 Oct 2026; UI bundle 2). Pure logic, tested in __tests__/typed.test.js.
//
// A typed entry = a transaction you added by hand (`source: 'manual'`; typed transfers are Smart Access rows).
// When a Smart Access CSV is imported (importer.js):
// - a bank row with the SAME amount within MATCH_DAYS of exactly one typed entry replaces it (as since M2);
// - same amount but two or more typed entries fit (two identical coffees): moni asks which one;
// - no same amount, but a typed purchase within about 10% (or $2) fits: moni asks "is this the same?";
// The question is stored on the bank row as `confirm: { ids: [typed uids], near: bool }` (synced with the
// row). While it is open, the bank row is left out of the totals and its amount is taken back out of the
// balance, so nothing is counted twice; the typed entries keep counting until you answer.
//
// Status (worked out from dates, never stored):
// - 'pending': the bank CSV is not yet MATCH_DAYS past it (it may still be pending at the bank). Counts in the balance.
// - 'manual': the CSV is more than MATCH_DAYS past it and nothing matched (cash, or a typo). It still counts in
//   Spending and shows as "manual" in Activity, but no longer changes the balance: the bank's number wins
//   (Ken, 26 Oct 2026: "if it's not in the bank account don't count").
import { addDays } from './dates.js';

export const MATCH_DAYS = 4;
export const isTyped = (t) => t.source === 'manual';

export function typedStatus(t, asOf) {
  if (!isTyped(t)) return null;
  if (!asOf) return 'pending';
  return (t.postedDate ?? t.date) >= addDays(asOf, -MATCH_DAYS) ? 'pending' : 'manual';
}

// A near-miss: same direction, different amount, within 10% of the typed amount or $2, whichever is bigger.
export function isNear(typedCents, bankCents) {
  if (typedCents === bankCents || Math.sign(typedCents) !== Math.sign(bankCents)) return false;
  return Math.abs(typedCents - bankCents) <= Math.max(200, Math.round(Math.abs(typedCents) * 0.1));
}

// What the bank row takes over from the typed entry it replaces (category and note; a transfer keeps the bank's).
export const mergeFrom = (m) => (m.transfer ? { note: m.note ?? '' } : { kind: m.kind, categoryId: m.categoryId, note: m.note || m.description });

// The question still open on a bank row: its candidates that still exist, or null (answered, or they were deleted).
export function openConfirm(row, typedByUid) {
  const ids = row.confirm?.ids?.filter((id) => typedByUid.has(id)) ?? [];
  return ids.length ? { near: !!row.confirm.near, ids, candidates: ids.map((id) => typedByUid.get(id)) } : null;
}

export const typedMap = (txns) => new Map(txns.filter(isTyped).map((t) => [t.uid, t]));

// Every open question, oldest bank row first: [{ row, near, ids, candidates }].
export function openConfirms(txns) {
  const byUid = typedMap(txns);
  return txns
    .filter((t) => t.source === 'csv' && t.confirm)
    .map((row) => ({ row, ...openConfirm(row, byUid) }))
    .filter((c) => c.ids)
    .sort((a, b) => a.row.date.localeCompare(b.row.date));
}

// Lists show "typed" on pending entries and "manual" on settled ones: adds `typed: 'pending' | 'manual'`.
export const markTyped = (txns, asOf) => txns.map((t) => (isTyped(t) ? { ...t, typed: typedStatus(t, asOf) } : t));

// Your answer to a question. typedUid = the typed entry the bank row replaces, or null for "Neither"
// (both stay). Returns { updates: [{ uid, changes }], deletes: [uid] } (the caller stamps updatedAt).
// Other open questions that offered the same typed entry drop it; if an exact one is left with a single
// candidate, that is no longer a question, so it merges too.
export function planResolve(txns, bankUid, typedUid) {
  const byUid = typedMap(txns);
  const rows = new Map(txns.filter((t) => t.confirm).map((t) => [t.uid, { ...t }]));
  const updates = new Map();
  const deletes = [];
  const set = (uid, changes) => updates.set(uid, { ...(updates.get(uid) ?? {}), ...changes });
  if (!typedUid) {
    set(bankUid, { confirm: null });
    return { updates: [...updates].map(([uid, changes]) => ({ uid, changes })), deletes };
  }
  const queue = [[bankUid, typedUid]];
  while (queue.length) {
    const [rowUid, mUid] = queue.shift();
    const m = byUid.get(mUid);
    if (!m) { set(rowUid, { confirm: null }); continue; }
    byUid.delete(mUid);
    deletes.push(mUid);
    set(rowUid, { ...mergeFrom(m), confirm: null });
    rows.delete(rowUid);
    for (const r of rows.values()) {
      if (!r.confirm?.ids?.includes(mUid)) continue;
      const ids = r.confirm.ids.filter((id) => byUid.has(id));
      if (!ids.length) { set(r.uid, { confirm: null }); rows.delete(r.uid); }
      else if (!r.confirm.near && ids.length === 1) { rows.delete(r.uid); queue.push([r.uid, ids[0]]); }
      else { r.confirm = { ...r.confirm, ids }; set(r.uid, { confirm: r.confirm }); }
    }
  }
  return { updates: [...updates].map(([uid, changes]) => ({ uid, changes })), deletes };
}
