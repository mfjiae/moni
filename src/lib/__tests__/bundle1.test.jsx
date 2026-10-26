// UI bundle 1 (Ken, 26 Oct 2026): Tuition pill and chip order on Bills, exact dates on "later" rows,
// Top 6 + more category chips on Spending. Fake data only.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Bills from '../../components/Bills.jsx';
import Detail from '../../components/Detail.jsx';

const noop = () => {};
const TODAY = '2026-10-26';

const tuitionTxn = { uid: 'tu1', date: '2026-08-13', amountCents: -1935598, kind: 'spend', categoryId: 'tuition', description: 'FAKE UNI BPAY', source: 'csv' };
const insurance = { uid: 'bill|FAKEINS', name: 'Fake insurance', cents: 50000, every: 'halfyearly', anchor: '2026-08-10', since: '2026-08-10', categoryId: 'insurance', key: 'FAKEINS' };
const tuitionBill = { uid: 'bill|cat:tuition', name: 'Tuition', cents: 1935598, every: 'halfyearly', anchor: '2026-08-13', since: '2026-08-13', categoryId: 'tuition', key: 'cat:tuition' };
const weeklyBill = { uid: 'bill|FAKEWEEK', name: 'Fake weekly', cents: 1000, every: 'weekly', anchor: '2026-10-28', since: '2026-10-07', categoryId: 'utilities', key: 'FAKEWEEK' };

const bills = (props = {}) => renderToStaticMarkup(
  <Bills txns={[]} bills={[]} today={TODAY} usage={{}} onDetail={noop} onToast={noop} {...props} />);

describe('Bills page', () => {
  it('filter chips run shortest rhythm first', () => {
    const out = bills();
    const at = (s) => out.indexOf(`>${s}<`);
    expect(at('All')).toBeGreaterThan(-1);
    expect(at('All')).toBeLessThan(at('Fortnightly'));
    expect(at('Fortnightly')).toBeLessThan(at('Monthly'));
    expect(at('Monthly')).toBeLessThan(at('Half-yearly'));
  });
  it('Weekly sits between All and Fortnightly when a weekly bill exists', () => {
    const out = bills({ bills: [weeklyBill] });
    const at = (s) => out.indexOf(`>${s}<`);
    expect(at('All')).toBeLessThan(at('Weekly'));
    expect(at('Weekly')).toBeLessThan(at('Fortnightly'));
  });
  it('shows the Tuition pill only when there is tuition', () => {
    expect(bills()).not.toContain('Tuition ›');
    const out = bills({ txns: [tuitionTxn] });
    expect(out).toContain('Tuition ›');
    expect(out).toContain('+ Add bill');
  });
  it('"later" rows show the exact date and distance, except Tuition (month only)', () => {
    const out = bills({ txns: [tuitionTxn], bills: [insurance, tuitionBill] });
    expect(out).toContain('in 107 days');            // Wed 10 Feb 2027 from Mon 26 Oct 2026
    expect(out).toContain('Mar 2027 · later');       // Tuition keeps the month only (UTS rule, bundle 2)
    // the insurance row must not fall back to month-only
    const row = out.slice(out.indexOf('Fake insurance') - 400, out.indexOf('Fake insurance'));
    expect(row).not.toContain('2027 · later');
  });
});

describe('Spending category chips (Top 6 + more)', () => {
  const cats = ['groceries', 'eating-out', 'shopping', 'entertainment', 'health', 'sport', 'gifts', 'utilities'];
  // Biggest first: groceries is the biggest, utilities the smallest.
  const txns = cats.map((c, i) => ({
    uid: `s${i}`, date: '2026-10-05', amountCents: -(10000 - i * 1000), kind: 'spend', categoryId: c, description: 'FAKE', source: 'csv',
  }));
  const spending = (page = { name: 'spending' }) => renderToStaticMarkup(
    <Detail page={page} txns={txns} today={TODAY} month="2026-10" setMonth={noop} firstMonth="2026-10"
      balance={{ cents: 5000, asOf: '2026-10-12' }} onBack={noop} onOpen={noop} onDetail={noop} />);
  const extras = (out) => (out.match(/cat-chip[^"]*\bextra\b/g) ?? []).length;

  it('marks everything past the sixth chip as extra and offers "+2 more"', () => {
    const out = spending();
    expect(extras(out)).toBe(2);
    expect(out).toContain('+2 more');
    expect(out).toContain('cat-more');
  });
  it('a picked category outside the top 6 stays visible', () => {
    const out = spending({ name: 'spending', category: 'utilities' });
    expect(extras(out)).toBe(1);        // gifts is still hidden, utilities is picked
    expect(out).toContain('+1 more');
  });
  it('no "more" chip when every category fits in six', () => {
    const few = txns.slice(0, 5);
    const out = renderToStaticMarkup(
      <Detail page={{ name: 'spending' }} txns={few} today={TODAY} month="2026-10" setMonth={noop} firstMonth="2026-10"
        balance={{ cents: 5000, asOf: '2026-10-12' }} onBack={noop} onOpen={noop} onDetail={noop} />);
    expect(out).not.toContain('cat-more');
    expect(extras(out)).toBe(0);
  });
});
