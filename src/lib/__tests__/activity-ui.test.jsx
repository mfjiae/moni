// Render check: Activity draws the filter panel, the totals line (S2) and day groups. Fake data only.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Activity from '../../components/Activity.jsx';
import TxnRow from '../../components/TxnRow.jsx';

const t = (date, cents, kind, categoryId, description = 'FAKE SHOP') => ({
  uid: `${date}|${cents}|${description}`, date, amountCents: cents, kind, categoryId, description, source: 'csv',
});
const txns = [
  t('2026-10-22', -3412, 'spend', 'groceries', 'FAKEMART'),
  t('2026-10-20', 61240, 'income', 'job-income', 'FAKE PAYROLL'),
  t('2026-10-19', -20000, 'saving', 'saving', 'Transfer to xx2066 NetBank'),
  t('2026-10-18', -2500, 'review', null, 'Transfer To PayID'),
];
const noop = () => {};
const html = (over = {}) => renderToStaticMarkup(
  <Activity txns={txns} today="2026-10-24" preset="all" presetKey={null} onOpen={noop} onToast={noop} {...over} />,
);

describe('Activity', () => {
  it('shows filters, totals in and out, and hides savings transfers by default', () => {
    const out = html();
    for (const s of ['Date range', 'Type', 'Category', 'Status', 'Amount', 'To sort only']) expect(out).toContain(s);
    expect(out).toContain('<strong>3</strong>');
    expect(out).toContain('transactions<');
    expect(out).toContain('$612.40');      // in
    expect(out).toContain('$59.12');       // out: 34.12 + 25.00
    expect(out).not.toContain('To savings');
    expect(out).toContain('Showing everything except savings transfers');
  });
  it('Home’s to-sort pill opens it with only the To sort items', () => {
    const out = html({ preset: 'review', presetKey: 1 });
    expect(out).toContain('<strong>1</strong>');
    expect(out).toContain('transaction<');
    expect(out).toContain('To sort only');
    expect(out).toContain('Re-sort with latest rules');
    expect(out).not.toContain('FAKEMART');
  });
  it('rows call it "To sort" and drop the card tail from the name', () => {
    const row = renderToStaticMarkup(<TxnRow t={t('2026-10-06', -3400, 'review', null, 'FAKEAI SUB CA USA Card xx1111 AUD 34.00 Value Date: 04/10/2026')} onOpen={noop} />);
    expect(row).toContain('To sort');
    expect(row).toContain('FAKEAI SUB CA USA<');
    expect(row).not.toContain('xx1111');
  });
});
