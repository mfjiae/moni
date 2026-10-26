// M5 Bills: rhythm maths, suggestions, the Bills page numbers, syncing, and the same-day balance fix.
// Fake merchants and sample amounts only.
import { describe, it, expect } from 'vitest';
import { stepDate, dueDates, detectBills, billsView, billFromSuggestion, paysBill, keyOf } from '../bills.js';
import { mergeSnapshots } from '../merge.js';
import { estimateBalances } from '../accounts.js';
import { currentBalance } from '../importer.js';

const TODAY = '2026-10-26';
let n = 0;
const pay = (date, cents, description, categoryId, extra = {}) => ({
  uid: `t${++n}`, date, amountCents: -cents, description, categoryId, kind: 'spend', source: 'csv', ...extra,
});
const rent = ['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'].map((d) => pay(d, 183200, 'Direct Debit 123456 SCAPE FAKE', 'housing'));
const gym = ['2026-08-06', '2026-08-20', '2026-09-03', '2026-09-17', '2026-10-01', '2026-10-15'].map((d) => pay(d, 4500, 'FAKEFIT GYM', 'sport'));
const tuition = [pay('2026-02-10', 300000, 'UTS SYDNEY BPAY', 'tuition'), pay('2026-07-14', 320000, 'UTS SYDNEY BPAY', 'tuition'), pay('2026-07-20', 5000, 'UTS SYDNEY BPAY', 'tuition')];
const groceries = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'].map((d) => pay(d, 8000, 'FAKEMART STORE', 'groceries'));
const wobbly = [pay('2026-08-05', 1000, 'FAKESTREAM', 'subscriptions'), pay('2026-09-05', 3000, 'FAKESTREAM', 'subscriptions'), pay('2026-10-05', 1000, 'FAKESTREAM', 'subscriptions')];
const stopped = ['2026-01-10', '2026-02-10', '2026-03-10', '2026-04-10'].map((d) => pay(d, 999, 'OLDSUB', 'subscriptions'));
const txns = [...rent, ...gym, ...tuition, ...groceries, ...wobbly, ...stopped];

describe('due dates', () => {
  it('months keep their day, clamped to short months', () => {
    expect(stepDate('2026-01-31', 'monthly', 1)).toBe('2026-02-28');
    expect(stepDate('2026-01-31', 'monthly', 2)).toBe('2026-03-31');
    expect(stepDate('2026-07-14', 'halfyearly', 1)).toBe('2027-01-14');
    expect(stepDate('2026-10-15', 'fortnightly', -1)).toBe('2026-10-01');
  });
  it('lists every due date in a window, both sides of the anchor', () => {
    expect(dueDates({ every: 'fortnightly', anchor: '2026-10-15' }, '2026-10-01', '2026-11-12'))
      .toEqual(['2026-10-01', '2026-10-15', '2026-10-29', '2026-11-12']);
  });
});

describe('bill suggestions', () => {
  const found = detectBills(txns, [], TODAY);
  const by = Object.fromEntries(found.map((f) => [f.key, f]));
  it('finds rent, the fortnightly gym and tuition', () => {
    expect(Object.keys(by).sort()).toEqual(['FAKEFIT GYM', 'SCAPE FAKE', 'cat:tuition']);
    expect(by['SCAPE FAKE']).toMatchObject({ name: 'Rent', every: 'monthly', cents: 183200, next: '2026-11-01' });
    expect(by['FAKEFIT GYM']).toMatchObject({ name: 'Fakefit Gym', every: 'fortnightly', cents: 4500, next: '2026-10-29' });
  });
  it('tuition is one payment per semester (added up) and half-yearly', () => {
    expect(by['cat:tuition']).toMatchObject({ name: 'Tuition', every: 'halfyearly', cents: 325000, anchor: '2026-07-14', next: '2027-01-14' });
  });
  it('skips groceries, wobbly amounts and bills that stopped', () => {
    expect(by['FAKEMART STORE']).toBeUndefined();
    expect(by.FAKESTREAM).toBeUndefined();
    expect(by.OLDSUB).toBeUndefined();
  });
  it('never suggests one you already have or said "Not a bill" to', () => {
    const recs = [{ uid: 'bill|skip|SCAPE FAKE', key: 'SCAPE FAKE', dismissed: true }, billFromSuggestion(by['FAKEFIT GYM'])];
    expect(detectBills(txns, recs, TODAY).map((f) => f.key)).toEqual(['cat:tuition']);
  });
});

describe('Bills page numbers', () => {
  const found = detectBills(txns, [], TODAY);
  const bills = found.map((f) => billFromSuggestion(f, f.every, 1));
  const v = billsView(bills, txns, TODAY);
  const line = (x) => `${x.due} ${x.bill.name} ${x.status} ${x.cents}`;
  it('timeline: this month so far plus 30 days ahead, paid and due', () => {
    expect(v.timeline.map(line)).toEqual([
      '2026-10-01 Fakefit Gym paid 4500',
      '2026-10-01 Rent paid 183200',
      '2026-10-15 Fakefit Gym paid 4500',
      '2026-10-29 Fakefit Gym due 4500',
      '2026-11-01 Rent due 183200',
      '2026-11-12 Fakefit Gym due 4500',
    ]);
    expect(v.dueCents).toBe(192200);
  });
  it('a bill with nothing due soon shows under later with its next date', () => {
    expect(v.later.map((x) => `${x.due} ${x.bill.name}`)).toEqual(['2027-01-14 Tuition']);
  });
  it('months: paid per month, and what is still to pay this month', () => {
    const oct = v.months.find((m) => m.key === '2026-10');
    expect(v.months.map((m) => m.key)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10']);
    expect(oct).toEqual({ key: '2026-10', paid: 192200, toPay: 4500 });
    expect(v.months[0].paid).toBe(183200 + 325000);
  });
  it('filters by how often', () => {
    expect(billsView(bills, txns, TODAY, 'monthly').timeline.every((x) => x.bill.every === 'monthly')).toBe(true);
  });
  it('a bill typed by hand: found by category and a similar amount; late when no payment is seen', () => {
    const phone = { uid: 'bill|m|x', name: 'Phone', cents: 2680, every: 'monthly', anchor: '2026-10-20', since: '2026-10-01', categoryId: 'utilities' };
    expect(paysBill(phone, pay('2026-10-20', 2700, 'ANY TELCO', 'utilities'))).toBe(true);
    expect(paysBill(phone, pay('2026-10-20', 9000, 'ANY TELCO', 'utilities'))).toBe(false);
    const late = billsView([phone], txns, TODAY).timeline;
    expect(late.map(line)).toEqual(['2026-10-20 Phone late 2680', '2026-11-20 Phone due 2680']);
    const paid = billsView([phone], [...txns, pay('2026-10-21', 2680, 'ANY TELCO', 'utilities')], TODAY).timeline;
    expect(paid[0].status).toBe('paid');
  });
  it('due dates before a bill was tracked are not shown as late', () => {
    const fresh = { uid: 'bill|m|y', name: 'New', cents: 1000, every: 'weekly', anchor: '2026-10-28', since: '2026-10-28', categoryId: 'utilities' };
    expect(billsView([fresh], [], TODAY).timeline.every((x) => x.due >= '2026-10-28')).toBe(true);
  });
  it('dismissed records never show as bills', () => {
    expect(billsView([{ uid: 'bill|skip|X', key: 'X', dismissed: true }], txns, TODAY).count).toBe(0);
  });
  it('tuition payments are grouped by key', () => {
    expect(keyOf(tuition[0])).toBe('cat:tuition');
  });
});

describe('syncing bills', () => {
  it('merges like other records, deletes leave tombstones', () => {
    const a = { bills: [{ uid: 'bill|m|1', name: 'A', updatedAt: 1 }, { uid: 'bill|m|2', name: 'B', updatedAt: 1 }] };
    const b = { bills: [{ uid: 'bill|m|1', name: 'A2', updatedAt: 2 }], tombstones: { 'bill|m|2': 5 } };
    expect(mergeSnapshots(a, b).bills).toEqual([{ uid: 'bill|m|1', name: 'A2', updatedAt: 2 }]);
  });
});

describe('same-day balance fix', () => {
  const typed = { uid: 'm1', date: '2026-10-25', amountCents: -450, kind: 'spend', categoryId: 'groceries', source: 'manual', description: 'groceries' };
  it('a typed entry dated on the bank balance day changes the balance', () => {
    const est = estimateBalances([typed], { cents: 100000, asOf: '2026-10-25' }, {});
    expect(est.main.cents).toBe(99550);
    expect(est.main.typed).toBe(1);
    expect(currentBalance({ cents: 100000, asOf: '2026-10-25' }, [typed])).toBe(99550);
  });
  it('one dated before the bank balance day does not', () => {
    const est = estimateBalances([{ ...typed, date: '2026-10-24' }], { cents: 100000, asOf: '2026-10-25' }, {});
    expect(est.main.cents).toBe(100000);
  });
  it('a CSV row from the other account on the same day is still left out (already in that bank number)', () => {
    const saverRow = { uid: 's1', date: '2026-10-25', amountCents: 5000, kind: 'saving', account: 'xx2066', source: 'csv', description: 'Transfer from xx6193' };
    const est = estimateBalances([saverRow], { cents: 100000, asOf: '2026-10-25' }, {});
    expect(est.main.cents).toBe(100000);
  });
});

describe('Bills page (render)', () => {
  it('shows the timeline, the per-month bars, a suggestion and the tuition link', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const React = await import('react');
    const { default: Bills } = await import('../../components/Bills.jsx');
    const found = detectBills(txns, [], TODAY);
    const bills = found.filter((f) => f.key !== 'FAKEFIT GYM').map((f) => billFromSuggestion(f, f.every, 1));
    const html = renderToStaticMarkup(React.createElement(Bills, { txns, bills, today: TODAY, usage: {}, onDetail: () => {}, onToast: () => {} }));
    for (const text of ['Next 30 days', 'Per month', 'Looks like a bill', 'Fakefit Gym', 'Add as bill', 'Not a bill', 'View semester history', 'Today · Mon 26 Oct', '+ Add bill']) {
      expect(html).toContain(text);
    }
  });
});

describe('Home rent pill from the Rent bill', () => {
  it('uses the bill date (same as the Bills page), falls back when there is no rent bill', async () => {
    const { rentFromBills } = await import('../bills.js');
    const rentBill = billFromSuggestion(detectBills(txns, [], TODAY).find((f) => f.name === 'Rent'));
    expect(rentFromBills([rentBill], txns, TODAY)).toEqual({ date: '2026-11-01', cents: 183200, days: 6 });
    expect(rentFromBills([rentBill], txns, '2026-10-20')).toBeNull();          // 12 days away
    expect(rentFromBills([], txns, TODAY)).toBeUndefined();
  });
});
