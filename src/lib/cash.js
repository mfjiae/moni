// Paid with cash (Ken, 26 Oct 2026, UI locked; prototype "Moni Paid With Cash" v4). Pure logic, tested in
// __tests__/cash.test.js and cash2.test.js. Push 1 = cash entries and bank rules; Push 2 = the Cash balance
// and the "Cash withdrawal?" question (bottom of this file).
//
// - A cash purchase is a typed Money out entry with `cash: true` (synced with the row, no db change).
//   It counts in Spending, budgets and Activity under its normal category, but it never changes the
//   Smart Access balance (not even while new) and the importer never offers it as a match for a bank row.
// - ATM withdrawals: a rule files them under Transfers & payments (excluded), so the cash counts once,
//   when you spend it. The bank's wording is NOT verified (none of Ken's CSVs has a withdrawal); a miss
//   lands in To sort.
// - Cash deposits ("CASH DEPOSIT CBA ATM ..."): by default "Cash someone gave me" = money in, Family support
//   (the rule, as before). "My own cash" = Transfers & payments: not money in. Worked out from the category,
//   never a separate stored field.
// - Online deposits from people (Family support, not a cash deposit) are tagged "online" and never ask.

import { ruleMatches } from './rules.js';

export const isCash = (t) => t.source === 'manual' && !!t.cash && !t.transfer;

// Unverified wording, see above. Money out only.
const ATM = /^(ATM |WDL |CASH WITHDRAWAL)|ATM WITHDRAWAL/i;
// `atm: true` = you answered "Yes, ATM cash" (or a remembered rule filed it); `atm: false` = you said no.
export const isAtmWithdrawal = (t) => t.source === 'csv' && t.amountCents < 0 && t.atm !== false
  && (t.atm === true || ATM.test(t.description ?? ''));

export const isCashDeposit = (t) => t.source === 'csv' && t.amountCents > 0 && /^CASH DEPOSIT/i.test(t.description ?? '');
export const isOwnCashDeposit = (t) => isCashDeposit(t) && t.categoryId === 'internal';

// The two answers on a cash deposit's sheet: the category each one sets.
export const DEPOSIT_CHOICES = { gift: 'family', own: 'internal' };
export const depositChoice = (categoryId) => (categoryId === 'internal' ? 'own' : 'gift');

// Rows that move cash in hand: cash purchases, ATM withdrawals, own cash put back in the bank
// (Activity's "Cash entries only"; Spending's "Cash only" uses isCash, since only purchases are spending).
export const movesCash = (t) => isCash(t) || isAtmWithdrawal(t) || isOwnCashDeposit(t);

// The small tag on a list row, or null: { text, cls } with cls = 'cash' (warm) | 'cin' (green) | 'online' (gray).
export function cashTag(t) {
  if (isCash(t)) return { text: 'cash', cls: 'cash' };
  if (isAtmWithdrawal(t)) return { text: 'to cash', cls: 'cash' };
  if (isCashDeposit(t)) return isOwnCashDeposit(t) ? { text: 'own cash', cls: 'cash' } : { text: 'cash in', cls: 'cin' };
  if (t.source === 'csv' && t.amountCents > 0 && t.categoryId === 'family') return { text: 'online', cls: 'online' };
  return null;
}

// ---------- Push 2: the Cash balance (Ken, 26 Oct 2026; prototype v4 "Home: the Cash button and panel") ----------
// Cash left = the amount you set (with its date) + ATM withdrawals - cash spent - own cash put back in the bank,
// counted from the date you set it. Worked out from the entries every time, never stored, so editing or
// deleting an entry corrects it. It may go below zero (shown in rose, with a hint to set it again).
// setting = { cents, asOf: 'YYYY-MM-DD', setAt: ms } or null (never set: counts everything from $0).
// On the set day itself, only cash purchases typed AFTER you set it count (your count already includes the
// rest of that day); bank rows dated that day are taken as already in your count.

// What one row does to cash in hand, in cents (0 = nothing).
export function cashEffect(t) {
  if (isCash(t)) return t.amountCents;                 // a purchase: cash goes down
  if (isAtmWithdrawal(t)) return -t.amountCents;       // -$200 from the bank = +$200 cash
  if (isOwnCashDeposit(t)) return -t.amountCents;      // +$40 into the bank = -$40 cash
  return 0;
}

// Does this row count in the cash balance (on or after the date you set it)?
export function countsInCash(t, setting) {
  if (!setting) return true;
  if (t.date > setting.asOf) return true;
  return t.date === setting.asOf && t.source === 'manual' && (t.createdAt ?? 0) > (setting.setAt ?? 0);
}

export function cashBalance(txns, setting = null) {
  const out = {
    set: setting ? { cents: setting.cents, asOf: setting.asOf } : null,
    withdrawals: { count: 0, cents: 0 }, own: { count: 0, cents: 0 }, spent: { count: 0, cents: 0 },
    left: setting?.cents ?? 0, effects: new Map(),
  };
  for (const t of txns) {
    const fx = cashEffect(t);
    if (!fx || !countsInCash(t, setting)) continue;
    out.effects.set(t.uid, fx);
    out.left += fx;
    const bucket = isCash(t) ? out.spent : isAtmWithdrawal(t) ? out.withdrawals : out.own;
    bucket.count++; bucket.cents += Math.abs(fx);
  }
  return out;
}

// The rose dot on Cash: only while a counted cash purchase is newer than your last import (on or after the bank
// balance's date, the same rule as typed entries; no import yet = any counted cash purchase).
export function cashDot(txns, setting, bankAsOf) {
  return txns.some((t) => isCash(t) && countsInCash(t, setting) && (!bankAsOf || (t.postedDate ?? t.date) >= bankAsOf));
}

// ---------- Push 2: "Cash withdrawal?" (Ken, 27 Oct 2026) ----------
// A looser flag for withdrawals the wording rule misses: money out, a round amount (a multiple of $10),
// not a card purchase, BPAY, direct debit, PayID or transfer, and no rule sorted it (still To sort).
// Never asked again once answered (`atm` set), or when a remembered "No" rule matches.
const NOT_ATM = /CARD XX\d{4}|VALUE DATE|BPAY|DIRECT DEBIT|PAYID|TRANSFER/i;
export function atmQuestion(t, skipRules = []) {
  if (t.source !== 'csv' || t.amountCents >= 0 || t.amountCents % 1000 !== 0) return false;
  if (t.kind !== 'review' || t.atm != null) return false;
  const d = t.description ?? '';
  if (ATM.test(d) || NOT_ATM.test(d)) return false;
  return !skipRules.some((r) => ruleMatches(r, d, t.amountCents));
}

// Remembered answers are learned rules (synced, listed in Settings > Learned rules):
//   Yes: { match: { contains, sign: 'out' }, kind: 'internal', categoryId: 'internal', atm: true } (files and fills cash)
//   No:  { match: { contains, sign: 'out' }, notAtm: true } (never sorts anything, only stops the question)
export const atmSkipRules = (userRules = []) => userRules.filter((r) => r.notAtm);
export function atmRule(keyword, yes) {
  const contains = keyword.toUpperCase().trim();
  return yes
    ? { match: { contains, sign: 'out' }, kind: 'internal', categoryId: 'internal', atm: true, createdBy: 'user' }
    : { match: { contains, sign: 'out' }, notAtm: true, createdBy: 'user' };
}
