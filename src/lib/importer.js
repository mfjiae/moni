// Pure import logic (no database), so it can be tested.
import { categorize } from './rules.js';
import { csvUid } from './ids.js';
import { MAIN, isMain, accountImportKey, balanceKey, transferOther } from './accounts.js';

const dayNumber = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};

// rows: from parseNetBankCsv. existingKeys: importKeys already saved.
// manualTxns: unmatched manual entries; a bank row with the same amount within
// 4 days replaces the manual entry (keeping its category and note), so a purchase
// you typed in by hand isn't counted twice once the bank CSV arrives.
// account: which account the CSV is from (M2.6). Saver rows get the account in their import key;
// manual entries are Smart Access only, so only Smart Access rows can replace them.
export function prepareImport(rows, { existingKeys = new Set(), manualTxns = [], rules, now = Date.now(), account = MAIN } = {}) {
  const seen = new Set(existingKeys);
  const usedManual = new Set();
  const toAdd = [];
  const mergedManualIds = [];
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
      const near = (t) => !usedManual.has(t.uid) && t.amountCents === r.amountCents &&
        Math.abs(dayNumber(t.date) - dayNumber(r.date)) <= 4;
      const m = c.kind === 'saving'
        ? manualTxns.find((t) => t.transfer && near(t) && transferOther(t.description) === other)
        : manualTxns.find((t) => !t.transfer && near(t));
      if (m) {
        usedManual.add(m.uid);
        mergedManualIds.push(m.uid);
        txn = m.transfer
          ? { ...txn, note: m.note }
          : { ...txn, kind: m.kind, categoryId: m.categoryId, note: m.note || m.description };
      }
    }
    toAdd.push(txn);
  }

  return {
    toAdd,
    duplicates,
    mergedManualIds,
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

// Bank balance plus any manual entries dated after it.
export function currentBalance(balance, txns) {
  if (!balance) return null;
  const extra = txns
    .filter((t) => t.source === 'manual' && t.date >= balance.asOf && t.kind !== 'internal')   // same day counts (M5 fix)
    .reduce((s, t) => s + t.amountCents, 0);
  return balance.cents + extra;
}
