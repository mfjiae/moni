// Edit a typed entry (Ken, 4 Nov 2026): description, date, amount and Money out / in on the transaction sheet.
// Fake merchants and amounts only. The database write (`editTyped` in store.js) is a thin wrapper around
// `typedEditChanges`, which is tested here.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { canEditTyped, typedEditChanges, MAX_DESC, typedStatus } from '../typed.js';
import TxnSheet from '../../components/TxnSheet.jsx';

const noop = () => {};
const typed = (extra = {}) => ({ uid: 'm1', source: 'manual', date: '2026-11-04', postedDate: '2026-11-04', amountCents: -550, description: 'Coffee', rawDescription: 'Coffee', kind: 'spend', categoryId: 'eating-out', createdAt: 1, updatedAt: 1, ...extra });
const bankRow = { uid: 'csv|1', source: 'csv', date: '2026-11-03', postedDate: '2026-11-03', amountCents: -6420, description: 'FAKE GROCER SYDNEY NS AUS Card xx1111', kind: 'spend', categoryId: 'groceries', updatedAt: 1 };
const sheet = (txn) => renderToStaticMarkup(<TxnSheet txn={txn} usage={{}} onClose={noop} onToast={noop} />);
const TODAY = '2026-11-04';

describe('Which rows can be edited', () => {
  it('only entries typed by hand', () => {
    expect(canEditTyped(typed())).toBe(true);
    expect(canEditTyped(typed({ cash: true }))).toBe(true);
    expect(canEditTyped(bankRow)).toBe(false);
    expect(canEditTyped(typed({ shot: true }))).toBe(false);
    expect(canEditTyped(typed({ transfer: true, kind: 'saving' }))).toBe(false);
  });
  it('refuses to change a bank row', () => {
    expect(() => typedEditChanges(bankRow, { description: 'x', date: TODAY, amountCents: -100 }, TODAY)).toThrow(/typed/);
  });
});

describe('typedEditChanges', () => {
  it('changes description, date and amount, keeping date and postedDate equal', () => {
    const c = typedEditChanges(typed(), { description: '  Flat   white ', date: '2026-11-03', amountCents: -620 }, TODAY);
    expect(c).toEqual({ description: 'Flat white', rawDescription: 'Flat white', date: '2026-11-03', postedDate: '2026-11-03', amountCents: -620 });
  });
  it('is integer cents: the sign comes from the caller, never a float', () => {
    const c = typedEditChanges(typed(), { description: 'Gift', date: TODAY, amountCents: 5000 }, TODAY);
    expect(c.amountCents).toBe(5000);
    expect(Number.isInteger(c.amountCents)).toBe(true);
  });
  it.each([
    [{ description: '   ', date: TODAY, amountCents: -100 }, /description/i],
    [{ description: 'x'.repeat(MAX_DESC + 1), date: TODAY, amountCents: -100 }, /under/],
    [{ description: 'ok', date: TODAY, amountCents: 0 }, /amount/i],
    [{ description: 'ok', date: TODAY, amountCents: NaN }, /amount/i],
    [{ description: 'ok', date: TODAY, amountCents: 12.5 }, /amount/i],
    [{ description: 'ok', date: '', amountCents: -100 }, /date/i],
    [{ description: 'ok', date: '2026-11-05', amountCents: -100 }, /future/],
  ])('rejects %j', (fields, msg) => {
    expect(() => typedEditChanges(typed(), fields, TODAY)).toThrow(msg);
  });
  it('a new description drops an old nickname; the same description keeps it', () => {
    const t = typed({ nickname: 'Corner shop' });
    expect(typedEditChanges(t, { description: 'Bakery', date: TODAY, amountCents: -550 }, TODAY)).toHaveProperty('nickname', undefined);
    expect(typedEditChanges(t, { description: 'Coffee', date: TODAY, amountCents: -600 }, TODAY)).not.toHaveProperty('nickname');
  });
  it('a cash purchase switched to Money in is no longer cash', () => {
    const c = typedEditChanges(typed({ cash: true }), { description: 'Refund', date: TODAY, amountCents: 800 }, TODAY);
    expect(c.cash).toBe(false);
    expect(typedEditChanges(typed({ cash: true }), { description: 'Stall', date: TODAY, amountCents: -900 }, TODAY)).not.toHaveProperty('cash');
  });
  it('moving the date changes pending vs manual, which is worked out from dates, never stored', () => {
    const asOf = '2026-11-04';
    expect(typedStatus(typed(), asOf)).toBe('pending');
    const c = typedEditChanges(typed(), { description: 'Coffee', date: '2026-10-20', amountCents: -550 }, TODAY);
    expect(typedStatus(typed(c), asOf)).toBe('manual');
    expect(c).not.toHaveProperty('typed');
  });
});

describe('Transaction sheet', () => {
  it('shows editable amount, description, date and Money out / in for a typed entry', () => {
    const out = sheet(typed());
    expect(out).toContain('Money out');
    expect(out).toContain('Money in');
    expect(out).toContain('Amount (AUD)');
    expect(out).toContain('Description');
    expect(out).toContain('type="date"');
    expect(out).toContain('value="5.50"');
    expect(out).toContain('value="Coffee"');
    expect(out).toContain('also changes what moni matches');
    expect(out).not.toContain('Shown as');
  });
  it('keeps the old read-only top for a bank row', () => {
    const out = sheet(bankRow);
    expect(out).not.toContain('Amount (AUD)');
    expect(out).not.toContain('type="date"');
    expect(out).toContain('Shown as');
    expect(out).toContain('detail-amount');
  });
  it('keeps the read-only top for screenshot rows and typed transfers', () => {
    for (const t of [typed({ shot: true }), typed({ transfer: true, kind: 'saving', categoryId: 'saving', description: 'Transfer to xx2066' })]) {
      const out = sheet(t);
      expect(out).not.toContain('Amount (AUD)');
      expect(out).toContain('detail-amount');
    }
  });
  it('a typed Money in entry shows no Paid with cash switch; a Money out one does', () => {
    expect(sheet(typed({ amountCents: 5000, kind: 'income', categoryId: 'income' }))).not.toContain('Paid with cash');
    expect(sheet(typed())).toContain('Paid with cash');
  });
});
