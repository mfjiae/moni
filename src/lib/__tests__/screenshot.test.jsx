// Screenshot import (Ken, 27 Oct 2026): reading CommBank's transactions page, pasted rows, moni's guesses,
// "already in moni", and what happens when the bank CSV arrives later (always asked). Fake names only.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { headerDate, moneyCents, parsePastedRows, parseShotLines, combineShots, planShot, canConfirm, shotRecord, bankCategory } from '../screenshot.js';
import { prepareImport, nextBalance } from '../importer.js';
import { estimateBalances, countedView } from '../accounts.js';
import { DEFAULT_RULES } from '../rules.js';
import { planResolve, openConfirms, mergeFrom, markTyped } from '../typed.js';
import { filterTxns, EMPTY_FILTER } from '../activity.js';
import { spendFilter } from '../../components/Detail.jsx';
import TxnRow from '../../components/TxnRow.jsx';

const TODAY = '2026-10-27';

describe('day headings and amounts', () => {
  it('reads CommBank headings with the right year', () => {
    expect(headerDate('Mon 26 Oct  Yesterday', TODAY)).toBe('2026-10-26');
    expect(headerDate('Sun 25 Oct 2 days ago', TODAY)).toBe('2026-10-25');
    expect(headerDate('Thu 22 Oct 5 davs ano', TODAY)).toBe('2026-10-22');
    expect(headerDate('Today', TODAY)).toBe(TODAY);
    expect(headerDate('Yesterday', TODAY)).toBe('2026-10-26');
    // No year on screen: a day after today is last year's
    expect(headerDate('Wed 31 Dec', '2027-01-02')).toBe('2026-12-31');
    expect(headerDate('Fri 1 Jan', '2027-01-02')).toBe('2027-01-01');
    expect(headerDate('26 October 2025', TODAY)).toBe('2025-10-26');
    expect(headerDate('Transfer to xx2066', TODAY)).toBeNull();
    expect(headerDate('Groceries', TODAY)).toBeNull();
  });
  it('reads amounts only when they have cents', () => {
    expect(moneyCents('-$111.95')).toBe(11195);
    expect(moneyCents('$1,234.50')).toBe(123450);
    expect(moneyCents('~$9.00')).toBe(900);
    expect(moneyCents('$450')).toBeNull(); // could be a misread $4.50
    expect(moneyCents('$ 0')).toBeNull();
  });
  it('turns CommBank labels into moni categories, never against the direction', () => {
    expect(bankCategory('Groceries', -900)).toBe('groceries');
    expect(bankCategory('Eating out', -900)).toBe('eating-out');
    expect(bankCategory('Home', -90000)).toBe('housing');
    expect(bankCategory('Transfers & payments', -900)).toBeNull();
    expect(bankCategory('Income', -900)).toBeNull();
    expect(bankCategory('Income', 900)).toBe('income');
  });
});

describe('pasted rows', () => {
  it('reads date | name | amount | category, with pending', () => {
    const { rows, errors } = parsePastedRows([
      '26/10/2026 | PENDING: Fake Shop | -111.95 | Entertainment',
      '26/10/2026 | Transfer from xx2066 CommBank app | 112.00 | Transfers & payments',
      '5/10/2026, Fakemart, -33.49, Groceries',
      'not a row',
    ].join('\n'), TODAY);
    expect(errors).toHaveLength(1);
    expect(rows).toEqual([
      { date: '2026-10-26', name: 'Fake Shop', amountCents: -11195, pending: true, bankLabel: 'Entertainment', problem: null },
      { date: '2026-10-26', name: 'Transfer from xx2066 CommBank app', amountCents: 11200, pending: false, bankLabel: 'Transfers & payments', problem: null },
      { date: '2026-10-05', name: 'Fakemart', amountCents: -3349, pending: false, bankLabel: 'Groceries', problem: null },
    ]);
  });
});

// Words as the reader gives them for a 900 x 2000 screenshot laid out like CommBank's page.
const w = (text, x0, y0, x1, y1) => ({ text, x0, y0, x1, y1 });
const line = (...words) => ({ words });
const W = 900;
const H = 2000;
const shotLines = [
  line(w('8:41', 60, 28, 116, 61), w('CDul=Ee', 600, 28, 870, 61)),
  line(w('<', 46, 138, 83, 175), w('Smart', 166, 138, 288, 175), w('Access', 301, 138, 440, 175)),
  line(w('Mon', 57, 274, 111, 302), w('26', 121, 274, 155, 302), w('Oct', 164, 274, 210, 302), w('Yesterday', 229, 274, 351, 302)),
  line(w('a', 91, 373, 145, 422), w('PENDING:', 186, 373, 318, 395), w('Fakeshop', 327, 373, 493, 395), w('$111.95', 735, 385, 862, 422)),
  line(w('Entertainment', 185, 420, 344, 438)),
  line(w('>', 76, 539, 128, 591), w('Transfer', 184, 539, 287, 570), w('from', 296, 539, 354, 570), w('xx2066', 364, 539, 464, 570), w('CommBank', 474, 539, 621, 570), w('app', 630, 539, 676, 570), w('$112.00', 739, 552, 853, 588)),
  line(w('Transfers', 184, 585, 285, 608), w('&', 293, 585, 307, 608), w('payments', 317, 585, 422, 608)),
  line(w('Sun', 56, 715, 104, 743), w('25', 113, 715, 147, 743), w('Oct', 157, 715, 203, 743), w('2', 223, 715, 238, 743), w('days', 248, 715, 304, 743), w('ago', 313, 715, 359, 743)),
  line(w('coles', 61, 1125, 137, 1190), w('Fakemart', 185, 1140, 330, 1170), w('(Broadway)', 340, 1140, 500, 1170), w('~$9.00', 771, 1150, 862, 1190)),
  line(w('Groceries', 184, 1191, 287, 1208)),
  line(w('Fake', 186, 1307, 251, 1340), w('Cafe', 259, 1307, 313, 1340), w('_$4.50', 771, 1320, 862, 1364)),
  line(w('Groceries', 184, 1356, 287, 1373)),
  line(w('Fake', 185, 1471, 272, 1505), w('Bakery', 283, 1471, 446, 1505), w('-$4.50', 771, 1490, 862, 1533)),
  line(w('Groceries', 184, 1521, 287, 1538)),
  line(w('>', 75, 1640, 128, 1692), w('Transfer', 184, 1640, 287, 1670), w('from', 296, 1640, 354, 1670), w('xx2066', 364, 1640, 464, 1670), w('CommBank', 474, 1640, 621, 1670), w('app', 630, 1640, 676, 1670), w('$', 739, 1650, 754, 1692), w('0', 837, 1650, 853, 1692)),
  line(w('Transfers', 184, 1657, 285, 1680), w('&', 293, 1657, 307, 1680), w('payments', 317, 1657, 422, 1680), w('©', 735, 1700, 816, 1802)),
  line(w('Thu', 55, 1816, 103, 1836), w('22', 112, 1816, 146, 1836), w('Oct', 156, 1816, 202, 1836), w('5', 223, 1816, 238, 1836), w('davs', 248, 1816, 304, 1836)),
  line(w('O', 66, 1855, 114, 1910), w('a', 249, 1855, 291, 1910), w('=', 785, 1855, 835, 1910)),
  line(w('Home', 59, 1923, 121, 1944), w('Accounts', 218, 1923, 321, 1944), w('Pay', 432, 1923, 467, 1944), w('Cards', 599, 1923, 660, 1944)),
];
// The green pill marks money in: here the two transfers from savings.
const isGreen = (b) => b.y0 >= 540 && b.y1 <= 600;

describe('reading a screenshot', () => {
  const r = parseShotLines({ width: W, height: H, lines: shotLines, isGreen, today: TODAY });
  it('sees the Smart Access title', () => expect(r.account).toBe('xx6193'));
  it('reads each row with its date, sign (from the color), pending and CommBank label', () => {
    expect(r.rows.map((x) => [x.date, x.name, x.amountCents, x.pending, x.bankLabel, x.problem])).toEqual([
      ['2026-10-26', 'Fakeshop', -11195, true, 'Entertainment', null],
      ['2026-10-26', 'Transfer from xx2066 CommBank app', 11200, false, 'Transfers & payments', null],
      ['2026-10-25', 'Fakemart (Broadway)', -900, false, 'Groceries', null],
      ['2026-10-25', 'Fake Cafe', -450, false, 'Groceries', null],
      ['2026-10-25', 'Fake Bakery', -450, false, 'Groceries', null],
      // Hidden under the search button: flagged, never guessed
      ['2026-10-25', 'Transfer from xx2066 CommBank app', null, false, 'Transfers & payments', 'amount'],
    ]);
  });
  it('ignores the bottom menu and a savings title', () => {
    expect(r.rows.some((x) => /home|accounts/i.test(x.name))).toBe(false);
    const saver = parseShotLines({ width: W, height: H, lines: [line(w('NetBank', 166, 138, 288, 175), w('Saver', 301, 138, 440, 175)), ...shotLines.slice(2)], isGreen, today: TODAY });
    expect(saver.account).toBe('other');
  });
  it('keeps a row seen in two pictures once, but two same rows in one picture twice', () => {
    const a = r.rows.slice(0, 4);
    const b = r.rows.slice(2);
    expect(combineShots([a, b])).toHaveLength(r.rows.length);
    const twice = [r.rows[3], { ...r.rows[3] }];
    expect(combineShots([twice])).toHaveLength(2);
  });
});

const bank = (uid, date, cents, description, extra = {}) => ({ uid, date, postedDate: date, amountCents: cents, description, source: 'csv', kind: 'spend', categoryId: 'groceries', importKey: uid, ...extra });

describe('the review list', () => {
  const rows = parseShotLines({ width: W, height: H, lines: shotLines, isGreen, today: TODAY }).rows;
  it('uses your rules first, then CommBank’s label; transfers are savings', () => {
    const items = planShot(rows, { txns: [], rules: DEFAULT_RULES, today: TODAY });
    expect(items.map((x) => [x.categoryId, x.guess])).toEqual([
      ['entertainment', 'bank'], ['saving', 'rule'], ['groceries', 'bank'], ['groceries', 'bank'], ['groceries', 'bank'], [null, null],
    ]);
    expect(items[1].transfer).toBe(true);
    expect(items.map(canConfirm)).toEqual([true, true, true, true, true, false]);
  });
  it('a PayID to a person stays To sort (must be picked or left in To sort)', () => {
    const [it] = planShot([{ date: '2026-10-25', name: 'Transfer to Fake Person PayID', amountCents: -3000, bankLabel: 'Transfers & payments' }], { rules: DEFAULT_RULES, today: TODAY });
    expect(it.categoryId).toBeNull();
    expect(canConfirm(it)).toBe(false);
    expect(shotRecord(it, { toSort: true })).toMatchObject({ kind: 'review', categoryId: null, shot: true, source: 'manual' });
  });
  it('leaves out rows already in moni, matching the right one of two same amounts', () => {
    const txns = [bank('csv|1', '2026-10-24', -450, 'FAKE BAKERY SYDNEY'), bank('csv|2', '2026-10-20', -900, 'FAKEMART BROADWAY')];
    const items = planShot(rows, { txns, rules: DEFAULT_RULES, today: TODAY });
    const dup = items.filter((x) => x.dupOf);
    expect(dup.map((x) => x.name)).toEqual(['Fake Bakery']); // Fakemart is 5 days away: not the same
    expect(dup[0].dupOf).toMatchObject({ uid: 'csv|1', from: 'bank' });
    // A cash purchase is never "already in moni"
    const cash = planShot(rows, { txns: [{ ...bank('m1', '2026-10-25', -450, 'Fake Bakery'), source: 'manual', cash: true }], rules: DEFAULT_RULES, today: TODAY });
    expect(cash.some((x) => x.dupOf)).toBe(false);
  });
  it('the saved record counts like a Smart Access row and keeps pending', () => {
    const items = planShot(rows, { rules: DEFAULT_RULES, today: TODAY });
    expect(shotRecord(items[0])).toMatchObject({ source: 'manual', shot: true, pending: true, kind: 'spend', categoryId: 'entertainment', amountCents: -11195, date: '2026-10-26', postedDate: '2026-10-26', description: 'Fakeshop' });
    expect(shotRecord(items[1])).toMatchObject({ transfer: true, kind: 'saving', categoryId: 'saving', amountCents: 11200 });
  });
});

// Saved screenshot rows, then the bank CSV arrives.
const shot = (uid, date, cents, extra = {}) => ({ uid, date, postedDate: date, amountCents: cents, description: extra.description ?? 'Fake Cafe', source: 'manual', shot: true, kind: 'spend', categoryId: 'eating-out', note: '', updatedAt: 1, ...extra });
let k = 0;
const bankRow = (date, cents, balanceCents, description = 'FAKE CAFE SYDNEY') => ({ importKey: `k${++k}|${date}`, date, postedDate: date, amountCents: cents, description, rawDescription: description, balanceCents });
function importInto(all, rows) {
  const plan = prepareImport(rows, { existingKeys: new Set(), manualTxns: all.filter((t) => t.source === 'manual'), rules: DEFAULT_RULES, now: 2 });
  const merged = new Set(plan.mergedManualIds);
  return { all: [...all.filter((t) => !merged.has(t.uid)), ...plan.toAdd], plan };
}
function answer(all, bankUid, typedUid) {
  const { updates, deletes } = planResolve(all, bankUid, typedUid);
  const gone = new Set(deletes);
  const ch = new Map(updates.map((u) => [u.uid, u.changes]));
  return all.filter((t) => !gone.has(t.uid)).map((t) => (ch.has(t.uid) ? { ...t, ...ch.get(t.uid) } : t));
}
const start = { key: 'balance', cents: 5000, asOf: '2026-10-23' };

describe('when the bank CSV arrives', () => {
  it('counts in the balance like a pending row, and as a screenshot, not typed', () => {
    const e = estimateBalances([shot('s1', '2026-10-26', -1200)], start, {}).main;
    expect(e.cents).toBe(3800);
    expect(e.shots).toBe(1);
    expect(e.typed).toBe(0);
    expect(e.items[0].from).toBe('shot');
  });
  it('asks even when exactly one screenshot row fits, and nothing counts twice meanwhile', () => {
    const all0 = [shot('s1', '2026-10-26', -1200)];
    const rows = [bankRow('2026-10-27', -1200, 3800)];
    const { all, plan } = importInto(all0, rows);
    expect(plan.mergedManualIds).toEqual([]);
    expect(plan.confirms).toBe(1);
    const bal = nextBalance(rows, start);
    expect(estimateBalances(all, bal, {}).main.cents).toBe(3800);
    expect(countedView(all).filter((t) => t.kind === 'spend').length).toBe(1);
    const q = openConfirms(all);
    expect(q[0].candidates[0].uid).toBe('s1');
    // Yes: the bank row takes over with the screenshot's category, keeps its own date and name
    const yes = answer(all, q[0].row.uid, 's1');
    expect(yes).toHaveLength(1);
    expect(yes[0]).toMatchObject({ source: 'csv', categoryId: 'eating-out', date: '2026-10-27', description: 'FAKE CAFE SYDNEY', confirm: null });
    expect(estimateBalances(yes, bal, {}).main.cents).toBe(3800);
    // No: both stay
    expect(answer(all, q[0].row.uid, null)).toHaveLength(2);
  });
  it('a screenshot transfer is asked about too, never merged on its own', () => {
    const all0 = [shot('s2', '2026-10-26', 11200, { description: 'Transfer from xx2066 CommBank app', transfer: true, kind: 'saving', categoryId: 'saving' })];
    const { plan } = importInto(all0, [bankRow('2026-10-26', 11200, 16200, 'Transfer from xx2066 CommBank app')]);
    expect(plan.mergedManualIds).toEqual([]);
    expect(plan.confirms).toBe(1);
  });
  it('a pending row whose amount changed is asked about as a near miss', () => {
    const { plan, all } = importInto([shot('s3', '2026-10-26', -1000, { pending: true })], [bankRow('2026-10-27', -1080, 3920)]);
    expect(plan.confirms).toBe(1);
    expect(openConfirms(all)[0].near).toBe(true);
  });
  it('answering one question never auto-merges another screenshot row', () => {
    const all0 = [shot('a', '2026-10-26', -500), shot('b', '2026-10-26', -500)];
    const { all } = importInto(all0, [bankRow('2026-10-27', -500, 4500), bankRow('2026-10-27', -500, 4000)]);
    const qs = openConfirms(all);
    expect(qs).toHaveLength(2);
    const after = answer(all, qs[0].row.uid, 'a');
    expect(openConfirms(after)).toHaveLength(1);
  });
  it('a screenshot row left in To sort lets the bank keep its own category', () => {
    expect(mergeFrom(shot('x', '2026-10-26', -500, { kind: 'review', categoryId: null }))).toEqual({ note: '' });
  });
});

describe('lists and filters', () => {
  const s = markTyped([shot('s1', '2026-10-26', -1200, { pending: true }), shot('s2', '2026-10-26', -500)], '2026-10-26');
  it('rows show "pending" or "screenshot", never "typed"', () => {
    const a = renderToStaticMarkup(<TxnRow t={s[0]} onOpen={() => {}} />);
    const b = renderToStaticMarkup(<TxnRow t={s[1]} onOpen={() => {}} />);
    expect(a).toContain('pending');
    expect(b).toContain('screenshot');
    expect(a + b).not.toContain('typed');
  });
  it('Typed only leaves screenshot rows out', () => {
    expect(filterTxns(s, { ...EMPTY_FILTER, typed: true }, TODAY)).toHaveLength(0);
    expect(spendFilter(s, [], true).count).toBe(0);
    expect(spendFilter(s, [], false).count).toBe(2);
  });
});
