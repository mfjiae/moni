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

import { addDays } from './dates.js';
import { MATCH_DAYS, typedMap, openConfirm } from './typed.js';

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
// A Smart Access bank row waiting for "which typed entry is this?" (typed.js) is left out until you answer,
// so the typed entries it may replace are not counted twice.
export function countedView(txns) {
  const pairs = pairTransfers(txns);
  const typed = typedMap(txns);
  const out = [];
  for (const t of txns) {
    const acct = accountOf(t);
    if (isMain(acct)) { if (!(t.confirm && openConfirm(t, typed))) out.push(t); continue; }
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

// ---- Typed transfers and balance estimates (M4.1, Ken 25 Oct 2026, A-A) ----
// A transfer you type in is stored ONCE, as the Smart Access row the bank would show
// ("Transfer to xx2066" -$200, or "Transfer from xx2066" +$200), so it counts once like a CSV row.
// When the Smart Access CSV arrives, the bank row replaces it (importer.js). When the saver CSV arrives,
// the saver row is matched to it (pairTransfers), exactly as for a CSV row.

// The Smart Access-side row for a transfer between Smart Access and a saver. Throws when it isn't one.
export function transferRow({ from, to, cents }) {
  if (!Number.isInteger(cents) || cents <= 0) throw new Error('Enter an amount, like 50.00');
  if (from === to) throw new Error('Pick two different accounts');
  if (!isMain(from) && !isMain(to)) throw new Error('One side must be Smart Access');
  const saver = isMain(from) ? to : from;
  if (!SAVERS.some((a) => a.id === saver)) throw new Error('Pick a savings account');
  return isMain(from)
    ? { amountCents: -cents, description: `Transfer to ${saver}`, saver }
    : { amountCents: cents, description: `Transfer from ${saver}`, saver };
}

// Balances moni shows: each account's bank balance (from its newest CSV) plus what has happened since
// that moni already knows about. allTxns = every stored row; balance = Smart Access meta; savers =
// { id: meta | null }. Returns { main, savers: { id: ... } }, each null (no bank balance yet) or
// { cents, bank, asOf, extra, typed, other, items, settled, confirms }:
//   typed = typed-in entries counted, other = transfers seen only in the other account's CSV so far,
//   items = those entries [{ uid, description, date, cents, from: 'typed' | 'other' }] for the breakdown,
//   settled = { count, cents } typed entries the bank never matched in the 30 days before its balance
//             (no longer counted, see typed.js), confirms = open "which typed entry is this?" questions.
// - Smart Access: + typed-in entries still pending (the CSV is not yet MATCH_DAYS past them; not 'internal'),
//   + saver-side transfers to/from Smart Access with no Smart Access twin yet, dated after its balance,
//   - each bank row whose question is still open (its typed entries stand in for it until you answer).
// - A saver: + Smart Access-side transfers to/from that saver (typed or from the CSV) with no saver twin
//   yet, dated after its balance.
export function estimateBalances(allTxns, balance, savers = {}) {
  const pairs = pairTransfers(allTxns);
  const pairedMain = new Set(pairs.values());
  const typed = typedMap(allTxns);
  // A typed entry dated ON the bank balance's day counts too (Ken, 25 Oct 2026): a CSV has a date, not a
  // time, so a pending purchase typed after importing that day's CSV isn't in the bank number yet. When the
  // bank row arrives, the import replaces the typed one, so it is never counted twice.
  const after = (t, b) => (t.source === 'manual' ? posted(t) >= b.asOf : posted(t) > b.asOf);
  const est = (b) => (b ? { cents: b.cents, bank: b.cents, asOf: b.asOf, extra: 0, typed: 0, other: 0, items: [], settled: { count: 0, cents: 0 }, confirms: [] } : null);
  const main = est(balance);
  const out = Object.fromEntries(SAVERS.map((a) => [a.id, est(savers?.[a.id])]));
  const item = (t, cents, from) => ({ uid: t.uid, description: t.description, date: posted(t), cents, from });
  const pendingFrom = main ? addDays(main.asOf, -MATCH_DAYS) : null;
  const settledFrom = main ? addDays(main.asOf, -30) : null;
  for (const t of allTxns) {
    const acct = accountOf(t);
    const other = transferOther(t.description);
    if (isMain(acct)) {
      // Cash purchases (cash.js) never change Smart Access, not even while new.
      if (main && t.source === 'manual' && !t.cash && t.kind !== 'internal') {
        if (posted(t) >= pendingFrom) {
          main.cents += t.amountCents; main.extra += t.amountCents; main.typed++;
          main.items.push(item(t, t.amountCents, 'typed'));
        } else if (posted(t) >= settledFrom) {
          main.settled.count++; main.settled.cents += t.amountCents;
        }
      }
      if (main && t.source === 'csv' && t.confirm) {
        const q = openConfirm(t, typed);
        if (q) { main.cents -= t.amountCents; main.extra -= t.amountCents; main.confirms.push({ row: t, ...q }); }
      }
      const s = other && !isMain(other) ? out[other] : null;
      if (s && !pairedMain.has(t.uid) && after(t, s)) {
        s.cents -= t.amountCents; s.extra -= t.amountCents;
        if (t.source === 'manual') s.typed++; else s.other++;
        s.items.push(item(t, -t.amountCents, t.source === 'manual' ? 'typed' : 'other'));
      }
    } else if (main && other && isMain(other) && !pairs.has(t.uid) && after(t, main)) {
      main.cents -= t.amountCents; main.extra -= t.amountCents; main.other++;
      main.items.push(item(t, -t.amountCents, 'other'));
    }
  }
  const byDate = (a, b) => a.date.localeCompare(b.date) || a.uid.localeCompare(b.uid);
  for (const e of [main, ...Object.values(out)]) if (e) e.items.sort(byDate);
  return { main, savers: out };
}

// The chip under a balance: "+1 typed", "+2 typed" when every change is typed in, else "estimate".
export function estimateChip(e) {
  if (!e || (!e.typed && !e.other)) return null;
  return e.other ? 'estimate' : `+${e.typed} typed`;
}
