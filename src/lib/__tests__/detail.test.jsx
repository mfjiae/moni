// Render check for the detail pages' "Compared with last month" card and the account ranges. Fake data only.
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

describe('Detail comparison card', () => {
  it('spending: same day and whole month, with the right numbers', () => {
    const out = html('spending');
    expect(out).toContain('Compared with September');
    expect(out).toContain('By the 13th');
    expect(out).toContain('All of September');
    expect(out).toContain('September $150.00');   // by the 13th: groceries 100 + invested 50
    expect(out).toContain('$20.00 less');          // this month 130
    expect(out).toContain('September $470.00');   // whole month: 100 + 300 + 50 + 20
    expect(out).toContain('$340.00 less');
  });
  it('income, saved and invested show it too', () => {
    for (const n of ['income', 'saved', 'invested']) expect(html(n)).toContain('Compared with September');
  });
  it('a past month compares the whole month only', () => {
    const out = html('spending', { today: '2026-11-05' });   // viewing October from November
    expect(out).not.toContain('By the 5th');
    expect(out).toContain('Whole month');
  });
  it('says so when last month is empty', () => {
    expect(html('spending', { month: '2026-09' })).toContain('Nothing in August to compare with.');
  });
  it('account page has 1W and 1M', () => {
    const out = html('account');
    expect(out).toContain('>1W<');
    expect(out).toContain('>1M<');
  });
});

describe('Spending opened from a Home category', () => {
  const mk = (category) => html('spending', {
    page: { name: 'spending', category },
    txns: [t('2026-10-03', -8000, 'groceries', 'spend', { description: 'FAKE GROCER' }),
           t('2026-10-04', -3000, 'eating-out', 'spend', { description: 'FAKE CAFE' })],
  });
  it('lists only that category\'s transactions', () => {
    const out = mk('groceries');
    expect(out).toContain('FAKE GROCER');
    expect(out).not.toContain('FAKE CAFE');
  });
  it('without a category it lists everything', () => {
    const out = mk(undefined);
    expect(out).toContain('FAKE GROCER');
    expect(out).toContain('FAKE CAFE');
  });
});
