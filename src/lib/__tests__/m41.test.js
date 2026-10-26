// M4.1 (Ken, 25 Oct 2026): typed transfers between Smart Access and a saver, and the balance estimates.
import { describe, it, expect } from 'vitest';
import { transferRow, estimateBalances, estimateChip, countedView } from '../accounts.js';
import { prepareImport } from '../importer.js';
import { DEFAULT_RULES } from '../rules.js';

const manualTransfer = (o) => ({
  uid: o.uid ?? 'm1', source: 'manual', transfer: true, kind: 'saving', categoryId: 'saving',
  date: o.date, postedDate: o.date, amountCents: o.amountCents, description: o.description, note: o.note ?? '',
});
const csv = (o) => ({ uid: o.uid, source: 'csv', kind: o.kind ?? 'saving', categoryId: o.kind ?? 'saving', account: o.account, date: o.date, postedDate: o.date, amountCents: o.amountCents, description: o.description });

describe('transferRow', () => {
  it('stores the Smart Access side of the transfer', () => {
    expect(transferRow({ from: 'xx2066', to: 'xx6193', cents: 20000 })).toEqual({ amountCents: 20000, description: 'Transfer from xx2066', saver: 'xx2066' });
    expect(transferRow({ from: 'xx6193', to: 'xx2103', cents: 5000 })).toEqual({ amountCents: -5000, description: 'Transfer to xx2103', saver: 'xx2103' });
  });
  it('refuses same account, saver to saver and bad amounts', () => {
    expect(() => transferRow({ from: 'xx6193', to: 'xx6193', cents: 100 })).toThrow(/different/);
    expect(() => transferRow({ from: 'xx2066', to: 'xx2103', cents: 100 })).toThrow(/Smart Access/);
    expect(() => transferRow({ from: 'xx2066', to: 'xx6193', cents: 0 })).toThrow(/amount/);
  });
});

describe('importing over a typed transfer', () => {
  const row = (o) => ({ date: o.date, postedDate: o.date, amountCents: o.amountCents, description: o.description, rawDescription: o.description, balanceCents: 0, importKey: o.key });
  it('the Smart Access bank row replaces the typed transfer (no double count)', () => {
    const typed = manualTransfer({ date: '2026-10-25', amountCents: 20000, description: 'Transfer from xx2066', note: 'rent top-up' });
    const plan = prepareImport([row({ date: '2026-10-26', amountCents: 20000, description: 'Transfer from xx2066 NetBank', key: 'k1' })], { manualTxns: [typed], rules: DEFAULT_RULES });
    expect(plan.mergedManualIds).toEqual(['m1']);
    expect(plan.toAdd[0]).toMatchObject({ kind: 'saving', categoryId: 'saving', note: 'rent top-up' });
  });
  it('a typed transfer never swallows a purchase of the same amount, or a transfer to the other saver', () => {
    const typed = manualTransfer({ date: '2026-10-25', amountCents: -5000, description: 'Transfer to xx2066' });
    const plan = prepareImport([
      row({ date: '2026-10-25', amountCents: -5000, description: 'WOOLWORTHS 1234 SYDNEY', key: 'k1' }),
      row({ date: '2026-10-25', amountCents: -5000, description: 'Transfer to xx2103 NetBank', key: 'k2' }),
    ], { manualTxns: [typed], rules: DEFAULT_RULES });
    expect(plan.mergedManualIds).toEqual([]);
  });
  it('a typed purchase never swallows a transfer row', () => {
    const typed = { uid: 'p1', source: 'manual', kind: 'spend', categoryId: 'groceries', date: '2026-10-25', amountCents: -5000, description: 'Shop' };
    const plan = prepareImport([row({ date: '2026-10-25', amountCents: -5000, description: 'Transfer to xx2066 NetBank', key: 'k1' })], { manualTxns: [typed], rules: DEFAULT_RULES });
    expect(plan.mergedManualIds).toEqual([]);
  });
  it('a saver CSV leaves the typed transfer alone (it is matched instead)', () => {
    const typed = manualTransfer({ date: '2026-10-25', amountCents: -5000, description: 'Transfer to xx2066' });
    const plan = prepareImport([row({ date: '2026-10-25', amountCents: 5000, description: 'Transfer from xx6193', key: 'k1' })], { manualTxns: [typed], rules: DEFAULT_RULES, account: 'xx2066' });
    expect(plan.mergedManualIds).toEqual([]);
  });
});

describe('estimateBalances', () => {
  const main = { cents: 245, asOf: '2026-10-24' };
  const savers = { xx2066: { cents: 324849, asOf: '2026-10-21' }, xx2103: null };

  it('a typed $200 saver -> Smart Access transfer moves both balances, counted once', () => {
    const all = [manualTransfer({ date: '2026-10-25', amountCents: 20000, description: 'Transfer from xx2066' })];
    const e = estimateBalances(all, main, savers);
    expect(e.main).toMatchObject({ cents: 20245, typed: 1, other: 0 });
    expect(e.savers.xx2066).toMatchObject({ cents: 304849, typed: 1, other: 0 });
    expect(e.savers.xx2103).toBeNull();
    expect(estimateChip(e.main)).toBe('+1 typed');
    // Counted once: one saving row in what moni totals
    expect(countedView(all).filter((t) => t.kind === 'saving')).toHaveLength(1);
  });

  it('once the saver CSV has the twin, the saver estimate goes away (the bank balance has it)', () => {
    const all = [
      manualTransfer({ date: '2026-10-25', amountCents: 20000, description: 'Transfer from xx2066' }),
      csv({ uid: 's1', account: 'xx2066', date: '2026-10-25', amountCents: -20000, description: 'Transfer to xx6193' }),
    ];
    const e = estimateBalances(all, main, { xx2066: { cents: 304849, asOf: '2026-10-25' } });
    expect(e.savers.xx2066).toMatchObject({ cents: 304849, extra: 0 });
    expect(estimateChip(e.savers.xx2066)).toBeNull();
    expect(e.main).toMatchObject({ cents: 20245, typed: 1 });
    expect(countedView(all).filter((t) => t.kind === 'saving')).toHaveLength(1);
  });

  it('Smart Access CSV only: its transfer to the saver moves the saver balance until the saver CSV arrives', () => {
    const all = [csv({ uid: 'c1', date: '2026-10-23', amountCents: -10000, description: 'Transfer to xx2066 NetBank' })];
    const e = estimateBalances(all, main, savers);
    expect(e.main.cents).toBe(245); // already in the Smart Access bank balance
    expect(e.savers.xx2066).toMatchObject({ cents: 334849, other: 1 });
    expect(estimateChip(e.savers.xx2066)).toBe('estimate');
  });

  it('saver CSV only: its transfer to Smart Access moves the Smart Access balance', () => {
    const all = [csv({ uid: 's1', account: 'xx2066', date: '2026-10-25', amountCents: -30000, description: 'Transfer to xx6193' })];
    const e = estimateBalances(all, main, { xx2066: { cents: 294849, asOf: '2026-10-25' } });
    expect(e.main).toMatchObject({ cents: 30245, other: 1 });
    expect(e.savers.xx2066.cents).toBe(294849);
  });

  it('bank rows on or before the balance date are already in it; a typed one ON that day counts (M5 fix)', () => {
    const all = [
      manualTransfer({ date: '2026-10-24', amountCents: 20000, description: 'Transfer from xx2066' }),
      csv({ uid: 'c1', date: '2026-10-20', amountCents: -10000, description: 'Transfer to xx2066 NetBank' }),
    ];
    const e = estimateBalances(all, main, savers);
    expect(e.main.cents).toBe(245 + 20000);   // Ken, 25 Oct 2026: same-day typed entries move the balance
    expect(e.savers.xx2066.cents).toBe(324849 - 20000); // the typed one is after the saver's 21 Oct balance
  });

  it('no bank balance yet = null', () => {
    expect(estimateBalances([], null, {}).main).toBeNull();
  });
});
