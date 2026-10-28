// M4.1 render checks (Ken, 25 Oct 2026): Home lists every category, Spending chips, Transfer tab, balance chips.
// Fake data only.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Home from '../../components/Home.jsx';
import AddTxn from '../../components/AddTxn.jsx';
import { pctLabel, sliceLengths } from '../../components/charts.jsx';
import { spendFilter } from '../../components/Detail.jsx';
import { estimateBalances } from '../accounts.js';

const t = (date, cents, categoryId, extra = {}) => ({
  uid: `${date}|${cents}|${categoryId}`, date, amountCents: cents, kind: 'spend', categoryId, description: 'FAKE SHOP', source: 'csv', ...extra,
});
const noop = () => {};

describe('pctLabel and sliceLengths', () => {
  it('shows <1% instead of 0% for a small share', () => {
    expect(pctLabel(40, 10000)).toBe('<1%');
    expect(pctLabel(0, 10000)).toBe('0%');
    expect(pctLabel(800, 10000)).toBe('8%');
    expect(pctLabel(5, 0)).toBe('');
  });
  it('gives tiny slices a minimum length and keeps the circle the same size', () => {
    const lens = sliceLengths([{ cents: 9990 }, { cents: 10 }], 10000, 400, 5);
    expect(lens[1]).toBe(5);
    expect(lens[0] + lens[1]).toBeCloseTo(400);
    expect(sliceLengths([{ cents: 5000 }, { cents: 5000 }], 10000, 400, 5)).toEqual([200, 200]);
  });
});

describe('Home Where it went: every category, no "Everything else"', () => {
  const cats = ['housing', 'entertainment', 'groceries', 'eating-out', 'health', 'subscriptions', 'gifts', 'transport', 'personal-care', 'education'];
  const txns = cats.map((c, i) => t('2026-10-0' + ((i % 9) + 1), -(100000 / (i + 1) | 0), c));
  txns.push(t('2026-10-05', -30, 'fees'));
  const out = renderToStaticMarkup(<Home txns={txns} today="2026-10-13" month="2026-10" setMonth={noop} firstMonth="2026-10"
    balance={{ cents: 245, asOf: '2026-10-12' }} sync={{ token: 'x' }} onNavigate={noop} onDetail={noop} onToast={noop} />);
  it('lists all 11 categories and labels the tiny one <1%', () => {
    expect(out).not.toContain('Everything else');
    expect((out.match(/class="leg-name"/g) || []).length).toBe(11);
    expect(out).toContain('Fees &amp; interest');
    expect(out).toContain('&lt;1%');
  });
});

describe('Spending chips (S-B)', () => {
  const list = [t('2026-10-03', -8000, 'groceries'), t('2026-10-04', -3000, 'groceries'), t('2026-10-05', -12000, 'entertainment'),
    t('2026-10-06', 1000, 'groceries', { refund: true }), t('2026-10-07', -500, 'fees')];
  it('chips are biggest first with counts; picking several shows their rows and a net total', () => {
    const f = spendFilter(list, []);
    expect(f.chips.map((c) => [c.id, c.count])).toEqual([['entertainment', 1], ['groceries', 3], ['fees', 1]]);
    expect(f.count).toBe(5);
    const g = spendFilter(list, ['groceries', 'fees']);
    expect(g.count).toBe(4);
    expect(g.out).toBe(8000 + 3000 - 1000 + 500); // the refund reduces it
  });
});

describe('Add transaction: Transfer tab', () => {
  it('has Money out, Money in and Transfer', () => {
    const out = renderToStaticMarkup(<AddTxn today="2026-10-25" usage={{}} onDone={noop} onToast={noop} />);
    for (const s of ['Money out', 'Money in', 'Transfer']) expect(out).toContain(`>${s}<`);
  });
});

describe('Home balance after a typed transfer', () => {
  // UI bundle 2 (Ken, 26 Oct 2026): the "+1 typed" chip is gone; each half gets a breakdown button with a rose dot.
  it('moves both halves and shows the breakdown button with a dot on each', () => {
    const balance = { cents: 245, asOf: '2026-10-24' };
    const saverBalances = { xx2066: { cents: 324849, asOf: '2026-10-21' }, xx2103: null };
    const typed = { uid: 'm1', source: 'manual', transfer: true, kind: 'saving', categoryId: 'saving', date: '2026-10-25', postedDate: '2026-10-25',
      amountCents: 20000, description: 'Transfer from xx2066' };
    const est = estimateBalances([typed], balance, saverBalances);
    const out = renderToStaticMarkup(<Home txns={[typed, t('2026-10-20', -500, 'groceries')]} today="2026-10-25" month="2026-10" setMonth={noop} firstMonth="2026-10"
      balance={balance} saverBalances={saverBalances} est={est} sync={{ token: 'x' }} onNavigate={noop} onDetail={noop} onToast={noop} />);
    expect(out).toContain('$202.45');
    expect(out).toContain('$3,048.49');
    expect(out).not.toContain('+1 typed');
    expect((out.match(/class="bal-more"/g) || []).length).toBe(2);
    expect((out.match(/class="bal-dot"/g) || []).length).toBe(2);
  });

  // Ken, 28 Oct 2026: a Savings amount that only the Smart Access CSV knows about is also "not fully confirmed",
  // so the dot shows (it used to show for typed entries only). Smart Access has nothing waiting, so no dot there.
  it('shows the dot on Savings for an amount seen only in the other account’s CSV', () => {
    const balance = { cents: 1000, asOf: '2026-10-28' };
    const saverBalances = { xx2066: { cents: 307745, asOf: '2026-10-26' }, xx2103: null };
    const bankRow = { uid: 'csv|b1', source: 'csv', transfer: true, kind: 'saving', categoryId: 'saving', date: '2026-10-28', postedDate: '2026-10-28',
      amountCents: -74412, description: 'Transfer to xx2066 NetBank' };
    const est = estimateBalances([bankRow], balance, saverBalances);
    const out = renderToStaticMarkup(<Home txns={[bankRow]} today="2026-10-28" month="2026-10" setMonth={noop} firstMonth="2026-10"
      balance={balance} saverBalances={saverBalances} est={est} sync={{ token: 'x' }} onNavigate={noop} onDetail={noop} onToast={noop} />);
    expect(out).toContain('$3,821.57');
    expect((out.match(/class="bal-more"/g) || []).length).toBe(1);
    expect((out.match(/class="bal-dot"/g) || []).length).toBe(1);
  });
});
