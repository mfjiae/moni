// Pure import logic (no database), so it can be tested.
import { categorize } from './rules.js';
import { csvUid } from './ids.js';
import { addDays } from './dates.js';
import { MAIN, isMain, accountImportKey, balanceKey, transferOther } from './accounts.js';
import { MATCH_DAYS, isNear, mergeFrom } from './typed.js';

const dayNumber = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};

// rows: from parseNetBankCsv. existingKeys: importKeys already saved.
// manualTxns: unmatched manual entries; a bank row with the same amount within
// MATCH_DAYS (4) days replaces the manual entry (keeping its category and note), so a purchase
// you typed in by hand isn't counted twice once the bank CSV arrives.
// UI bundle 2 (Ken, 26 Oct 2026; see typed.js): when two or more typed entries fit the same bank row, or
// only a near-miss amount fits (a typed purchase within 10% / $2), the row is added with
// `confirm: { ids, near }` and moni asks which one (or whether it's the same) instead of guessing.
// account: which account the CSV is from (M2.6). Saver rows get the account in their import key;
// manual entries are Smart Access only, so only Smart Access rows can replace them.
export function prepareImport(rows, { existingKeys = new Set(), manualTxns = [], rules, now = Date.now(), account = MAIN } = {}) {
  const seen = new Set(existingKeys);
  const usedManual = new Set();
  const toAdd = [];
  const mergedManualIds = [];
  const asked = new Map();
  // Cash purchases (cash.js) never touch the bank, so they are never offered as a match.
  const candidates = manualTxns.filter((t) => !t.cash);
  let confirms = 0;
  let duplicates = 0;

  for (const row of rows) {
    const r = { ...row, importKey: accountImportKey(account, row.importKey) };
    if (seen.has(r.importKey)) { duplicates++; continue; }
    seen.add(r.importKey);

    const c = categorize(r.description, r.amountCents, rules);
    let txn = {
      uid: csvUid(r.importKey),
      updatedAt: now,
      date: r.date,
      postedDate: r.postedDate,
      amountCents: r.amountCents,
      description: r.description,
      rawDescription: r.rawDescription,
      balanceCents: r.balanceCents,
      importKey: r.importKey,
      source: 'csv',
      account,
      kind: c.kind,
      categoryId: c.categoryId,
      refund: c.refund,
      bill: c.bill,
      note: '',
    };

    // A typed transfer (M4.1) only matches the bank's own transfer row to the same saver; other typed
    // entries only match rows that aren't own-account transfers.
    const other = transferOther(r.description);
    if (isMain(account) && (c.kind !== 'saving' || other)) {
      const free = (t) => !usedManual.has(t.uid) && Math.abs(dayNumber(t.date) - dayNumber(r.date)) <= MATCH_DAYS;
      const fits = c.kind === 'saving'
        ? (t) => t.transfer && transferOther(t.description) === other
        : (t) => !t.transfer;
      const exact = candidates.filter((t) => free(t) && fits(t) && t.amountCents === r.amountCents);
      const near = c.kind === 'saving' || exact.length ? [] : candidates.filter((t) => free(t) && fits(t) && isNear(t.amountCents, r.amountCents));
      if (exact.length === 1) {
        const m = exact[0];
        usedManual.add(m.uid);
        mergedManualIds.push(m.uid);
        txn = { ...txn, ...mergeFrom(m) };
      } else if (exact.length > 1 || near.length) {
        // Ask, but never more questions over the same typed entries than there are entries to answer with.
        const ids = (exact.length ? exact : near).map((t) => t.uid);
        const key = [...ids].sort().join(',');
        if ((asked.get(key) ?? 0) < ids.length) {
          asked.set(key, (asked.get(key) ?? 0) + 1);
          txn = { ...txn, confirm: { ids, near: !exact.length } };
          confirms++;
        }
      }
    }
    toAdd.push(txn);
  }

  return {
    toAdd,
    duplicates,
    mergedManualIds,
    confirms,
    reviewCount: toAdd.filter((t) => t.kind === 'review').length,
  };
}

// The newest row carries the bank balance. Only move forward in time.
// Each account has its own balance (M2.6): a saver CSV never touches the Smart Access one.
// Rows are newest first, so the first row of the newest day is the closing balance.
export function nextBalance(rows, current, account = MAIN) {
  if (!rows.length) return current ?? null;
  const newestDate = rows.reduce((a, b) => (b.postedDate > a ? b.postedDate : a), rows[0].postedDate);
  const newest = rows.find((r) => r.postedDate === newestDate);
  if (current && current.asOf > newest.postedDate) return current;
  return { key: balanceKey(account), cents: newest.balanceCents, asOf: newest.postedDate };
}

// Bank balance plus typed entries still pending (the CSV is not yet MATCH_DAYS past them; see typed.js).
// Only a fallback: App's estimateBalances (accounts.js) is the full version.
export function currentBalance(balance, txns) {
  if (!balance) return null;
  const from = addDays(balance.asOf, -MATCH_DAYS);
  const extra = txns
    .filter((t) => t.source === 'manual' && !t.cash && (t.postedDate ?? t.date) >= from && t.kind !== 'internal')
    .reduce((s, t) => s + t.amountCents, 0);
  return balance.cents + extra;
}
