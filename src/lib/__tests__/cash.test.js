// Paid with cash, Push 1 (Ken, 26 Oct 2026, prototype "Moni Paid With Cash" v4): cash purchases count in Spending,
// budgets and Activity but never move Smart Access and are never matched to a bank row; ATM withdrawals are
// excluded transfers; cash deposits are Family support unless marked "My own cash". Fake merchants and amounts only.
import { describe, it, expect } from 'vitest';
import { prepareImport, nextBalance, currentBalance } from '../importer.js';
import { estimateBalances, countedView } from '../accounts.js';
import { DEFAULT_RULES, categorize } from '../rules.js';
import { openConfirms, markTyped } from '../typed.js';
import { summarizeMonth } from '../summary.js';
import { budgetOverview } from '../budgets.js';
import { filterTxns, EMPTY_FILTER, activeChips, removeChip } from '../activity.js';
import { spendFilter } from '../../components/Detail.jsx';
import { kindForCategory } from '../categories.js';
import { isCash, isAtmWithdrawal, isCashDeposit, isOwnCashDeposit, movesCash, cashTag, depositChoice, DEPOSIT_CHOICES } from '../cash.js';

const typed = (uid, date, cents, extra = {}) => ({
  uid, date, postedDate: date, amountCents: cents, description: extra.description ?? 'Lunch stall', source: 'manual',
  kind: 'spend', categoryId: 'eating-out', note: '', updatedAt: 1, ...extra,
});
const cash = (uid, date, cents, extra = {}) => typed(uid, date, cents, { cash: true, ...extra });
let k = 0;
const bankRow = (date, cents, balanceCents, description = 'FAKE CAFE SYDNEY') => ({
  importKey: `k${++k}|${date}|${cents}`, date, postedDate: date, amountCents: cents, description, rawDescription: description, balanceCents,
});
const stored = (date, cents, description, extra = {}) => {
  const c = categorize(description, cents);
  return { uid: `csv|${++k}`, date, postedDate: date, amountCents: cents, description, source: 'csv', kind: c.kind, categoryId: c.categoryId, updatedAt: 1, ...extra };
};
function importInto(all, rows, balance) {
  const plan = prepareImport(rows, { existingKeys: new Set(), manualTxns: all.filter((t) => t.source === 'manual'), rules: DEFAULT_RULES, now: 2 });
  const merged = new Set(plan.mergedManualIds);
  return { all: [...all.filter((t) => !merged.has(t.uid)), ...plan.toAdd], plan, balance: nextBalance(rows, balance) };
}
const start = { key: 'balance', cents: 5000, asOf: '2026-10-23' };

describe('cash purchases and the Smart Access balance', () => {
  it('never moves Smart Access, not even while new (same day or after the bank balance)', () => {
    const all = [cash('c1', '2026-10-23', -1250), cash('c2', '2026-10-25', -800)];
    const e = estimateBalances(all, start, {}).main;
    expect(e.cents).toBe(5000);
    expect(e.typed).toBe(0);
    expect(e.items).toEqual([]);
    expect(currentBalance(start, all)).toBe(5000);
  });

  it('is not counted as a settled typed entry either', () => {
    const e = estimateBalances([cash('c1', '2026-10-05', -1250)], start, {}).main;
    expect(e.settled).toEqual({ count: 0, cents: 0 });
  });

  it('an ordinary typed purchase still moves it (unchanged)', () => {
    expect(estimateBalances([typed('t1', '2026-10-24', -1250)], start, {}).main.cents).toBe(3750);
  });
});

describe('cash purchases and the importer', () => {
  it('a bank row with the same amount and date never replaces a cash purchase', () => {
    const all = [cash('c1', '2026-10-24', -1250)];
    const r = importInto(all, [bankRow('2026-10-24', -1250, 3750)], start);
    expect(r.plan.mergedManualIds).toEqual([]);
    expect(r.plan.confirms).toBe(0);
    expect(r.all.find((t) => t.uid === 'c1')).toBeTruthy();
    expect(r.all.find((t) => t.source === 'csv').confirm).toBeUndefined();
  });

  it('a near-miss amount never asks about a cash purchase', () => {
    const r = importInto([cash('c1', '2026-10-24', -1250)], [bankRow('2026-10-24', -1300, 3700)], start);
    expect(r.plan.confirms).toBe(0);
  });

  it('with one cash and one ordinary typed entry of the same amount, the ordinary one merges with no question', () => {
    const r = importInto([cash('c1', '2026-10-24', -1250), typed('t1', '2026-10-24', -1250)], [bankRow('2026-10-24', -1250, 3750)], start);
    expect(r.plan.mergedManualIds).toEqual(['t1']);
    expect(r.plan.confirms).toBe(0);
  });

  it('an older open question drops an entry switched to cash afterwards', () => {
    const row = { ...stored('2026-10-24', -1250, 'FAKE CAFE SYDNEY'), confirm: { ids: ['t1', 't2'], near: false } };
    const all = [row, typed('t1', '2026-10-24', -1250, { cash: true }), typed('t2', '2026-10-24', -1250)];
    expect(openConfirms(all)[0].ids).toEqual(['t2']);
  });
});

describe('cash purchases count in Spending, budgets and Activity', () => {
  const all = [cash('c1', '2026-10-24', -1250), stored('2026-10-22', -1200, 'FAKE CAFE SYDNEY', { kind: 'spend', categoryId: 'eating-out' })];

  it('counts under its normal category in the month summary', () => {
    const s = summarizeMonth(countedView(all), '2026-10');
    expect(s.spent).toBe(2450);
    expect(s.byCategory['eating-out']).toBe(2450);
  });

  it('counts against its budget', () => {
    const b = budgetOverview(countedView(all), [{ uid: 'budget|eating-out|2000-01', categoryId: 'eating-out', from: '2000-01', cents: 10000 }], '2026-10', '2026-10-26');
    expect(b.spent).toBe(2450);
  });

  it('is listed in Activity, and Typed only still includes it', () => {
    expect(filterTxns(all, EMPTY_FILTER, '2026-10-26')).toHaveLength(2);
    expect(filterTxns(all, { ...EMPTY_FILTER, typed: true }, '2026-10-26').map((t) => t.uid)).toEqual(['c1']);
  });

  it('markTyped keeps the entry (the list shows the cash tag instead of typed)', () => {
    expect(markTyped(all, '2026-10-23')[0].cash).toBe(true);
  });
});

describe('ATM withdrawal rule (wording not verified)', () => {
  it.each([
    'ATM WITHDRAWAL CBA ATM BROADWAY NSW',
    'ATM CBA BROADWAY A NSW',
    'WDL ATM CBA BROADWAY',
    'CASH WITHDRAWAL CBA ATM',
    'Wdl ATM Withdrawal Broadway',
  ])('%s -> Transfers & payments, excluded', (d) => {
    const c = categorize(d, -20000);
    expect(c).toMatchObject({ kind: 'internal', categoryId: 'internal' });
    expect(isAtmWithdrawal({ source: 'csv', amountCents: -20000, description: d })).toBe(true);
  });

  it('money in or look-alike merchants are not withdrawals', () => {
    expect(categorize('ATMOSPHERE CAFE SYDNEY', -1200).kind).not.toBe('internal');
    expect(isAtmWithdrawal({ source: 'csv', amountCents: -1200, description: 'ATMOSPHERE CAFE SYDNEY' })).toBe(false);
    expect(isAtmWithdrawal({ source: 'csv', amountCents: 20000, description: 'ATM WITHDRAWAL REVERSAL' })).toBe(false);
  });

  it('a withdrawal never counts as spending or money in', () => {
    const s = summarizeMonth([stored('2026-10-23', -20000, 'ATM WITHDRAWAL CBA ATM BROADWAY NSW')], '2026-10');
    expect(s.spent).toBe(0);
    expect(s.income).toBe(0);
    expect(s.review).toBe(0);
  });
});

describe('cash deposits', () => {
  const dep = (categoryId) => stored('2026-10-25', 4000, 'CASH DEPOSIT CBA ATM BROADWAY A NSW 000000 AUS 0000', categoryId ? { categoryId, kind: kindForCategory(categoryId) } : {});

  it('default: cash someone gave me = money in, Family support (as before)', () => {
    const d = dep();
    expect(d).toMatchObject({ kind: 'income', categoryId: 'family' });
    expect(depositChoice(d.categoryId)).toBe('gift');
    expect(summarizeMonth([d], '2026-10').income).toBe(4000);
    expect(isOwnCashDeposit(d)).toBe(false);
    expect(cashTag(d)).toEqual({ text: 'cash in', cls: 'cin' });
  });

  it('my own cash = Transfers & payments: not money in, not spending', () => {
    const d = dep(DEPOSIT_CHOICES.own);
    expect(d).toMatchObject({ kind: 'internal', categoryId: 'internal' });
    expect(depositChoice(d.categoryId)).toBe('own');
    const s = summarizeMonth([d], '2026-10');
    expect(s.income).toBe(0);
    expect(s.spent).toBe(0);
    expect(isOwnCashDeposit(d)).toBe(true);
    expect(cashTag(d)).toEqual({ text: 'own cash', cls: 'cash' });
  });

  it('switching back gives Family support again', () => {
    expect(DEPOSIT_CHOICES.gift).toBe('family');
    expect(kindForCategory(DEPOSIT_CHOICES.gift)).toBe('income');
  });

  it('online deposits from people are not cash deposits: tagged online, never asked', () => {
    const o = stored('2026-10-25', 3000, 'Fast Transfer From FAKE PERSON LIVING FEE');
    expect(o.categoryId).toBe('family');
    expect(isCashDeposit(o)).toBe(false);
    expect(cashTag(o)).toEqual({ text: 'online', cls: 'online' });
  });
});

describe('Cash only filters and tags', () => {
  const lunch = cash('c1', '2026-10-26', -1250);
  const atm = stored('2026-10-23', -20000, 'ATM WITHDRAWAL CBA ATM BROADWAY NSW');
  const gift = stored('2026-10-25', 4000, 'CASH DEPOSIT CBA ATM BROADWAY A NSW');
  const own = { ...stored('2026-10-25', 4000, 'CASH DEPOSIT CBA ATM BROADWAY A NSW'), kind: 'internal', categoryId: 'internal' };
  const cafe = stored('2026-10-23', -1200, 'FAKE CAFE SYDNEY', { kind: 'spend', categoryId: 'eating-out' });
  const coffee = typed('t1', '2026-10-26', -480);
  const all = [lunch, atm, gift, own, cafe, coffee];

  it('Activity "Cash entries only" = rows that move cash: cash purchases, withdrawals, own cash deposited', () => {
    const f = { ...EMPTY_FILTER, cash: true };
    expect(filterTxns(all, f, '2026-10-26').map((t) => t.uid).sort()).toEqual([lunch.uid, atm.uid, own.uid].sort());
    expect(activeChips(f)).toContainEqual({ key: 'cash', label: 'Cash only' });
    expect(removeChip(f, 'cash').cash).toBe(false);
  });

  it('Spending "Cash only" = cash purchases only; with Typed only too, still just cash', () => {
    const month = [lunch, cafe, coffee];
    expect(spendFilter(month, [], false, true).list.map((t) => t.uid)).toEqual(['c1']);
    expect(spendFilter(month, [], false, true).out).toBe(1250);
    expect(spendFilter(month, [], true, false).count).toBe(2);
    expect(spendFilter(month, [], true, true).count).toBe(1);
  });

  it('tags: cash, to cash, cash in, own cash; nothing on ordinary rows', () => {
    expect(cashTag(lunch)).toEqual({ text: 'cash', cls: 'cash' });
    expect(cashTag(atm)).toEqual({ text: 'to cash', cls: 'cash' });
    expect(cashTag(gift).text).toBe('cash in');
    expect(cashTag(own).text).toBe('own cash');
    expect(cashTag(cafe)).toBeNull();
    expect(cashTag(coffee)).toBeNull();
  });

  it('isCash needs a typed purchase: never a bank row or a typed transfer', () => {
    expect(isCash({ ...cafe, cash: true })).toBe(false);
    expect(isCash({ ...coffee, cash: true, transfer: true })).toBe(false);
    expect(movesCash(coffee)).toBe(false);
  });
});
