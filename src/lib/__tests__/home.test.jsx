// Render check: Home draws without errors for a normal month, a past month and an empty month.
// Fake data only.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Home from '../../components/Home.jsx';

const t = (date, cents, categoryId, extra = {}) => ({
  uid: `${date}|${cents}|${categoryId}|${Math.abs(cents)}`, date, amountCents: cents, kind: cents < 0 ? 'spend' : 'income',
  categoryId, description: 'FAKE SHOP', source: 'csv', ...extra,
});
const txns = [
  t('2026-09-02', -12000, 'groceries'), t('2026-09-15', -30000, 'eating-out'), t('2026-09-22', -91600, 'housing', { bill: true }),
  t('2026-09-08', -91600, 'housing', { bill: true }),
  t('2026-10-06', -91600, 'housing', { bill: true }), t('2026-10-03', -8000, 'groceries'), t('2026-10-12', -2500, 'eating-out'),
  t('2026-10-01', 500000, 'job-income', { kind: 'income' }),
  t('2026-10-05', -20000, 'investing', { kind: 'investing' }),
  t('2026-10-07', -50000, 'saving', { kind: 'saving' }),
  { uid: 'rv', date: '2026-10-09', amountCents: -4000, kind: 'review', categoryId: null, description: 'FAKE REVOLUT', source: 'csv' },
];
const noop = () => {};
const props = { txns, today: '2026-10-13', month: '2026-10', setMonth: noop, firstMonth: '2026-09',
  balance: { cents: 123456, asOf: '2026-10-12' }, sync: { token: 'x' }, onNavigate: noop, onDetail: noop, onToast: noop };
const html = (over = {}) => renderToStaticMarkup(<Home {...props} {...over} />);

describe('Home', () => {
  it('shows the balance, 4 boxes, to-sort chip, pace, categories, day by day and the rent warning', () => {
    const out = html();
    expect(out).toContain('$1,234.56');                // balance
    for (const label of ['>In<', '>Spent<', '>Saved<', '>Invested<']) expect(out).toContain(label);
    expect(out).toContain('<strong>1</strong> to sort');
    expect(out).toContain('Where it went');
    expect(out).toContain('Day by day');
    expect(out).toContain('Rent is due in 7 days');
    expect(out).not.toContain('<button type="button" class="banner action"><span class="warn-text">');
    expect(out).toContain('rent-warn');
    expect(out).not.toContain('Search transactions');
    expect(out).toContain('September: $');             // box bottom lines = full previous month
    expect(out).toContain('Busiest day');
    expect(out).toContain('of September’s');      // pace wording
    expect(out).toContain('by the 13th');
    expect(out.match(/class="cal-day /g).length).toBeGreaterThanOrEqual(31);
  });
  it('Where it went rows are buttons, and the more/less line shares the row with the % of last month', () => {
    const out = html();
    expect(out).toMatch(/<button type="button" class="where"[^>]*aria-label="Rent &amp; housing: \$916\.00\. Open in Spending"/);
    expect(out).toMatch(/<div class="pace-sub"><span class="label">[^<]*<\/span><span class="vs /);
  });
  it('has no transaction list on Home', () => {
    const out = html();
    expect(out).not.toContain('Recent');
    expect(out).not.toContain('class="txn');
  });
  it('a past month: no rent warning, whole-month comparison', () => {
    const out = html({ month: '2026-09' });
    expect(out).not.toContain('is due');
    expect(out).not.toContain('Spent in September');
    expect(out).toContain('Nothing earlier to compare with yet.');
  });
  it('a month with nothing in it still draws', () => {
    const out = html({ txns: [t('2026-10-01', 500000, 'job-income', { kind: 'income' })] });
    expect(out).toContain('No spending yet this month.');
    expect(out).toContain('Nothing earlier to compare with yet.');
  });
  it('shows the welcome card when there are no transactions', () => {
    expect(html({ txns: [] })).toContain('Start with your bank history');
  });
});
