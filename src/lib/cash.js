// Paid with cash (Ken, 26 Oct 2026, UI locked; prototype "Moni Paid With Cash" v4). Pure logic, tested in
// __tests__/cash.test.js. Push 1 = cash entries and bank rules; the Cash balance comes in Push 2.
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

export const isCash = (t) => t.source === 'manual' && !!t.cash && !t.transfer;

// Unverified wording, see above. Money out only.
const ATM = /^(ATM |WDL |CASH WITHDRAWAL)|ATM WITHDRAWAL/i;
export const isAtmWithdrawal = (t) => t.source === 'csv' && t.amountCents < 0 && ATM.test(t.description ?? '');

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
