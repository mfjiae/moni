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
  it('shows the balance, shortcuts, Spent so far, cash flow, donut, to-sort pill and the rent warning', () => {
    const out = html();
    expect(out).toContain('$1,234.56');                // balance
    for (const label of ['>Spending<', '>Income<', '>Saved<', '>Invested<', '>Activity<']) expect(out).toContain(label);
    expect(out).toContain('<strong>1</strong><span class="sort-text"> to sort</span>');
    expect(out).toContain('Spent so far');
    expect(out).toContain('Monthly cash flow');
    expect(out).toContain('Spent 20% of what came in');
    expect(out).toContain('Where it went');
    expect(out).toContain('class="donut"');
    expect(out).toContain('Rent due in 7 days');
    expect(out).toContain('rent-pill');
    expect(out).toContain('class="pace"');              // today marker on the Spent so far bar
    expect(out).toContain('of September’s');
    expect(out).toContain('by the 13th');
    expect(out).not.toContain('Search transactions');
  });
  it('the 4 boxes, pace graph and Day by day are no longer on Home', () => {
    const out = html();
    expect(out).not.toContain('class="boxes"');
    expect(out).not.toContain('Day by day');
    expect(out).not.toContain('pace-chart');
  });
  it('page order: balance, shortcuts, Spent so far, cash flow, Where it went', () => {
    const out = html();
    const at = (x) => out.indexOf(x);
    expect(at('balance-card')).toBeLessThan(at('class="shortcuts"'));
    expect(at('class="shortcuts"')).toBeLessThan(at('spent-card'));
    expect(at('spent-card')).toBeLessThan(at('flow-card'));
    expect(at('flow-card')).toBeLessThan(at('where-card'));
  });
  it('has no transaction list on Home', () => {
    const out = html();
    expect(out).not.toContain('Recent');
    expect(out).not.toContain('class="txn');
  });
  it('a past month: no rent warning, no today marker', () => {
    const out = html({ month: '2026-09' });
    expect(out).not.toContain('Rent due');
    expect(out).not.toContain('class="pace"');
    expect(out).toContain('Spent in September');
    expect(out).toContain('Nothing earlier to compare with yet.');
  });
  it('a month with nothing in it still draws', () => {
    const out = html({ txns: [t('2026-10-01', 500000, 'job-income', { kind: 'income' })] });
    expect(out).toContain('No spending yet this month.');
    expect(out).toContain('Nothing earlier to compare with yet.');
  });
  it('cash flow wording A: over 100% says how much more was spent than came in; nothing in says so', () => {
    const over = html({ txns: [t('2026-10-01', 295, 'interest', { kind: 'income' }), t('2026-10-03', -961700, 'shopping')] });
    expect(over).toContain('Spent $9,614.05 more than came in');
    expect(over).not.toContain('of what came in');
    const none = html({ txns: [t('2026-10-03', -2500, 'shopping')] });
    expect(none).toContain('No money in yet this month');
  });
  it('shows the welcome card when there are no transactions', () => {
    expect(html({ txns: [] })).toContain('Start with your bank history');
  });
});
