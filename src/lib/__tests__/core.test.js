import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCents, formatCents } from '../money.js';
import { parseDMY, monthPace, todaySydney, shortDay } from '../dates.js';
import { parseNetBankCsv, latestBalance, splitCsvLine } from '../csv.js';
import { categorize } from '../rules.js';
import { summarizeMonth, budgetRows, leftToSpend, budgetStatus } from '../summary.js';

const fixture = readFileSync(fileURLToPath(new URL('./fixtures/netbank-sample.csv', import.meta.url)), 'utf8');

describe('money', () => {
  it('parses signed amounts to integer cents', () => {
    expect(parseCents('-10.00')).toBe(-1000);
    expect(parseCents('+720.33')).toBe(72033);
    expect(parseCents('0.00')).toBe(0);
    expect(parseCents('5.5')).toBe(550);
    expect(parseCents('1,234.56')).toBe(123456);
  });
  it('avoids float error', () => {
    expect(parseCents('0.10') + parseCents('0.20')).toBe(parseCents('0.30'));
  });
  it('rejects junk', () => {
    expect(() => parseCents('abc')).toThrow();
  });
  it('formats cents', () => {
    expect(formatCents(83720)).toBe('$837.20');
    expect(formatCents(123456789)).toBe('$1,234,567.89');
    expect(formatCents(-1000)).toBe('−$10.00');
    expect(formatCents(92000, { sign: true })).toBe('+$920.00');
  });
});

describe('dates', () => {
  it('reads DD/MM/YYYY, not MM/DD', () => {
    expect(parseDMY('01/10/2026')).toBe('2026-10-01');
    expect(parseDMY('30/09/2026')).toBe('2026-09-30');
    expect(() => parseDMY('31/09/2026')).toThrow();
    expect(() => parseDMY('2026-10-01')).toThrow();
  });
  it('computes month pace', () => {
    expect(monthPace('2026-10-12')).toBeCloseTo(12 / 31);
    expect(monthPace('2026-02-28')).toBe(1);
  });
  it('uses Sydney time for today', () => {
    // 2026-10-12 14:30 UTC is 2026-10-13 01:30 in Sydney (UTC+11)
    expect(todaySydney(new Date('2026-10-12T14:30:00Z'))).toBe('2026-10-13');
  });
  it('labels recent days', () => {
    expect(shortDay('2026-10-12', '2026-10-12')).toBe('Today');
    expect(shortDay('2026-10-11', '2026-10-12')).toBe('Yesterday');
    expect(shortDay('2026-09-30', '2026-10-12')).toBe('30 Sept');
  });
});

describe('NetBank CSV', () => {
  const { rows, errors } = parseNetBankCsv(fixture);
  it('parses every row', () => {
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(15);
  });
  it('splits quoted fields', () => {
    expect(splitCsvLine('01/10/2026,"-1.00","A, B","+2.00"')).toEqual(['01/10/2026', '-1.00', 'A, B', '+2.00']);
  });
  it('uses the card value date as the purchase date and strips it', () => {
    const iga = rows.find((r) => r.description.includes('IGA'));
    expect(iga.postedDate).toBe('2026-10-01');
    expect(iga.date).toBe('2026-09-28');
    expect(iga.description).toBe('THAI KEE IGA SUPERMA HAYMARKET AUS');
  });
  it('takes the balance from the newest row', () => {
    expect(latestBalance(rows)).toBe(6315);
  });
  it('gives each row a unique import key', () => {
    expect(new Set(rows.map((r) => r.importKey)).size).toBe(rows.length);
  });
  it('reports bad lines instead of crashing', () => {
    const r = parseNetBankCsv('garbage line\n01/10/2026,"-1.00","X","+1.00"');
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toHaveLength(1);
  });
});

describe('rules', () => {
  const cat = (d, a = -100) => categorize(d, a);
  it('treats savings transfers as saving, both ways', () => {
    expect(cat('Transfer to xx2066 CommBank app').kind).toBe('saving');
    expect(cat('Transfer from xx2066 CommBank app', 1800).kind).toBe('saving');
  });
  it('separates rent from laundry', () => {
    const rent = cat('Direct Debit 507156 STRP_BRO SCAPE_TESTREF', -91600);
    expect(rent.categoryId).toBe('housing');
    expect(rent.bill).toBe(true);
    expect(cat('SCAPE AUSTRALIA BROADW ULTIMO AUS').categoryId).toBe('personal-care');
  });
  it('sends PayID to review', () => {
    expect(cat('Transfer To A SMITH PayID Phone from CommBank App movie').kind).toBe('review');
    expect(cat('Fast Transfer From B JONES to PayID Phone Pho', 1240).kind).toBe('review');
  });
  it('treats a business paid by PayID as travel, not a person', () => {
    const r = cat('Transfer To Jetstar Airways Pty Ltd - $3 PayID Email from CommBank App', -30800);
    expect(r.kind).toBe('spend');
    expect(r.categoryId).toBe('travel');
  });
  it('knows Roll’d (bank shows it as ROLL?D)', () => {
    expect(cat('SQ *ROLL?D MELBOURNE A Melbourne Air VI AUS').categoryId).toBe('eating-out');
  });
  it('knows common merchants', () => {
    expect(cat('TB_Haymarket_3114 Pyrmont AU AUS').categoryId).toBe('eating-out');
    expect(cat('TFNSW OPAL FARE SYDNEY AUS').categoryId).toBe('transport');
    expect(cat('UBER EATS SYDNEY').categoryId).toBe('eating-out');
    expect(cat('UBER TRIP SYDNEY').categoryId).toBe('transport');
    expect(cat('Yomojo North Sydney').categoryId).toBe('utilities');
    expect(cat('Salary GHS GH0000000', 72033).kind).toBe('income');
    expect(cat('Direct Debit 062934 COMMSEC SECURITI COMMSEC').kind).toBe('investing');
  });
  it('marks refunds and keeps their category', () => {
    const r = cat('Refund Purchase ALDI STORES BROADWAY NSWAU', 1198);
    expect(r.refund).toBe(true);
    expect(r.categoryId).toBe('groceries');
  });
  it('sends unknown merchants to review', () => {
    expect(cat('SOME NEW SHOP NEWTOWN AU').kind).toBe('review');
  });
});

describe('month summary', () => {
  const { rows } = parseNetBankCsv(fixture);
  const txns = rows.map((r) => ({ ...r, ...categorize(r.description, r.amountCents) }));
  const sep = summarizeMonth(txns, '2026-09');

  it('excludes savings transfers from spending and income', () => {
    expect(sep.income).toBe(72033);
  });
  it('counts refunds as reducing spending, not income', () => {
    // Sep groceries: IGA 4.60 (value date 28 Sep) - ALDI refund 11.98 = -7.38
    expect(sep.byCategory.groceries).toBe(460 - 1198);
  });
  it('keeps investing out of spending but in the category totals', () => {
    expect(sep.byCategory.investing).toBe(5000 + 3635);
    expect(sep.invested).toBe(5000 + 3635);
  });
  it('counts review items separately', () => {
    expect(sep.review).toBe(1); // B JONES reimbursement in Sep
  });
  it('totals spending, and everything that left including investing', () => {
    // laundry 9.00 + taco bell 8.95 + opal 22.78 + rent 916 + groceries -7.38 + yomojo 12.45
    expect(sep.spent).toBe(900 + 895 + 2278 + 91600 + (460 - 1198) + 1245);
    expect(sep.outgoings).toBe(sep.spent + 8635);
    expect(sep.net).toBe(72033 - sep.outgoings);
  });
  it('computes October savings as net', () => {
    const oct = summarizeMonth(txns, '2026-10');
    expect(oct.savedNet).toBe(1000 - 1800);
  });
  it('builds budget rows and left to spend', () => {
    const rowsB = budgetRows(sep, [
      { categoryId: 'groceries', limitCents: 40000 },
      { categoryId: 'eating-out', limitCents: 800 },
    ]);
    expect(rowsB[0].spent).toBe(0); // net-negative clamps to 0
    expect(rowsB[1].spent).toBe(895);
    expect(budgetStatus(rowsB[1].ratio)).toBe('over');
    expect(leftToSpend(rowsB)).toEqual({ total: 40800, spent: 895, left: 39905 });
  });
});
