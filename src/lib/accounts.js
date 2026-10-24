// Accounts (M2.6, Ken 24 Oct 2026). Pure logic, tested.
//
// Every transaction belongs to one account: `t.account`. Rows imported before M2.6 have no `account`
// field and are Smart Access (the main account), so old data never needs rewriting.
//
// The same transfer shows up twice once both CSVs are in: Smart Access "Transfer to xx2066 -$50" and
// Saver xx2066 "Transfer from xx6193 +$50". Rules (Ken, 24 Oct 2026):
// - Each transfer counts ONCE, from the Smart Access side (as before M2.6). The saver-side copy is
//   "matched" and only shows on that saver's account page.
// - A saver-side transfer with no Smart Access twin (that CSV isn't imported yet) counts from the saver
//   side, turned round so it reads like the Smart Access row would. It stops counting as soon as the
//   twin arrives, because matching is worked out fresh from the data every time (nothing is stored).
// - Savings "Credit Interest" is Interest income (an ordinary rule), counted once.
// Matching: same saver, opposite amount, posted within 2 days; the closest date wins, one to one.

export const MAIN = 'xx6193';

export const ACCOUNTS = [
  { id: 'xx6193', name: 'Smart Access', long: 'Smart Access xx6193', type: 'main', hint: 'Everyday account' },
  { id: 'xx2066', name: 'Saver xx2066', long: 'NetBank Saver xx2066', type: 'saver', hint: 'Main savings' },
  { id: 'xx2103', name: 'Saver xx2103', long: 'NetBank Saver xx2103', type: 'saver', hint: '2nd savings' },
];
export const SAVERS = ACCOUNTS.filter((a) => a.type === 'saver');
export const getAccount = (id) => ACCOUNTS.find((a) => a.id === id) ?? ACCOUNTS[0];
export const accountOf = (t) => t.account ?? MAIN;
export const isMain = (id) => (id ?? MAIN) === MAIN;

// Where each account's bank balance lives in `meta`. Smart Access keeps the old key.
export const balanceKey = (id) => (isMain(id) ? 'balance' : `balance:${id}`);

// Saver rows get the account in their import key, so they can never clash with Smart Access rows.
export const accountImportKey = (id, key) => (isMain(id) ? key : `${id}|${key}`);

const TRANSFER = /^TRANSFER (TO|FROM) XX(\d{4})\b/i;
const SAVER_ROW = /^(TRANSFER (TO|FROM) XX\d{4}|CREDIT INTEREST)\b/i;

// The other account named in an own-account transfer ("Transfer to xx2066 ..." -> 'xx2066'), or null.
export function transferOther(description) {
  const m = TRANSFER.exec(description ?? '');
  if (!m) return null;
  const id = `xx${m[2]}`;
  return ACCOUNTS.some((a) => a.id === id) ? id : null;
}

// What a CSV looks like: 'saver' when every row is an own-account transfer or interest, else 'main'.
export function looksLike(rows) {
  return rows.length > 0 && rows.every((r) => SAVER_ROW.test(r.description)) ? 'saver' : 'main';
}

// moni's guess for the import picker. The content can't tell xx2066 from xx2103, so pick the saver
// that already has some of these rows, else the main savings account.
export function guessAccount(rows, existingKeys = new Set()) {
  if (looksLike(rows) === 'main') return MAIN;
  for (const a of SAVERS) {
    if (rows.some((r) => existingKeys.has(accountImportKey(a.id, r.importKey)))) return a.id;
  }
  return 'xx2066';
}

// Warning for the picker when the picked account doesn't fit the file (null = fine).
export function pickWarning(rows, picked) {
  const kind = looksLike(rows);
  if (isMain(picked) && kind === 'saver') {
    return 'This file only has transfers to xx6193 and interest, so it looks like a savings CSV. Importing it as Smart Access would replace your Smart Access balance.';
  }
  if (!isMain(picked) && kind === 'main') {
    return 'This file has card purchases and payments, so it looks like your Smart Access CSV, not a savings one.';
  }
  return null;
}

const dayNumber = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};
const posted = (t) => t.postedDate ?? t.date;

// Saver-side transfers matched to their Smart Access twin: Map(saverUid -> mainUid).
export function pairTransfers(txns, maxDays = 2) {
  const pool = new Map(); // `${saver}|${saverAmount}` -> Smart Access rows, oldest first
  const saverSide = [];
  for (const t of txns) {
    const acct = accountOf(t);
    const other = transferOther(t.description);
    if (!other) continue;
    if (isMain(acct) && !isMain(other)) {
      const key = `${other}|${-t.amountCents}`;
      if (!pool.has(key)) pool.set(key, []);
      pool.get(key).push(t);
    } else if (!isMain(acct) && isMain(other)) {
      saverSide.push(t);
    }
  }
  for (const list of pool.values()) list.sort((a, b) => posted(a).localeCompare(posted(b)));
  saverSide.sort((a, b) => posted(a).localeCompare(posted(b)) || a.uid.localeCompare(b.uid));

  const used = new Set();
  const pairs = new Map();
  for (const s of saverSide) {
    const list = pool.get(`${accountOf(s)}|${s.amountCents}`);
    if (!list) continue;
    const day = dayNumber(posted(s));
    let best = null;
    let bestGap = Infinity;
    for (const m of list) {
      if (used.has(m.uid)) continue;
      const gap = Math.abs(dayNumber(posted(m)) - day);
      if (gap <= maxDays && gap < bestGap) { best = m; bestGap = gap; }
    }
    if (best) { used.add(best.uid); pairs.set(s.uid, best.uid); }
  }
  return pairs;
}

// The transactions every total in moni counts (Home, Spending, Income, Saved, Cash flow, Activity):
// all Smart Access rows, plus saver rows that only exist in a saver CSV (interest, unmatched transfers).
// Unmatched transfers are turned round to read like the Smart Access row (`mirrored: true`).
export function countedView(txns) {
  const pairs = pairTransfers(txns);
  const out = [];
  for (const t of txns) {
    const acct = accountOf(t);
    if (isMain(acct)) { out.push(t); continue; }
    if (pairs.has(t.uid)) continue;
    const other = transferOther(t.description);
    if (other && isMain(other)) {
      out.push({
        ...t,
        amountCents: -t.amountCents,
        description: `${t.amountCents < 0 ? 'Transfer from' : 'Transfer to'} ${acct} (from the saver CSV)`,
        kind: 'saving',
        categoryId: 'saving',
        mirrored: true,
      });
    } else {
      out.push(t);
    }
  }
  return out;
}

// One account's own rows, as its bank statement shows them.
export const accountTxns = (txns, id) => txns.filter((t) => accountOf(t) === id);

// Accounts that have any rows (Smart Access always listed).
export function accountsWithData(txns) {
  const seen = new Set(txns.map(accountOf));
  return ACCOUNTS.filter((a) => isMain(a.id) || seen.has(a.id));
}
