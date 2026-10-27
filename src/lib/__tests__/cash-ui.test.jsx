// Paid with cash, Push 1 render checks (prototype "Moni Paid With Cash" v4). Fake data only.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AddTxn from '../../components/AddTxn.jsx';
import TxnRow from '../../components/TxnRow.jsx';
import TxnSheet from '../../components/TxnSheet.jsx';
import Activity from '../../components/Activity.jsx';
import Detail from '../../components/Detail.jsx';

const noop = () => {};
const row = (t) => renderToStaticMarkup(<TxnRow t={t} onOpen={noop} />);
const sheet = (txn) => renderToStaticMarkup(<TxnSheet txn={txn} usage={{}} onClose={noop} onToast={noop} />);
const lunch = { uid: 'c1', date: '2026-10-26', amountCents: -1250, kind: 'spend', categoryId: 'eating-out', description: 'Lunch stall', source: 'manual', cash: true, typed: 'pending' };
const coffee = { uid: 't1', date: '2026-10-26', amountCents: -480, kind: 'spend', categoryId: 'eating-out', description: 'Coffee', source: 'manual', typed: 'pending' };
const deposit = { uid: 'csv|d', date: '2026-10-25', amountCents: 4000, kind: 'income', categoryId: 'family', description: 'CASH DEPOSIT CBA ATM BROADWAY A NSW', source: 'csv' };
const atm = { uid: 'csv|a', date: '2026-10-23', amountCents: -20000, kind: 'internal', categoryId: 'internal', description: 'ATM WITHDRAWAL CBA ATM BROADWAY', source: 'csv' };

describe('Add transaction', () => {
  it('Money out shows the Paid with cash switch, off, under Amount', () => {
    const out = renderToStaticMarkup(<AddTxn today="2026-10-26" usage={{}} onDone={noop} onToast={noop} />);
    expect(out).toContain('Paid with cash');
    expect(out).toContain('Off · comes out of Smart Access');
    expect(out).toContain('aria-checked="false"');
    expect(out.indexOf('Amount (AUD)')).toBeLessThan(out.indexOf('Paid with cash'));
    expect(out.indexOf('Paid with cash')).toBeLessThan(out.indexOf('Description'));
  });
});

describe('list rows', () => {
  it('a cash purchase shows only the cash tag (no typed, no manual)', () => {
    const out = row(lunch);
    expect(out).toContain('class="cash-tag">cash<');
    expect(out).not.toContain('typed-tag');
    expect(out).not.toContain('manual');
  });
  it('an ordinary typed entry keeps its typed tag', () => {
    expect(row(coffee)).toContain('typed-tag');
  });
  it('ATM withdrawal: to cash; cash deposit: cash in / own cash', () => {
    expect(row(atm)).toContain('>to cash<');
    expect(row(deposit)).toContain('cash-tag cin">cash in<');
    expect(row({ ...deposit, kind: 'internal', categoryId: 'internal' })).toContain('>own cash<');
  });
});

describe('transaction sheet', () => {
  it('a typed purchase can be switched to cash', () => {
    expect(sheet(coffee)).toContain('Paid with cash');
    expect(sheet(lunch)).toContain('aria-checked="true"');
  });
  it('bank rows and money in have no cash switch', () => {
    expect(sheet(atm)).not.toContain('Paid with cash');
    expect(sheet({ ...coffee, amountCents: 480, kind: 'income', categoryId: 'income' })).not.toContain('Paid with cash');
  });
  it('a cash deposit asks whose cash it was, with Cash someone gave me pre-picked', () => {
    const out = sheet(deposit);
    expect(out).toContain('Whose cash was this?');
    expect(out).toMatch(/aria-selected="true" class="on">Cash someone gave me/);
    expect(out).toContain('Counts as money in');
    expect(out).toContain('Cash balance'); // Push 2: the row is back
    expect(out).toContain('no change');
  });
  it('a marked own-cash deposit shows My own cash picked', () => {
    expect(sheet({ ...deposit, kind: 'internal', categoryId: 'internal' })).toMatch(/aria-selected="true" class="on">My own cash/);
  });
});

describe('filters', () => {
  it('Activity has a Cash entries only switch under Typed entries only', () => {
    const out = renderToStaticMarkup(<Activity txns={[lunch, coffee, atm]} today="2026-10-26" preset="all" presetKey={null} onOpen={noop} onToast={noop} />);
    expect(out.indexOf('Typed entries only')).toBeLessThan(out.indexOf('Cash entries only'));
  });
  it('Spending has Cash only beside Typed only', () => {
    const out = renderToStaticMarkup(<Detail page={{ name: 'spending' }} txns={[lunch, coffee]} today="2026-10-26" month="2026-10" setMonth={noop}
      firstMonth="2026-10" balance={{ cents: 5000, asOf: '2026-10-25' }} onBack={noop} onOpen={noop} />);
    expect(out.indexOf('Typed only')).toBeLessThan(out.indexOf('Cash only'));
  });
});
