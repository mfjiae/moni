// M2.6 accounts: guessing the account, matching transfers, counting each once, per-account balances. Fake data only.
import { describe, it, expect } from 'vitest';
import {
  MAIN, guessAccount, looksLike, pickWarning, pairTransfers, countedView, accountTxns, accountsWithData, transferOther, accountImportKey,
} from '../accounts.js';
import { parseNetBankCsv } from '../csv.js';
import { prepareImport, nextBalance } from '../importer.js';
import { DEFAULT_RULES } from '../rules.js';
import { summarizeMonth } from '../summary.js';
import { mergeSnapshots } from '../merge.js';

// Smart Access (old rows have no account field) and Saver xx2066 rows
const m = (uid, date, cents, description, extra = {}) => ({ uid, date, postedDate: date, amountCents: cents, description, source: 'csv', kind: 'spend', categoryId: 'groceries', ...extra });
const sv = (uid, date, cents, description, kind = 'saving') => ({ uid, date, postedDate: date, amountCents: cents, description, source: 'csv', account: 'xx2066', kind, categoryId: kind === 'saving' ? 'saving' : 'interest' });
const save = { kind: 'saving', categoryId: 'saving' };

const SAVER_CSV = [
  '21/10/2026,"-150.00","Transfer to xx6193 CommBank app","+300.00"',
  '21/10/2026,"+200.00","Transfer from xx6193 CommBank app","+450.00"',
  '01/10/2026,"+2.95","Credit Interest","+250.00"',
].join('\n');
const MAIN_CSV = [
  '22/10/2026,"-9.00","FAKE LAUNDRY ULTIMO AUS Card xx1111 Value Date: 19/10/2026","+11.40"',
  '21/10/2026,"+150.00","Transfer from xx2066 CommBank app","+20.40"',
].join('\n');

describe('which account a CSV is from', () => {
  it('a file of only own-account transfers and interest looks like a saver', () => {
    const saver = parseNetBankCsv(SAVER_CSV).rows;
    const main = parseNetBankCsv(MAIN_CSV).rows;
    expect(looksLike(saver)).toBe('saver');
    expect(looksLike(main)).toBe('main');
    expect(guessAccount(main)).toBe(MAIN);
    expect(guessAccount(saver)).toBe('xx2066');
  });
  it('picks the saver that already has some of these rows', () => {
    const saver = parseNetBankCsv(SAVER_CSV).rows;
    const keys = new Set([accountImportKey('xx2103', saver[1].importKey)]);
    expect(guessAccount(saver, keys)).toBe('xx2103');
  });
  it('warns when the pick does not fit the file, both ways', () => {
    const saver = parseNetBankCsv(SAVER_CSV).rows;
    const main = parseNetBankCsv(MAIN_CSV).rows;
    expect(pickWarning(saver, MAIN)).toMatch(/replace your Smart Access balance/);
    expect(pickWarning(main, 'xx2066')).toMatch(/looks like your Smart Access CSV/);
    expect(pickWarning(saver, 'xx2066')).toBeNull();
    expect(pickWarning(main, MAIN)).toBeNull();
  });
});

describe('importing a saver CSV', () => {
  it('tags rows with the account, keeps their keys apart from Smart Access, sorts transfers and interest', () => {
    const rows = parseNetBankCsv(SAVER_CSV).rows;
    const p = prepareImport(rows, { rules: DEFAULT_RULES, account: 'xx2066' });
    expect(p.toAdd.every((t) => t.account === 'xx2066' && t.importKey.startsWith('xx2066|') && t.uid.startsWith('csv|xx2066|'))).toBe(true);
    expect(p.toAdd.map((t) => t.kind)).toEqual(['saving', 'saving', 'income']);
    expect(p.toAdd[2].categoryId).toBe('interest');
    expect(p.reviewCount).toBe(0);
    // same file again: all duplicates
    const again = prepareImport(rows, { rules: DEFAULT_RULES, account: 'xx2066', existingKeys: new Set(p.toAdd.map((t) => t.importKey)) });
    expect(again.toAdd).toHaveLength(0);
  });
  it('saver rows never replace a manual Smart Access entry', () => {
    const rows = parseNetBankCsv(SAVER_CSV).rows;
    const manualTxns = [{ uid: 'man', date: '2026-10-21', amountCents: 20000, kind: 'income', categoryId: 'income', source: 'manual' }];
    expect(prepareImport(rows, { rules: DEFAULT_RULES, account: 'xx2066', manualTxns }).mergedManualIds).toEqual([]);
  });
  it('each account keeps its own balance', () => {
    const rows = parseNetBankCsv(SAVER_CSV).rows;
    expect(nextBalance(rows, null, 'xx2066')).toEqual({ key: 'balance:xx2066', cents: 30000, asOf: '2026-10-21' });
    expect(nextBalance(parseNetBankCsv(MAIN_CSV).rows, null)).toMatchObject({ key: 'balance', cents: 1140 });
  });
});

describe('matching transfers between your own accounts', () => {
  it('matches by saver, opposite amount and date (up to 2 days), one to one', () => {
    const txns = [
      m('m1', '2026-10-21', 15000, 'Transfer from xx2066 CommBank app', save),
      m('m2', '2026-10-21', -20000, 'Transfer to xx2066 CommBank app', save),
      m('m3', '2026-10-01', 5000, 'Transfer from xx2066 CommBank app', save), // no saver twin
      sv('s1', '2026-10-21', -15000, 'Transfer to xx6193 CommBank app'),
      sv('s2', '2026-10-22', 20000, 'Transfer from xx6193 CommBank app Value Date: 21/10/2026'),
      sv('s3', '2026-10-15', 9900, 'Transfer from xx6193 CommBank app'), // no Smart Access twin
    ];
    const pairs = pairTransfers(txns);
    expect(Object.fromEntries(pairs)).toEqual({ s1: 'm1', s2: 'm2' });
  });
  it('several same-amount top-ups on one day pair one to one, never twice', () => {
    const txns = [
      m('a', '2026-10-05', 5000, 'Transfer from xx2066 CommBank app', save),
      m('b', '2026-10-05', 5000, 'Transfer from xx2066 CommBank app', save),
      sv('x', '2026-10-05', -5000, 'Transfer to xx6193 CommBank app'),
      sv('y', '2026-10-05', -5000, 'Transfer to xx6193 CommBank app'),
      sv('z', '2026-10-05', -5000, 'Transfer to xx6193 CommBank app'),
    ];
    const pairs = pairTransfers(txns);
    expect(pairs.size).toBe(2);
    expect(new Set(pairs.values()).size).toBe(2);
  });
  it('does not match across 3+ days, a different saver, or the same direction', () => {
    const txns = [
      m('m1', '2026-10-01', 5000, 'Transfer from xx2066 CommBank app', save),
      m('m2', '2026-10-10', 5000, 'Transfer from xx2103 CommBank app', save),
      m('m3', '2026-10-12', -5000, 'Transfer to xx2066 CommBank app', save),
      sv('s1', '2026-10-05', -5000, 'Transfer to xx6193 CommBank app'),
      sv('s2', '2026-10-10', -5000, 'Transfer to xx6193 CommBank app'),
      sv('s3', '2026-10-12', -5000, 'Transfer to xx6193 CommBank app'),
    ];
    expect(pairTransfers(txns).size).toBe(0);
  });
  it('the closest date wins', () => {
    const txns = [
      m('far', '2026-10-03', 5000, 'Transfer from xx2066 CommBank app', save),
      m('near', '2026-10-05', 5000, 'Transfer from xx2066 CommBank app', save),
      sv('s', '2026-10-05', -5000, 'Transfer to xx6193 CommBank app'),
    ];
    expect(pairTransfers(txns).get('s')).toBe('near');
  });
});

describe('counting each transfer once', () => {
  const txns = [
    m('rent', '2026-10-06', -91600, 'Direct Debit 111 FAKE RENT', { categoryId: 'housing' }),
    m('in', '2026-10-06', 91000, 'Transfer from xx2066 CommBank app', save),
    m('out', '2026-10-14', -47000, 'Transfer to xx2066 CommBank app', save),
    sv('s-in', '2026-10-06', -91000, 'Transfer to xx6193 CommBank app'),
    sv('s-out', '2026-10-14', 47000, 'Transfer from xx6193 CommBank app'),
    sv('s-only', '2026-10-20', -2000, 'Transfer to xx6193 CommBank app'), // its Smart Access CSV isn't imported yet
    sv('int', '2026-10-01', 2295, 'Credit Interest', 'income'),
  ];
  it('keeps Smart Access rows, drops matched saver copies, turns unmatched ones round, keeps interest', () => {
    const v = countedView(txns);
    expect(v.map((t) => t.uid).sort()).toEqual(['in', 'int', 'out', 'rent', 's-only']);
    const only = v.find((t) => t.uid === 's-only');
    expect(only).toMatchObject({ amountCents: 2000, kind: 'saving', mirrored: true });
    expect(only.description).toMatch(/^Transfer from xx2066/);
    expect(transferOther(only.description)).toBe('xx2066');
  });
  it('totals: Saved = net into savings counted once, interest is income, spending untouched', () => {
    const s = summarizeMonth(countedView(txns), '2026-10');
    // into savings 470 - out of savings 910 - 20 (saver-only top-up) = -460
    expect(s.savedNet).toBe(47000 - 91000 - 2000);
    expect(s.income).toBe(2295);
    expect(s.spent).toBe(91600);
    // without matching, the saver copies would have doubled Saved
    const naive = summarizeMonth(txns.filter((t) => t.kind !== 'income' || t.account), '2026-10');
    expect(naive.savedNet).not.toBe(s.savedNet);
  });
  it('the saver-only top-up stops counting from the saver side once its twin arrives', () => {
    const withTwin = [...txns, m('twin', '2026-10-20', 2000, 'Transfer from xx2066 CommBank app', save)];
    const v = countedView(withTwin);
    expect(v.some((t) => t.uid === 's-only')).toBe(false);
    expect(summarizeMonth(v, '2026-10').savedNet).toBe(47000 - 91000 - 2000);
  });
  it('account pages see each account as its own statement', () => {
    expect(accountTxns(txns, MAIN).map((t) => t.uid)).toEqual(['rent', 'in', 'out']);
    expect(accountTxns(txns, 'xx2066')).toHaveLength(4);
    expect(accountsWithData(txns).map((a) => a.id)).toEqual(['xx6193', 'xx2066']);
  });
});

describe('sync keeps saver balances', () => {
  it('merges each account balance, newest wins; an old snapshot without balances keeps ours', () => {
    const mine = { txns: [], balance: null, balances: { xx2066: { cents: 30000, asOf: '2026-10-21', updatedAt: 2 } } };
    const theirs = { txns: [], balance: null, balances: { xx2066: { cents: 25000, asOf: '2026-10-01', updatedAt: 9 }, xx2103: { cents: 0, asOf: '2026-08-03', updatedAt: 1 } } };
    const merged = mergeSnapshots(mine, theirs);
    expect(merged.balances.xx2066.cents).toBe(30000);
    expect(merged.balances.xx2103.cents).toBe(0);
    expect(mergeSnapshots(mine, { txns: [] }).balances.xx2066.cents).toBe(30000);
  });
});
