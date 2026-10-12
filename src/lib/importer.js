// Pure import logic (no database), so it can be tested.
import { categorize } from './rules.js';
import { csvUid } from './ids.js';

const dayNumber = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};

// rows: from parseNetBankCsv. existingKeys: importKeys already saved.
// manualTxns: unmatched manual entries; a bank row with the same amount within
// 4 days replaces the manual entry (keeping its category and note), so a purchase
// you typed in by hand isn't counted twice once the bank CSV arrives.
export function prepareImport(rows, { existingKeys = new Set(), manualTxns = [], rules, now = Date.now() } = {}) {
  const seen = new Set(existingKeys);
  const usedManual = new Set();
  const toAdd = [];
  const mergedManualIds = [];
  let duplicates = 0;

  for (const r of rows) {
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
      kind: c.kind,
      categoryId: c.categoryId,
      refund: c.refund,
      bill: c.bill,
      note: '',
    };

    if (c.kind !== 'saving') {
      const m = manualTxns.find((t) => !usedManual.has(t.uid) &&
        t.amountCents === r.amountCents &&
        Math.abs(dayNumber(t.date) - dayNumber(r.date)) <= 4);
      if (m) {
        usedManual.add(m.uid);
        mergedManualIds.push(m.uid);
        txn = { ...txn, kind: m.kind, categoryId: m.categoryId, note: m.note || m.description };
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
export function nextBalance(rows, current) {
  if (!rows.length) return current ?? null;
  const newest = rows.reduce((a, b) => (b.postedDate > a.postedDate ? b : a), rows[0]);
  if (current && current.asOf > newest.postedDate) return current;
  return { key: 'balance', cents: newest.balanceCents, asOf: newest.postedDate };
}

// Bank balance plus any manual entries dated after it.
export function currentBalance(balance, txns) {
  if (!balance) return null;
  const extra = txns
    .filter((t) => t.source === 'manual' && t.date > balance.asOf && t.kind !== 'internal')
    .reduce((s, t) => s + t.amountCents, 0);
  return balance.cents + extra;
}
