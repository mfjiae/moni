// M2.5: new categories and rules, keyword fix, re-sort, 4-box summary.
// Descriptions are realistic in shape but use made-up names and numbers.
import { describe, it, expect } from 'vitest';
import { categorize, merchantKey, isBroadKeyword, makeUserRule } from '../rules.js';
import { buildCategories, kindForCategory, pickerGroups, customCategoryId, DEFAULT_CATEGORIES } from '../categories.js';
import { resortPlan, usableUserRules } from '../resort.js';
import { summarizeMonth, categoryRows, firstDataMonth, balanceHistory } from '../summary.js';

const cat = (d, cents = -1000) => categorize(d, cents);

describe('M2.5 rules', () => {
  it('tuition is only the UTS BPAY payment; UTS card charges are Education', () => {
    expect(cat('UTS SYDNEY CommBank app BPAY 111111 0000000000000000000 S2026 Tuition', -1935598).categoryId).toBe('tuition');
    expect(cat('UNIVERSITY OF TECHNO BROADWAY AUS', -5000).categoryId).toBe('education');
    expect(cat('UNIVERSITY OF TECHNO BROADWAY AUS', -500).categoryId).toBe('education');
  });
  it('the UTS health visit and its insurance refund are Health & medical', () => {
    expect(cat('University Of Technol Broadway NS AUS', -4285).categoryId).toBe('health');
    expect(cat('Direct Credit 100000 AGA ASSISTANCE 0000000000', 4285)).toMatchObject({ kind: 'spend', categoryId: 'health' });
    expect(cat('PappaRich UTS Univers Ultimo AU').kind).toBe('review');
  });
  it('sport & fitness: gym, Activate UTS, badminton (even by PayID)', () => {
    expect(cat('Direct Debit 600000 Broadway Gym DT.abc123 BROA0000', -2990)).toMatchObject({ categoryId: 'sport', bill: true });
    expect(cat('EZI*ACTIVATEUTS ULTIMO AU AUS').categoryId).toBe('sport');
    expect(cat("Transfer To A SMITH PayID Phone from CommBank App ken's badminton").categoryId).toBe('sport');
    expect(cat('Transfer To CLUBX CommBank App badminton part').categoryId).toBe('sport');
  });
  it('phone bill (TelcoPay / Moose) is Utilities, a Moose refund reduces it', () => {
    expect(cat('Direct Debit 500000 TelcoPay 10000000', -2680)).toMatchObject({ categoryId: 'utilities', bill: true });
    expect(cat('TELCO PAY FORTITUDE VAL QL AUS', -1480).categoryId).toBe('utilities');
    expect(cat('Direct Credit 300000 TELCO PAY PTY LT Moose Refunds', 1498)).toMatchObject({ kind: 'spend', categoryId: 'utilities' });
  });
  it('subscriptions and apps have their own category', () => {
    expect(cat('ANTHROPIC* CLAUDE SUB SAN FRANCISCO CA USA').categoryId).toBe('subscriptions');
    expect(cat('Patreon* Membership Internet IRL').categoryId).toBe('subscriptions');
    expect(cat('REAL DEBRID MONTREUIL FRA').categoryId).toBe('subscriptions');
    expect(cat('Google One Barangaroo AU AUS').categoryId).toBe('subscriptions');
    expect(cat('APPLE.COM/BILL SYDNEY NS AUS').categoryId).toBe('subscriptions');
  });
  it('family money is Family support income', () => {
    expect(cat('Fast Transfer From A PARENT LIVING FEE', 1000000)).toMatchObject({ kind: 'income', categoryId: 'family' });
    expect(cat('A PARENT REF 0000 /RFB/LIVING EXPENSES', 1900000).categoryId).toBe('family');
    expect(cat('CASH DEPOSIT CBA ATM BROADWAY A NSW 000000 AUS 0000', 500000).categoryId).toBe('family');
    // a plain transfer from a person still goes to Review
    expect(cat('Fast Transfer From B JONES to PayID Phone', 1240).kind).toBe('review');
  });
  it('salary is Job income; savings interest is Interest', () => {
    expect(cat('Salary GHS GH0000000/09/2026', 72033)).toMatchObject({ kind: 'income', categoryId: 'job-income' });
    expect(cat('Credit Interest', 1218)).toMatchObject({ kind: 'income', categoryId: 'interest' });
  });
  it('bank fees go to Fees & interest', () => {
    expect(cat('Unpaid Payment Fee', -500).categoryId).toBe('fees');
    expect(cat('International Transaction Fee', -52).categoryId).toBe('fees');
    expect(cat('Debit Excess Interest', -1).categoryId).toBe('fees');
  });
  it('transfers with the 2nd savings account (xx2103) are saving', () => {
    expect(cat('Transfer to xx2103 CommBank app 2nd savings acc', -450000).kind).toBe('saving');
    expect(cat('Transfer from xx2103 CommBank app', 46).kind).toBe('saving');
  });
  it('Revolut top-ups stay in Review', () => {
    expect(cat('Revolut**1234* Melbourne AU AUS', -5000).kind).toBe('review');
  });
  it('rent still beats laundry', () => {
    expect(cat('Direct Debit 507156 STRP_BRO SCAPE_TESTREF', -91600).categoryId).toBe('housing');
    expect(cat('SCAPE AUSTRALIA BROADW ULTIMO AUS', -900).categoryId).toBe('personal-care');
  });
  it('JB Hi-Fi without the dash is Shopping', () => {
    expect(cat('JB HI FI BROADWAY BROADWAY NS AUS').categoryId).toBe('shopping');
  });
});

describe('merchant keyword fix', () => {
  it('skips "Direct Debit <number>" and transfer prefixes', () => {
    expect(merchantKey('Direct Debit 502541 TelcoPay 11708963')).toBe('TELCOPAY');
    expect(merchantKey('Direct Debit 601005 Broadway Gym DT.4tot0b BROA2816')).toBe('BROADWAY GYM');
    expect(merchantKey('Direct Credit 617703 PAYPAL AUSTRALIA 1048579802991')).toBe('PAYPAL AUSTRALIA');
    expect(merchantKey('Transfer To Betashares Applications Acco CommBank App')).toBe('BETASHARES APPLICATIONS');
  });
  it('handles card processor prefixes and starred names', () => {
    expect(merchantKey('EZI*ACTIVATEUTS ULTIMO AU AUS')).toBe('ACTIVATEUTS ULTIMO');
    expect(merchantKey('KPY*TASTE LEGEND Sydney AU')).toBe('TASTE LEGEND');
    expect(merchantKey('Revolut**1899* Melbourne AU AUS')).toBe('REVOLUT');
    expect(merchantKey('Return 10/02/26 Direct Debit 507156 STRP_BRO x')).toBe('STRP_BRO X');
  });
  it('never offers a keyword that would catch everything', () => {
    expect(merchantKey('Direct Debit 502541')).toBe('');
    expect(isBroadKeyword('DIRECT DEBIT')).toBe(true);
    expect(isBroadKeyword('transfer to')).toBe(true);
    expect(isBroadKeyword('TELCOPAY')).toBe(false);
  });
  it('ignores an old broad learned rule', () => {
    const bad = { ...makeUserRule('DIRECT DEBIT', 'utilities', 'spend'), order: 2 };
    const good = { ...makeUserRule('ZLR', 'eating-out', 'spend'), order: 1 };
    expect(usableUserRules([bad, good])).toEqual([good]);
  });
});

describe('categories', () => {
  it('has the CommBank-aligned set with unused ones hidden', () => {
    const list = buildCategories();
    expect(list.find((c) => c.id === 'pets').hidden).toBe(true);
    expect(list.find((c) => c.id === 'tuition').hidden).toBe(false);
    expect(kindForCategory('family')).toBe('income');
    expect(kindForCategory('tuition')).toBe('spend');
    expect(new Set(DEFAULT_CATEGORIES.map((c) => c.id)).size).toBe(DEFAULT_CATEGORIES.length);
  });
  it('applies renames, hiding and custom categories, but never hides locked ones', () => {
    const list = buildCategories([
      { id: 'groceries', name: 'Food shop' },
      { id: 'travel', hidden: true },
      { id: 'pets', hidden: false },
      { id: 'other', hidden: true },
      { id: 'custom-coffee-ab12', name: 'Coffee', type: 'spend', custom: true },
    ]);
    const by = Object.fromEntries(list.map((c) => [c.id, c]));
    expect(by.groceries.name).toBe('Food shop');
    expect(by.travel.hidden).toBe(true);
    expect(by.pets.hidden).toBe(false);
    expect(by.other.hidden).toBe(false);
    expect(by['custom-coffee-ab12']).toMatchObject({ name: 'Coffee', type: 'spend', custom: true });
  });
  it('puts the most-used categories first', () => {
    const { most } = pickerGroups(-100, { groceries: 50, 'eating-out': 20, family: 99 });
    expect(most.map((c) => c.id)).toEqual(['groceries', 'eating-out']);
  });
  it('makes a stable-looking custom id', () => {
    expect(customCategoryId('Gym stuff!', () => 0.123456)).toMatch(/^custom-gym-stuff-[a-z0-9]{1,4}$/);
  });
});

describe('re-sort', () => {
  const t = (uid, description, amountCents, kind, categoryId, extra = {}) =>
    ({ uid, source: 'csv', description, amountCents, kind, categoryId, date: '2026-09-01', ...extra });

  const txns = [
    t('a', 'Direct Debit 500000 TelcoPay 10000000', -2680, 'review', null),
    t('b', 'Google One Barangaroo AU AUS', -849, 'spend', 'utilities'), // sorted by the M2 rule
    t('c', 'APPLE.COM/BILL SYDNEY NS AUS', -1199, 'spend', 'entertainment'), // Ken changed it by hand
    t('d', 'Salary GHS GH0000000/09/2026', 72033, 'income', 'income'),
    t('e', 'Fast Transfer From A PARENT LIVING FEE', 1000000, 'income', 'income'), // Ken marked Income
    t('f', 'Fast Transfer From B JONES to PayID Phone', 1240, 'income', 'income'), // stays Other income
    t('g', 'Revolut**1234* Melbourne AU AUS', -5000, 'review', null), // no rule: stays in Review
    t('h', 'Some cafe', -500, 'spend', 'eating-out', { source: 'manual' }),
  ];

  it('Review mode only sorts Review items', () => {
    const plan = resortPlan(txns, { mode: 'review' });
    expect(plan.map((c) => [c.uid, c.categoryId])).toEqual([['a', 'utilities']]);
  });
  it('migration re-sorts rule-sorted items, keeps hand changes, re-checks old Income', () => {
    const plan = Object.fromEntries(resortPlan(txns, { mode: 'migrate' }).map((c) => [c.uid, c.categoryId]));
    expect(plan).toEqual({ a: 'utilities', b: 'subscriptions', d: 'job-income', e: 'family' });
  });
  it('running it again changes nothing', () => {
    const plan = resortPlan(txns, { mode: 'migrate' });
    const after = txns.map((x) => {
      const c = plan.find((p) => p.uid === x.uid);
      return c ? { ...x, kind: c.kind, categoryId: c.categoryId, bill: c.bill } : x;
    });
    // a second device sees the already-migrated data: it must not undo or redo anything
    expect(resortPlan(after, { mode: 'migrate' })).toEqual([]);
  });
  it('fixes what an old too-broad "DIRECT DEBIT" rule mis-sorted', () => {
    const broad = [{ ...makeUserRule('DIRECT DEBIT', 'utilities', 'spend'), order: 1 }];
    const list = [
      t('gym', 'Direct Debit 600000 Broadway Gym DT.abc BROA0000', -2990, 'spend', 'utilities'),
      t('rent', 'Direct Debit 507156 STRP_BRO SCAPE_X', -91600, 'spend', 'utilities'),
    ];
    const plan = Object.fromEntries(resortPlan(list, { mode: 'migrate', userRules: broad }).map((c) => [c.uid, c.categoryId]));
    expect(plan).toEqual({ gym: 'sport', rent: 'housing' });
  });
  it('uses learned rules, newest first', () => {
    const rules = [{ ...makeUserRule('REVOLUT', 'shopping', 'spend'), order: 1 }];
    const plan = resortPlan(txns, { mode: 'review', userRules: rules });
    expect(plan.find((c) => c.uid === 'g').categoryId).toBe('shopping');
  });
});

describe('month summary, M2.5', () => {
  const m = (date, amountCents, kind, categoryId) => ({ date, amountCents, kind, categoryId });
  const txns = [
    m('2026-09-02', 72033, 'income', 'job-income'),
    m('2026-09-03', 1000000, 'income', 'family'),
    m('2026-09-04', -91600, 'spend', 'housing'),
    m('2026-09-05', -1935598, 'spend', 'tuition'),
    m('2026-09-06', -5000, 'investing', 'investing'),
    m('2026-09-07', -10000, 'saving', 'saving'),
    m('2026-09-08', 4000, 'saving', 'saving'),
  ];
  const s = summarizeMonth(txns, '2026-09');
  it('splits In / Spent / Saved / Invested', () => {
    expect(s.income).toBe(1072033);
    expect(s.spent).toBe(91600 + 1935598);
    expect(s.invested).toBe(5000);
    expect(s.savedNet).toBe(6000);
    expect(s.incomeByCategory).toEqual({ 'job-income': 72033, family: 1000000 });
  });
  it('category rows with shares, and without tuition', () => {
    const all = categoryRows(s.byCategory);
    expect(all.total).toBe(91600 + 1935598 + 5000);
    expect(all.rows[0].id).toBe('tuition');
    const noTuition = categoryRows(s.byCategory, { exclude: ['tuition'] });
    expect(noTuition.total).toBe(96600);
    expect(noTuition.rows[0].share).toBeCloseTo(91600 / 96600);
  });
  it('first month with data, never before Jan 2024', () => {
    expect(firstDataMonth(txns)).toBe('2026-09');
    expect(firstDataMonth([{ date: '2023-05-01' }])).toBe('2024-01');
    expect(firstDataMonth([])).toBe(null);
  });
  it('balance history takes the last row of each day', () => {
    const b = (postedDate, amountCents, balanceCents) => ({ source: 'csv', postedDate, date: postedDate, amountCents, balanceCents });
    // 12 Oct: +45.00 then... order in the list doesn't matter
    const h = balanceHistory([
      b('2026-10-12', 4500, 7175),
      b('2026-10-11', -2375, 2675),
      b('2026-10-11', -336, 5050),
      b('2026-10-11', 1000, 5386),
    ]);
    expect(h).toEqual([{ date: '2026-10-11', cents: 2675 }, { date: '2026-10-12', cents: 7175 }]);
  });
});
