// Render check for the detail pages' "vs last month" line and the account ranges. Fake data only.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Detail from '../../components/Detail.jsx';

const t = (date, cents, categoryId, kind, extra = {}) => ({
  uid: `${date}|${cents}|${categoryId}`, date, amountCents: cents, kind, categoryId, description: 'FAKE', source: 'csv', ...extra,
});
const txns = [
  t('2026-09-02', -10000, 'groceries', 'spend'), t('2026-09-20', -30000, 'eating-out', 'spend'),
  t('2026-09-05', -5000, 'investing', 'investing'), t('2026-09-25', -2000, 'investing', 'investing'),
  t('2026-09-03', 100000, 'job-income', 'income'),
  t('2026-10-03', -8000, 'groceries', 'spend'), t('2026-10-05', -5000, 'investing', 'investing'),
  t('2026-10-01', 300000, 'job-income', 'income'), t('2026-10-04', -20000, 'saving', 'saving'),
];
const noop = () => {};
const html = (name, over = {}) => renderToStaticMarkup(
  <Detail page={{ name }} txns={txns} today="2026-10-13" month="2026-10" setMonth={noop} firstMonth="2026-09"
    balance={{ cents: 5000, asOf: '2026-10-12' }} onBack={noop} onOpen={noop} {...over} />);

describe('Detail "vs last month" line', () => {
  it('spending: percent against the same day last month', () => {
    const out = html('spending');
    expect(out).toContain('13% less than September (by the 13th)');   // 130 now vs 150 by the 13th
  });
  it('income, saved and invested show it too', () => {
    expect(html('income')).toContain('% more than September');         // 3000 vs 1000
    expect(html('invested')).toContain('Same as September');   // 50 vs 50
    expect(html('saved')).toContain('than September');
  });
  it('a past month compares the whole month only', () => {
    const out = html('spending', { today: '2026-11-05' });   // viewing October from November
    expect(out).not.toContain('(by the');
    expect(out).toContain('72% less than September');         // 130 vs 470
  });
  it('says so when last month is empty', () => {
    expect(html('spending', { month: '2026-09' })).toContain('Nothing in August to compare with yet.');
  });
  it('spending page has the line chart, the Where it went link and Day by day', () => {
    const out = html('spending');
    expect(out).toContain('pace-chart');
    expect(out).toContain('Where it went');
    expect(out).toContain('Day by day');
    expect(out.match(/class="cal-day /g).length).toBeGreaterThanOrEqual(31);
  });
  it('income, saved and invested have 6 mini bars', () => {
    for (const n of ['income', 'saved', 'invested']) expect(html(n).match(/class="mini-col/g)).toHaveLength(6);
  });
  it('account page has 1W, 1M and 6M', () => {
    const out = html('account');
    expect(out).toContain('>1W<');
    expect(out).toContain('>1M<');
    expect(out).toContain('>6M<');
  });
});

describe('Spending opened from a Home category', () => {
  const mk = (category) => html('spending', {
    page: { name: 'spending', category },
    txns: [t('2026-10-03', -8000, 'groceries', 'spend', { description: 'FAKE GROCER' }),
           t('2026-10-04', -3000, 'eating-out', 'spend', { description: 'FAKE CAFE' })],
  });
  it('lists only that category\'s transactions, with a chip to clear it', () => {
    const out = mk('groceries');
    expect(out).toContain('Clear filter');
    expect(out).toContain('FAKE GROCER');
    expect(out).not.toContain('FAKE CAFE');
  });
  it('without a category it lists everything', () => {
    const out = mk(undefined);
    expect(out).toContain('FAKE GROCER');
    expect(out).toContain('FAKE CAFE');
  });
});
