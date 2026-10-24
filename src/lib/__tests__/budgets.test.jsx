// M3 Budgets: from-month records, changes, the paste list, the overview groups, rent option D,
// the cash flow caption and syncing. Fake data and fake amounts only (real amounts never go in this repo).
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  budgetsForMonth, planChange, planChanges, parseBudgetList, budgetOverview, rentStatusText, cashFlowCaption,
  budgetableCategories, budgetUid, BEGINNING,
} from '../budgets.js';
import { mergeSnapshots } from '../merge.js';
import Budgets from '../../components/Budgets.jsx';

const rec = (categoryId, from, cents, updatedAt = 1) => ({ uid: budgetUid(categoryId, from), categoryId, from, cents, updatedAt });
const t = (date, cents, categoryId, extra = {}) => ({
  uid: `${date}|${cents}|${categoryId}`, date, amountCents: cents, kind: cents < 0 ? 'spend' : 'spend', categoryId, description: 'FAKE', source: 'csv', ...extra,
});
const TODAY = '2026-10-13';               // 13 of 31 days gone = 41.9%; "faster" starts at about 49.9% used

describe('budgetsForMonth', () => {
  it('uses the latest record that is not after the month', () => {
    const r = [rec('groceries', '2026-08', 20000), rec('groceries', '2026-10', 25000), rec('shopping', '2026-09', 4000)];
    expect(budgetsForMonth(r, '2026-07').size).toBe(0);
    expect(budgetsForMonth(r, '2026-09').get('groceries')).toBe(20000);
    expect(budgetsForMonth(r, '2026-10').get('groceries')).toBe(25000);
    expect(budgetsForMonth(r, '2026-10').get('shopping')).toBe(4000);
  });
  it('treats 0 cents as no budget from that month on', () => {
    const r = [rec('groceries', '2026-08', 20000), rec('groceries', '2026-10', 0)];
    expect(budgetsForMonth(r, '2026-09').get('groceries')).toBe(20000);
    expect(budgetsForMonth(r, '2026-10').has('groceries')).toBe(false);
  });
});

describe('planChange', () => {
  it('a change in the current month adds a from-month record and leaves the past alone', () => {
    const r = [rec('groceries', '2026-08', 20000)];
    const p = planChange(r, 'groceries', 25000, '2026-10', false, 99);
    expect(p.deletes).toEqual([]);
    expect(p.puts).toEqual([{ uid: 'budget|groceries|2026-10', categoryId: 'groceries', from: '2026-10', cents: 25000, updatedAt: 99 }]);
  });
  it('does nothing when the amount in force is already that amount', () => {
    const p = planChange([rec('groceries', '2026-08', 20000)], 'groceries', 20000, '2026-10', false, 99);
    expect(p).toEqual({ puts: [], deletes: [] });
  });
  it('removing writes a 0 record from the current month', () => {
    const p = planChange([rec('groceries', '2026-08', 20000)], 'groceries', 0, '2026-10', false, 5);
    expect(p.puts[0]).toMatchObject({ from: '2026-10', cents: 0 });
  });
  it('removing something that was never budgeted writes nothing', () => {
    expect(planChange([], 'groceries', 0, '2026-10', false, 5)).toEqual({ puts: [], deletes: [] });
  });
  it('also change past months: earlier records go, one record from the beginning replaces them', () => {
    const r = [rec('groceries', '2026-06', 10000), rec('groceries', '2026-08', 20000), rec('shopping', '2026-08', 4000)];
    const p = planChange(r, 'groceries', 30000, '2026-10', true, 7);
    expect(p.deletes.sort()).toEqual(['budget|groceries|2026-06', 'budget|groceries|2026-08']);
    expect(p.puts).toEqual([{ uid: `budget|groceries|${BEGINNING}`, categoryId: 'groceries', from: BEGINNING, cents: 30000, updatedAt: 7 }]);
    const after = [...r.filter((x) => !p.deletes.includes(x.uid)), ...p.puts];
    expect(budgetsForMonth(after, '2026-07').get('groceries')).toBe(30000);
    expect(budgetsForMonth(after, '2026-10').get('shopping')).toBe(4000);
  });
  it('also change past months with 0 removes the budget everywhere', () => {
    const r = [rec('groceries', '2026-06', 10000), rec('groceries', '2026-08', 20000)];
    const p = planChange(r, 'groceries', 0, '2026-10', true, 7);
    expect(p.puts).toEqual([]);
    expect(p.deletes).toHaveLength(2);
  });
  it('re-saving over the beginning record replaces it instead of deleting it', () => {
    const r = [rec('groceries', BEGINNING, 10000)];
    const p = planChange(r, 'groceries', 12000, '2026-10', true, 7);
    expect(p.deletes).toEqual([]);
    expect(p.puts[0].cents).toBe(12000);
  });
});

describe('planChanges (several at once)', () => {
  it('combines categories and lets the last line for a category win', () => {
    const p = planChanges([], [
      { categoryId: 'groceries', cents: 10000 }, { categoryId: 'shopping', cents: 2000 }, { categoryId: 'groceries', cents: 15000 },
    ], '2026-10', false, 3);
    expect(p.puts.map((x) => [x.categoryId, x.cents]).sort()).toEqual([['groceries', 15000], ['shopping', 2000]]);
  });
});

describe('parseBudgetList', () => {
  const text = [
    'Entertainment 25',
    '  Groceries: $120.50 ',
    'Eating out & takeaway 60 (just a note, 99)',
    'eating out and takeaway 70',           // same category again: the last line wins
    'Health 15',                             // unique start of "Health & medical"
    'Rent & housing 1000',
    'Tuition 500',
    'Nonsense 12',
    'Groceries',
    'Total 999',
    '',
  ].join('\n');
  const out = parseBudgetList(text);
  it('reads names, amounts, notes in brackets and a unique start of a name', () => {
    const got = Object.fromEntries(out.ok.map((o) => [o.categoryId, o.cents]));
    expect(got).toEqual({ entertainment: 2500, groceries: 12050, 'eating-out': 7000, health: 1500 });
  });
  it('refuses rent and tuition and reports unknown or amount-less lines', () => {
    const why = Object.fromEntries(out.bad.map((b) => [b.line, b.reason]));
    expect(why['Rent & housing 1000']).toMatch(/fixed bill/);
    expect(why['Tuition 500']).toMatch(/Not budgetable/);
    expect(why['Nonsense 12']).toMatch(/No category/);
    expect(why['Groceries']).toMatch(/No amount/);
    expect(out.bad.some((b) => /Total/.test(b.line))).toBe(false);
  });
  it('refuses a name that fits two categories', () => {
    const r = parseBudgetList('S 10');
    expect(r.ok).toEqual([]);
    expect(r.bad[0].reason).toMatch(/more than one/);
  });
});

describe('budgetableCategories', () => {
  it('leaves out tuition, rent, Uncategorized, income and hidden categories', () => {
    const ids = budgetableCategories().map((c) => c.id);
    expect(ids).toContain('groceries');
    for (const x of ['tuition', 'housing', 'other', 'job-income', 'pets', 'investing', 'saving']) expect(ids).not.toContain(x);
  });
});

describe('budgetOverview', () => {
  const plans = [
    rec('groceries', '2026-08', 10000), rec('shopping', '2026-08', 5000), rec('entertainment', '2026-08', 4000),
    rec('utilities', '2026-08', 3000), rec('fees', '2026-08', 2000),
  ];
  const txns = [
    t('2026-10-02', -5000, 'groceries'),                 // 50% used > 41.9% + 8  -> faster
    t('2026-10-03', -6000, 'shopping'),                  // 120% -> over
    t('2026-10-04', -1600, 'entertainment'),             // 40% -> on track
    t('2026-10-05', -1470, 'utilities'),                 // 49%: just under 49.9% -> on track
    t('2026-10-06', -1000, 'fees'), t('2026-10-07', 400, 'fees'),   // refund reduces: 600 of 2000
    t('2026-10-06', -183200, 'housing', { bill: true }),
    t('2026-10-08', -9000, 'tuition'),                   // not budgeted: never counts
    t('2026-10-09', -20000, 'investing', { kind: 'investing' }),
    t('2026-10-10', -50000, 'saving', { kind: 'saving' }),
    t('2026-09-06', -183200, 'housing', { bill: true }),
  ];
  it('groups into Over / Faster / On track and counts like Spending', () => {
    const o = budgetOverview(txns, plans, '2026-10', TODAY);
    expect(o.over.map((r) => r.id)).toEqual(['shopping']);
    expect(o.faster.map((r) => r.id)).toEqual(['groceries']);
    expect(o.onTrack.map((r) => r.id).sort()).toEqual(['entertainment', 'fees', 'utilities']);
    expect(o.onTrack.find((r) => r.id === 'fees').spent).toBe(600);
    expect(o.total).toBe(24000);
    expect(o.spent).toBe(5000 + 6000 + 1600 + 1470 + 600);
    expect(o.left).toBe(o.total - o.spent);
    expect(o.overCount).toBe(1);
    expect(o.daysLeft).toBe(18);
    expect(o.isCurrent).toBe(true);
  });
  it('rent is out of the total by default and in it With rent (rent never lands in faster)', () => {
    const without = budgetOverview(txns, plans, '2026-10', TODAY);
    expect(without.onTrack.some((r) => r.id === 'housing')).toBe(false);
    const withRent = budgetOverview(txns, plans, '2026-10', TODAY, { withRent: true });
    expect(withRent.total).toBe(24000 + 183200);
    const rentRow = withRent.onTrack.find((r) => r.id === 'housing');
    expect(rentRow).toMatchObject({ spent: 183200, limitCents: 183200, fixed: true });
    expect(withRent.faster.some((r) => r.id === 'housing')).toBe(false);
  });
  it('rent status: paid this month, due soon, or not paid', () => {
    expect(budgetOverview(txns, plans, '2026-10', TODAY).rent).toMatchObject({ status: 'paid', paidCents: 183200, usual: 183200 });
    const unpaid = txns.filter((x) => x.date !== '2026-10-06' || x.categoryId !== 'housing')
      .concat([t('2026-08-06', -183200, 'housing', { bill: true })]);
    const r = budgetOverview(unpaid, plans, '2026-10', '2026-10-04').rent;
    expect(r.status).toBe('due');
    expect(rentStatusText(r, true).text).toBe('Due in 3 days');
    expect(rentStatusText({ status: 'unpaid' }, true).text).toBe('Not paid yet');
    expect(rentStatusText({ status: 'unpaid' }, false).text).toBe('No rent payment');
    expect(rentStatusText({ status: 'paid' }, true).text).toBe('Paid');
  });
  it('a past month has no "faster" group and no days left', () => {
    const sep = [t('2026-09-10', -5000, 'groceries'), t('2026-09-11', -12000, 'shopping')];
    const o = budgetOverview(sep, plans, '2026-09', TODAY);
    expect(o.isCurrent).toBe(false);
    expect(o.faster).toEqual([]);
    expect(o.daysLeft).toBeNull();
    expect(o.over.map((r) => r.id)).toEqual(['shopping']);
    expect(o.onTrack.map((r) => r.id)).toContain('groceries');
  });
  it('a month before any budget has nothing', () => {
    const o = budgetOverview(txns, plans, '2026-06', TODAY);
    expect(o.has).toBe(false);
  });
  it('spending exactly at the limit is on track, not over', () => {
    const o = budgetOverview([t('2026-09-10', -10000, 'groceries')], plans, '2026-09', TODAY);
    expect(o.over).toEqual([]);
  });
  it('a change from the current month leaves the past month on its old amount', () => {
    const p2 = [...plans, rec('groceries', '2026-10', 20000)];
    expect(budgetOverview(txns, p2, '2026-10', TODAY).faster.some((r) => r.id === 'groceries')).toBe(false);   // 25% of 200
    expect(budgetOverview([t('2026-09-10', -9000, 'groceries')], p2, '2026-09', TODAY).onTrack[0]).toMatchObject({ limitCents: 10000 });
  });
});

describe('cashFlowCaption (wording A)', () => {
  it('up to 100% it is a percent', () => {
    expect(cashFlowCaption(100000, 20000)).toEqual({ kind: 'pct', percent: 20, overCents: 0 });
    expect(cashFlowCaption(100000, 100000)).toMatchObject({ kind: 'pct', percent: 100 });
    expect(cashFlowCaption(100000, 0)).toMatchObject({ kind: 'pct', percent: 0 });
  });
  it('over 100% it says how much more', () => {
    expect(cashFlowCaption(295, 961700)).toEqual({ kind: 'over', percent: null, overCents: 961405 });
    expect(cashFlowCaption(100000, 100001)).toMatchObject({ kind: 'over', overCents: 1 });
  });
  it('nothing in', () => {
    expect(cashFlowCaption(0, 5000).kind).toBe('none');
    expect(cashFlowCaption(0, 0).kind).toBe('none');
  });
});

describe('syncing budgets', () => {
  const base = { txns: [], rules: [], categories: [], tombstones: {} };
  it('merges budget records from two devices: newest edit wins per record', () => {
    const a = { ...base, budgets: [rec('groceries', '2026-10', 20000, 10), rec('shopping', '2026-10', 5000, 10)] };
    const b = { ...base, budgets: [rec('groceries', '2026-10', 25000, 20)] };
    const m = mergeSnapshots(a, b);
    expect(m.budgets.find((x) => x.categoryId === 'groceries').cents).toBe(25000);
    expect(m.budgets).toHaveLength(2);
  });
  it('a delete removes the record unless it was edited after', () => {
    const r = rec('groceries', '2026-08', 20000, 10);
    expect(mergeSnapshots({ ...base, budgets: [r] }, { ...base, tombstones: { [r.uid]: 15 } }).budgets).toEqual([]);
    expect(mergeSnapshots({ ...base, budgets: [{ ...r, updatedAt: 30 }] }, { ...base, tombstones: { [r.uid]: 15 } }).budgets).toHaveLength(1);
  });
  it('an older app version (no budgets field) does not wipe them out on this side', () => {
    const m = mergeSnapshots({ ...base, budgets: [rec('groceries', '2026-10', 20000)] }, { ...base });
    expect(m.budgets).toHaveLength(1);
    expect(mergeSnapshots({ ...base }, { ...base, budgets: [rec('groceries', '2026-10', 20000)] }).budgets).toHaveLength(1);
  });
});

describe('Budgets screen', () => {
  const plans = [rec('groceries', '2026-08', 10000), rec('shopping', '2026-08', 5000), rec('entertainment', '2026-08', 4000)];
  const txns = [t('2026-10-02', -5000, 'groceries'), t('2026-10-03', -6000, 'shopping'), t('2026-10-04', -1600, 'entertainment'),
    t('2026-10-06', -183200, 'housing', { bill: true })];
  const props = { txns, plans, today: TODAY, month: '2026-10', setMonth() {}, firstMonth: '2026-09', onToast() {} };
  it('draws the summary, the three groups, the fixed bills line and the controls', () => {
    const out = renderToStaticMarkup(<Budgets {...props} />);
    expect(out).toContain('left to spend');
    expect(out).toContain('18 days left');
    expect(out).toContain('1 over');
    for (const x of ['Over budget', 'Spending faster than the month', 'On track', 'Fixed bills', 'Without rent', 'With rent', 'Add budget', 'Paste a list']) {
      expect(out).toContain(x);
    }
    expect(out).toContain('class="pace"');
    expect(out).toContain('Paid');
  });
  it('shows an empty state before any budget exists and for a month with none', () => {
    expect(renderToStaticMarkup(<Budgets {...props} plans={[]} />)).toContain('No budgets yet');
    expect(renderToStaticMarkup(<Budgets {...props} month="2026-06" />)).toContain('No budgets were set for June 2026');
  });
});
