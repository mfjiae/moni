// UI bundle 2 (Ken, 26 Oct 2026): typed entries vs the bank. Matching on import (one candidate merges,
// two or more or a near-miss asks), answering a question, pending vs manual, and the balance never moving
// because of an import or an answer. Fake merchants and sample amounts only.
import { describe, it, expect } from 'vitest';
import { prepareImport, nextBalance } from '../importer.js';
import { estimateBalances, countedView } from '../accounts.js';
import { DEFAULT_RULES } from '../rules.js';
import { typedStatus, isNear, planResolve, openConfirms, markTyped, MATCH_DAYS } from '../typed.js';

const typed = (uid, date, cents, extra = {}) => ({
  uid, date, postedDate: date, amountCents: cents, description: extra.description ?? 'Coffee', source: 'manual',
  kind: 'spend', categoryId: 'eating-out', note: '', updatedAt: 1, ...extra,
});
let k = 0;
// A NetBank row as parseNetBankCsv gives it (balanceCents = running balance after the row).
const bankRow = (date, cents, balanceCents, description = 'FAKE CAFE SYDNEY') => ({
  importKey: `k${++k}|${date}|${cents}`, date, postedDate: date, amountCents: cents, description, rawDescription: description, balanceCents,
});

// Import rows into a list of stored transactions the way store.js does.
function importInto(all, rows, balance) {
  const plan = prepareImport(rows, { existingKeys: new Set(all.map((t) => t.importKey).filter(Boolean)), manualTxns: all.filter((t) => t.source === 'manual'), rules: DEFAULT_RULES, now: 2 });
  const merged = new Set(plan.mergedManualIds);
  return { all: [...all.filter((t) => !merged.has(t.uid)), ...plan.toAdd], plan, balance: nextBalance(rows, balance) };
}
function answer(all, bankUid, typedUid) {
  const { updates, deletes } = planResolve(all, bankUid, typedUid);
  const gone = new Set(deletes);
  const ch = new Map(updates.map((u) => [u.uid, u.changes]));
  return all.filter((t) => !gone.has(t.uid)).map((t) => (ch.has(t.uid) ? { ...t, ...ch.get(t.uid) } : t));
}
const shown = (all, balance) => estimateBalances(all, balance, {}).main.cents;
const spent = (all) => countedView(all).filter((t) => t.kind === 'spend' || t.kind === 'review').reduce((a, t) => a - t.amountCents, 0);

const start = { key: 'balance', cents: 5000, asOf: '2026-10-23' };   // $50.00 in the bank on Fri 23 Oct

describe('status', () => {
  it('pending until the CSV is 4 days past it, then manual', () => {
    expect(MATCH_DAYS).toBe(4);
    expect(typedStatus(typed('a', '2026-10-22', -480), '2026-10-26')).toBe('pending');
    expect(typedStatus(typed('a', '2026-10-21', -480), '2026-10-26')).toBe('manual');
    expect(typedStatus({ source: 'csv' }, '2026-10-26')).toBe(null);
    expect(typedStatus(typed('a', '2026-01-01', -480), null)).toBe('pending');   // no CSV yet
  });
  it('near-miss: 10% or $2, whichever is bigger, same direction only', () => {
    expect(isNear(-500, -520)).toBe(true);
    expect(isNear(-500, -700)).toBe(true);       // $2 floor
    expect(isNear(-500, -701)).toBe(false);
    expect(isNear(-10000, -10900)).toBe(true);   // 10% of $100
    expect(isNear(-10000, -11100)).toBe(false);
    expect(isNear(-500, -500)).toBe(false);      // exact is not a near-miss
    expect(isNear(-500, 520)).toBe(false);
  });
  it('lists mark typed rows pending or manual', () => {
    const out = markTyped([typed('a', '2026-10-25', -480), typed('b', '2026-10-01', -480), { uid: 'c', source: 'csv' }], '2026-10-26');
    expect(out.map((t) => t.typed)).toEqual(['pending', 'manual', undefined]);
  });
});

describe('one matching typed entry: merged automatically (as since M2)', () => {
  it('replaces the typed entry, keeps its category, balance and spending unchanged', () => {
    const before = [typed('c1', '2026-10-24', -480, { note: 'flat white' })];
    const balBefore = shown(before, start);
    const { all, plan, balance } = importInto(before, [bankRow('2026-10-25', -480, 4520)], start);
    expect(plan.mergedManualIds).toEqual(['c1']);
    expect(plan.confirms).toBe(0);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ source: 'csv', categoryId: 'eating-out', note: 'flat white' });
    expect(shown(all, balance)).toBe(balBefore);   // 4520 either way
    expect(balBefore).toBe(4520);
  });
  it('a typed entry more than 4 days away is not matched', () => {
    const { plan } = importInto([typed('c1', '2026-10-18', -480)], [bankRow('2026-10-25', -480, 4520)], start);
    expect(plan.mergedManualIds).toEqual([]);
    expect(plan.confirms).toBe(0);
  });
});

describe('two identical typed entries: moni asks which one', () => {
  const before = [typed('c1', '2026-10-24', -480), typed('c2', '2026-10-25', -480)];
  const imported = importInto(before, [bankRow('2026-10-26', -480, 4520)], start);

  it('adds the bank row with a question instead of guessing', () => {
    expect(imported.plan.mergedManualIds).toEqual([]);
    expect(imported.plan.confirms).toBe(1);
    const row = imported.all.find((t) => t.source === 'csv');
    expect(row.confirm).toEqual({ ids: ['c1', 'c2'], near: false });
    expect(openConfirms(imported.all)).toHaveLength(1);
  });
  it('the balance and spending do not move while the question is open', () => {
    expect(shown(before, start)).toBe(4040);               // 50.00 - 4.80 - 4.80
    expect(shown(imported.all, imported.balance)).toBe(4040);
    expect(spent(before)).toBe(960);
    expect(spent(imported.all)).toBe(960);                 // the bank row waits; it isn't counted on top
  });
  it('picking one merges it; the other stays typed; still no change', () => {
    const row = imported.all.find((t) => t.source === 'csv');
    const after = answer(imported.all, row.uid, 'c1');
    expect(after.map((t) => t.uid).sort()).toEqual(['c2', row.uid].sort());
    expect(after.find((t) => t.uid === row.uid)).toMatchObject({ confirm: null, categoryId: 'eating-out' });
    expect(openConfirms(after)).toHaveLength(0);
    expect(shown(after, imported.balance)).toBe(4040);
    expect(spent(after)).toBe(960);
  });
  it('"Neither" keeps both and the bank row starts counting', () => {
    const row = imported.all.find((t) => t.source === 'csv');
    const after = answer(imported.all, row.uid, null);
    expect(after).toHaveLength(3);
    expect(openConfirms(after)).toHaveLength(0);
    expect(shown(after, imported.balance)).toBe(4520 - 960);   // you said they are different purchases
  });
  it('deleting the typed entries yourself closes the question', () => {
    const left = imported.all.filter((t) => t.source !== 'manual');
    expect(openConfirms(left)).toHaveLength(0);
    expect(shown(left, imported.balance)).toBe(4520);
  });
});

describe('two bank rows for two identical typed entries', () => {
  it('asks once per bank row; answering one merges the other automatically', () => {
    const before = [typed('c1', '2026-10-24', -480), typed('c2', '2026-10-25', -480)];
    const { all, plan, balance } = importInto(before, [bankRow('2026-10-26', -480, 4040), bankRow('2026-10-25', -480, 4520)], start);
    expect(plan.confirms).toBe(2);
    expect(shown(all, balance)).toBe(shown(before, start));
    const first = openConfirms(all)[0].row;
    const after = answer(all, first.uid, 'c2');
    expect(after.filter((t) => t.source === 'manual')).toHaveLength(0);   // the second question had one answer left
    expect(openConfirms(after)).toHaveLength(0);
    expect(shown(after, balance)).toBe(4040);
  });
  it('never asks more questions than there are typed entries to answer with', () => {
    const before = [typed('c1', '2026-10-24', -480)];
    const rows = [bankRow('2026-10-25', -480, 4040), bankRow('2026-10-25', -480, 4520)];
    const { plan } = importInto([...before, typed('c2', '2026-10-25', -480)], [...rows, bankRow('2026-10-25', -480, 3560)], start);
    expect(plan.confirms).toBe(2);   // 3 bank rows, 2 typed entries: the third row just counts
  });
});

describe('near-miss amounts: moni asks "is this the same?"', () => {
  const before = [typed('c1', '2026-10-24', -500)];
  const imported = importInto(before, [bankRow('2026-10-25', -520, 4480)], start);
  it('asks, and keeps the balance and spending where they were', () => {
    const row = imported.all.find((t) => t.source === 'csv');
    expect(row.confirm).toEqual({ ids: ['c1'], near: true });
    expect(shown(imported.all, imported.balance)).toBe(shown(before, start));
    expect(spent(imported.all)).toBe(500);
  });
  it('yes = the bank amount wins and the typed one goes', () => {
    const row = imported.all.find((t) => t.source === 'csv');
    const after = answer(imported.all, row.uid, 'c1');
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ amountCents: -520, categoryId: 'eating-out', confirm: null });
    expect(shown(after, imported.balance)).toBe(4480);
    expect(spent(after)).toBe(520);
  });
  it('an exact match wins over a near-miss and needs no question', () => {
    const { plan } = importInto([typed('c1', '2026-10-24', -500), typed('c2', '2026-10-24', -520)], [bankRow('2026-10-25', -520, 4480)], start);
    expect(plan.mergedManualIds).toEqual(['c2']);
    expect(plan.confirms).toBe(0);
  });
  it('typed transfers only ever match exactly', () => {
    const tr = typed('t1', '2026-10-24', -5000, { transfer: true, kind: 'saving', categoryId: 'saving', description: 'Transfer to xx2066' });
    const { plan } = importInto([tr], [bankRow('2026-10-25', -5100, 0, 'Transfer to xx2066 CommBank app')], start);
    expect(plan.confirms).toBe(0);
    expect(plan.mergedManualIds).toEqual([]);
  });
});

describe('leftovers: the bank number wins once the CSV is 4 days past them', () => {
  it('cash typed in keeps counting while pending, then stops changing the balance (still in Spending)', () => {
    const cash = typed('x1', '2026-10-24', -2000, { description: 'Cash to friend' });
    expect(shown([cash], start)).toBe(3000);
    const later = { key: 'balance', cents: 5000, asOf: '2026-10-29' };   // CSV 5 days past it, nothing matched
    const est = estimateBalances([cash], later, {}).main;
    expect(est.cents).toBe(5000);
    expect(est.settled).toEqual({ count: 1, cents: -2000 });
    expect(spent([cash])).toBe(2000);
  });
  it('same-day typed entry still counts (the M5 fix)', () => {
    expect(shown([typed('a', '2026-10-23', -450)], start)).toBe(4550);
  });
});

describe('saver-side typed transfers', () => {
  it('a typed transfer to savings counts on both sides until the CSVs arrive', () => {
    const tr = typed('t1', '2026-10-24', -1000, { transfer: true, kind: 'saving', categoryId: 'saving', description: 'Transfer to xx2066' });
    const e = estimateBalances([tr], start, { xx2066: { cents: 100000, asOf: '2026-10-23' } });
    expect(e.main.cents).toBe(4000);
    expect(e.savers.xx2066.cents).toBe(101000);
    expect(e.main.items).toHaveLength(1);
    expect(e.savers.xx2066.items[0]).toMatchObject({ from: 'typed', cents: 1000 });
  });
});

describe('Tuition follows the UTS calendar (Thursday of Week 3)', async () => {
  const { dueDates } = await import('../bills.js');
  const { UTS_SESSIONS, feeDue } = await import('../uts.js');
  const { addDays } = await import('../dates.js');
  const bill = { key: 'cat:tuition', every: 'halfyearly', anchor: '2026-08-13' };
  it('due date = session start + 17 days = census - 14 days, always a Thursday', () => {
    for (const s of UTS_SESSIONS) {
      expect(feeDue(s)).toBe(addDays(s.census, -14));
      expect(new Date(`${feeDue(s)}T00:00:00Z`).getUTCDay()).toBe(4);
    }
    expect(UTS_SESSIONS.map(feeDue)).toEqual(['2026-03-05', '2026-08-13', '2027-03-04', '2027-08-12']);
  });
  it('uses the UTS dates inside the list and plain half-yearly steps outside it', () => {
    expect(dueDates(bill, '2025-07-01', '2027-12-31')).toEqual(['2025-08-13', '2026-03-05', '2026-08-13', '2027-03-04', '2027-08-12']);
    expect(dueDates(bill, '2028-01-01', '2028-03-31')).toEqual(['2028-02-13']);   // past the list: a guess
  });
  it('other half-yearly bills still step every 6 months', () => {
    expect(dueDates({ every: 'halfyearly', anchor: '2026-08-10' }, '2026-08-01', '2027-03-01')).toEqual(['2026-08-10', '2027-02-10']);
  });
});

describe('Typed only filter', async () => {
  const { spendFilter } = await import('../../components/Detail.jsx');
  const { filterTxns, EMPTY_FILTER, activeChips } = await import('../activity.js');
  const list = [
    typed('a', '2026-10-24', -480),
    { uid: 'b', date: '2026-10-24', amountCents: -1000, source: 'csv', kind: 'spend', categoryId: 'groceries', description: 'FAKEMART' },
    typed('c', '2026-10-25', -2000, { transfer: true, kind: 'saving', categoryId: 'saving', description: 'Transfer to xx2066' }),
  ];
  it('Spending: count and total follow the switch, chips still count the whole month', () => {
    const spend = list.slice(0, 2);
    const off = spendFilter(spend, []);
    const on = spendFilter(spend, [], true);
    expect([off.count, off.out]).toEqual([2, 1480]);
    expect([on.count, on.out]).toEqual([1, 480]);
    expect(on.chips.reduce((a, c) => a + c.count, 0)).toBe(2);
  });
  it('Activity: only typed entries, typed transfers included, with a removable chip', () => {
    const f = { ...EMPTY_FILTER, typed: true };
    expect(filterTxns(list, f, '2026-10-26').map((t) => t.uid)).toEqual(['c', 'a']);
    expect(filterTxns(list, EMPTY_FILTER, '2026-10-26').map((t) => t.uid)).toEqual(['a', 'b']);   // savings hidden as before
    expect(activeChips(f).map((c) => c.key)).toEqual(['typed']);
  });
});
