// Cash flow page, Where it went page and their number helpers. Fake data only.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { monthSeries, spendTotals, whereCompare, pctChange } from '../summary.js';
import { CashFlowPage, WherePage } from '../../components/FlowPages.jsx';
import { Donut, donutRows } from '../../components/charts.jsx';

const t = (date, cents, categoryId, extra = {}) => ({
  uid: `${date}|${cents}|${categoryId}`, date, amountCents: cents, kind: cents < 0 ? 'spend' : 'income',
  categoryId, description: 'FAKE SHOP', source: 'csv', ...extra,
});
const txns = [
  t('2026-08-05', -10000, 'groceries'), t('2026-08-06', 400000, 'job-income', { kind: 'income' }),
  t('2026-09-02', -12000, 'groceries'), t('2026-09-15', -30000, 'eating-out'), t('2026-09-22', -91600, 'housing'),
  t('2026-09-20', 450000, 'job-income', { kind: 'income' }),
  t('2026-10-03', -8000, 'groceries'), t('2026-10-12', -45000, 'eating-out'), t('2026-10-06', -91600, 'housing'),
  t('2026-10-01', 500000, 'job-income', { kind: 'income' }),
  t('2026-10-05', -20000, 'investing', { kind: 'investing' }),
  t('2026-10-07', -50000, 'saving', { kind: 'saving' }),
];
const noop = () => {};

describe('summary helpers', () => {
  it('pctChange: change against before, null when nothing before', () => {
    expect(pctChange(150, 100)).toBeCloseTo(0.5);
    expect(pctChange(50, 100)).toBeCloseTo(-0.5);
    expect(pctChange(50, 0)).toBeNull();
  });
  it('monthSeries: n months oldest first, with the four numbers', () => {
    const s = monthSeries(txns, '2026-10', 3);
    expect(s.map((x) => x.key)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(s[2]).toMatchObject({ income: 500000, spent: 8000 + 45000 + 91600, saved: 50000, invested: 20000 });
    expect(s[0].spent).toBe(10000);
  });
  it('spendTotals leaves investing out and can cap the newest month', () => {
    const all = spendTotals(txns, '2026-10', 1);
    expect(all.investing).toBeUndefined();
    expect(all.groceries).toBe(8000);
    expect(spendTotals(txns, '2026-10', 1, 5).groceries).toBe(8000);
    expect(spendTotals(txns, '2026-10', 1, 2).groceries).toBeUndefined();
  });
  it('whereCompare: this month against last, same day cut-off while the month is running', () => {
    const w = whereCompare(txns, '2026-10', 1, '2026-10-13');
    expect(w.total).toBe(8000 + 45000 + 91600);
    // last month up to the 13th: groceries 12000, no eating out yet (15th), no rent (22nd)
    expect(w.prevTotal).toBe(12000);
    const food = w.rows.find((r) => r.id === 'eating-out');
    expect(food.prev).toBe(0);
    expect(food.change).toBeNull();
    expect(w.rows.find((r) => r.id === 'groceries').change).toBeCloseTo(-1 / 3);
    // a past month is compared in full
    expect(whereCompare(txns, '2026-09', 1, '2026-10-13').prevTotal).toBe(10000);
  });
  it('whereCompare over 3 months compares with the 3 months before', () => {
    const w = whereCompare(txns, '2026-10', 3, '2026-10-13');
    expect(w.total).toBe(10000 + 12000 + 30000 + 91600 + 8000 + 45000 + 91600);
    expect(w.prevTotal).toBe(0);
  });
});

describe('donutRows', () => {
  it('keeps 8 or fewer, adds the rest into Everything else', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, name: `C${i}`, cents: 1000 - i }));
    const d = donutRows(rows);
    expect(d).toHaveLength(8);
    expect(d[7]).toMatchObject({ id: '__rest', name: 'Everything else', cents: 993 + 992 + 991 });
    expect(d.reduce((a, r) => a + r.cents, 0)).toBe(rows.reduce((a, r) => a + r.cents, 0));
    expect(donutRows(rows.slice(0, 8))).toHaveLength(8);
  });
  it('Donut draws a slice and legend row per category', () => {
    const out = renderToStaticMarkup(<Donut rows={[{ id: 'a', name: 'Alpha', cents: 300 }, { id: 'b', name: 'Beta', cents: 100 }]} total={400} />);
    expect(out).toContain('Alpha');
    expect(out).toContain('75%');
    expect(out.match(/stroke-dasharray/g)).toHaveLength(2);
  });
});

describe('Cash flow page', () => {
  const html = (over = {}) => renderToStaticMarkup(
    <CashFlowPage txns={txns} month="2026-10" today="2026-10-13" onDetail={noop} {...over} />);
  it('headline, range buttons, four bars and the four boxes with last month', () => {
    const out = html();
    expect(out).toContain('Your spending so far is');
    expect(out).toContain('more</strong> than September');
    for (const r of ['>M<', '>3M<', '>6M<', '>1Y<']) expect(out).toContain(r);
    expect(out.match(/class="flow-col"/g)).toHaveLength(4);
    for (const label of ['>In<', '>Spent<', '>Saved<', '>Invested<']) expect(out).toContain(label);
    expect(out).toContain('September: $');
  });
  it('the headline says "less" when spending is down', () => {
    const out = html({ month: '2026-09', today: '2026-10-13' });
    expect(out).toContain('% more</strong> than August');   // Sept 133.6k vs Aug 10k
    const lower = html({ txns: [t('2026-09-02', -50000, 'groceries'), t('2026-10-03', -10000, 'groceries')] });
    expect(lower).toContain('less</strong> than September');
  });
  it('copes with no earlier month', () => {
    expect(html({ txns: [t('2026-10-03', -8000, 'groceries')] })).toContain('to compare with yet');
  });
});

describe('Where it went page', () => {
  const html = (over = {}) => renderToStaticMarkup(
    <WherePage txns={txns} month="2026-10" today="2026-10-13" onDetail={noop} {...over} />);
  it('ranges, donut, comparison and a row per category that opens Spending', () => {
    const out = html();
    for (const r of ['>M<', '>3M<', '>Y<']) expect(out).toContain(r);
    expect(out).toContain('class="donut"');
    expect(out).toContain('Compared with September');
    expect(out).toMatch(/class="wrow"[^>]*aria-label="Rent &amp; housing: \$916\.00\. Open in Spending"/);
    expect(out).toContain('chg chg-up');     // eating out went up from nothing -> "New" ; rent up
    expect(out).toContain('chg-new');
  });
  it('shows an empty message when nothing was spent', () => {
    expect(html({ txns: [t('2026-10-01', 500000, 'job-income', { kind: 'income' })] })).toContain('No spending in this period.');
  });
});
