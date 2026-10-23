// Activity search and filters (M2.5b step 4). Fake data only.
import { describe, it, expect } from 'vitest';
import {
  EMPTY_FILTER, rangeBounds, filterTxns, totals, categoryCounts, activeChips, removeChip, dollarsToCents, shortName, matchesSearch,
} from '../activity.js';

const t = (date, cents, kind, categoryId, description = 'FAKE SHOP', extra = {}) => ({
  uid: `${date}|${cents}|${description}`, date, amountCents: cents, kind, categoryId, description, ...extra,
});
const TODAY = '2026-10-24';
const txns = [
  t('2026-10-22', -3412, 'spend', 'groceries', 'FAKEMART BROADWAY'),
  t('2026-10-21', -3400, 'spend', 'subscriptions', 'FAKEAI SUB SAN FRANCISCO CA USA Card xx1111 AUD 34.00 Value Date: 19/10/2026'),
  t('2026-10-20', -2500, 'review', null, 'Transfer To PayID'),
  t('2026-10-20', 61240, 'income', 'job-income', 'FAKE PAYROLL'),
  t('2026-10-19', -20000, 'saving', 'saving', 'Transfer to xx2066 NetBank'),
  t('2026-10-18', -10000, 'investing', 'investing', 'FAKE INVEST'),
  t('2026-10-06', -91600, 'spend', 'housing', 'Direct Debit 111 FAKE RENT'),
  t('2026-10-05', 1500, 'spend', 'eating-out', 'FRIEND PAYBACK'),
  t('2026-09-30', -2680, 'spend', 'utilities', 'Direct Debit 222 FAKETEL'),
  t('2026-09-15', 3000, 'review', null, 'Transfer From PayID'),
  t('2025-12-01', -5000, 'spend', 'groceries', 'FAKEMART OLD'),
];
const f = (over = {}) => ({ ...EMPTY_FILTER, ...over });
const ids = (list) => list.map((x) => x.description);

describe('date ranges', () => {
  it('this month, last month, this year, custom, all', () => {
    expect(rangeBounds(f({ range: 'this-month' }), TODAY)).toEqual({ from: '2026-10-01', to: TODAY });
    expect(rangeBounds(f({ range: 'last-month' }), TODAY)).toEqual({ from: '2026-09-01', to: '2026-09-31' });
    expect(rangeBounds(f({ range: 'last-month' }), '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(rangeBounds(f({ range: 'this-year' }), TODAY)).toEqual({ from: '2026-01-01', to: TODAY });
    expect(rangeBounds(f({ range: 'custom', from: '2026-10-05' }), TODAY)).toEqual({ from: '2026-10-05', to: '' });
    expect(rangeBounds(f(), TODAY)).toEqual({ from: '', to: '' });
  });
  it('filters by date, newest first', () => {
    const list = filterTxns(txns, f({ range: 'last-month' }), TODAY);
    expect(ids(list)).toEqual(['Direct Debit 222 FAKETEL', 'Transfer From PayID']);
    expect(filterTxns(txns, f({ range: 'this-year' }), TODAY).some((x) => x.date.startsWith('2025'))).toBe(false);
  });
});

describe('savings and To sort rules', () => {
  it('no filters: everything except savings transfers', () => {
    const list = filterTxns(txns, f(), TODAY);
    expect(list).toHaveLength(txns.length - 1);
    expect(list.some((x) => x.kind === 'saving')).toBe(false);
  });
  it('the savings switch, or picking Saved, shows them', () => {
    expect(filterTxns(txns, f({ savings: true }), TODAY)).toHaveLength(txns.length);
    expect(ids(filterTxns(txns, f({ types: ['saving'] }), TODAY))).toEqual(['Transfer to xx2066 NetBank']);
  });
  it('a picked type hides To sort items', () => {
    const list = filterTxns(txns, f({ types: ['spend'] }), TODAY);
    expect(list.every((x) => x.kind === 'spend')).toBe(true);
    expect(list).toHaveLength(6);
  });
  it('To sort only shows just those, even with a type picked', () => {
    expect(ids(filterTxns(txns, f({ toSort: true, types: ['spend'] }), TODAY))).toEqual(['Transfer To PayID', 'Transfer From PayID']);
  });
  it('several types together', () => {
    expect(filterTxns(txns, f({ types: ['income', 'investing'] }), TODAY)).toHaveLength(2);
  });
});

describe('category, amount and search', () => {
  it('categories (several)', () => {
    expect(ids(filterTxns(txns, f({ cats: ['groceries', 'housing'] }), TODAY)))
      .toEqual(['FAKEMART BROADWAY', 'Direct Debit 111 FAKE RENT', 'FAKEMART OLD']);
  });
  it('amount compares size only, both ends inclusive', () => {
    const list = filterTxns(txns, f({ min: 1500, max: 3412 }), TODAY);
    expect(list.map((x) => x.amountCents).sort((a, b) => a - b)).toEqual([-3412, -3400, -2680, -2500, 1500, 3000]);
  });
  it('search: description, category name, amount, To sort', () => {
    expect(ids(filterTxns(txns, f({ q: 'fakemart' }), TODAY))).toEqual(['FAKEMART BROADWAY', 'FAKEMART OLD']);
    expect(ids(filterTxns(txns, f({ q: 'rent & housing' }), TODAY))).toEqual(['Direct Debit 111 FAKE RENT']);
    expect(filterTxns(txns, f({ q: '$34' }), TODAY).map((x) => x.amountCents)).toEqual([-3412, -3400]);
    expect(filterTxns(txns, f({ q: '34.00' }), TODAY).map((x) => x.amountCents)).toEqual([-3400]);
    expect(filterTxns(txns, f({ q: 'to sort' }), TODAY)).toHaveLength(2);
    expect(matchesSearch(txns[0], '   ')).toBe(true);
  });
  it('a search on the trimmed card tail still finds the row', () => {
    expect(filterTxns(txns, f({ q: 'xx1111' }), TODAY)).toHaveLength(1);
  });
});

describe('totals (S2: money in and money out)', () => {
  it('adds in and out separately, in cents', () => {
    const list = filterTxns(txns, f({ range: 'this-month' }), TODAY);
    expect(totals(list)).toEqual({ count: 7, inCents: 61240 + 1500, outCents: 3412 + 3400 + 2500 + 10000 + 91600 });
    expect(totals([])).toEqual({ count: 0, inCents: 0, outCents: 0 });
  });
});

describe('category counts', () => {
  it('counts follow the other filters, keep zero-count categories, most used first', () => {
    const rows = categoryCounts(txns, f({ range: 'this-month', cats: ['utilities'] }), TODAY);
    expect(rows[0]).toMatchObject({ id: expect.any(String), count: 1 });
    expect(rows.find((r) => r.id === 'utilities').count).toBe(0);
    expect(rows.find((r) => r.id === 'groceries').count).toBe(1);
    expect(rows.some((r) => r.id === 'saving')).toBe(false);
  });
});

describe('chips', () => {
  it('lists what is on and removes one at a time', () => {
    const on = f({ q: 'fake', range: 'last-month', types: ['spend'], cats: ['groceries'], min: 2000, max: null });
    expect(activeChips(on).map((c) => c.label)).toEqual(['“fake”', 'Last month', 'Spending', 'Groceries', '$20 to any']);
    expect(removeChip(on, 'cat:groceries').cats).toEqual([]);
    expect(removeChip(on, 'amount')).toMatchObject({ min: null, max: null });
    expect(removeChip(on, 'range')).toMatchObject({ range: 'all', from: '', to: '' });
    expect(activeChips(f())).toEqual([]);
  });
});

describe('helpers', () => {
  it('dollarsToCents', () => {
    expect(dollarsToCents('12.5')).toBe(1250);
    expect(dollarsToCents('$1,000')).toBe(100000);
    expect(dollarsToCents('')).toBeNull();
    expect(dollarsToCents('abc')).toBeNull();
  });
  it('shortName drops the card tail but keeps everything else', () => {
    expect(shortName('FAKEAI SUB SAN FRANCISCO CA USA Card xx1111 AUD 34.00 Value Date: 19/10/2026')).toBe('FAKEAI SUB SAN FRANCISCO CA USA');
    expect(shortName('FAKEMART BROADWAY Value Date: 04/10/2026')).toBe('FAKEMART BROADWAY');
    expect(shortName('Direct Debit 111 FAKE RENT')).toBe('Direct Debit 111 FAKE RENT');
  });
});
