import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseNetBankCsv } from '../csv.js';
import { categorize, merchantKey, isPersonTransfer, makeUserRule, DEFAULT_RULES } from '../rules.js';
import { prepareImport, nextBalance, currentBalance } from '../importer.js';
import { kindForCategory, pickerCategories } from '../categories.js';
import { shiftMonth, nowSydneyTime, longDay } from '../dates.js';

const fixture = readFileSync(fileURLToPath(new URL('./fixtures/netbank-sample.csv', import.meta.url)), 'utf8');
const { rows } = parseNetBankCsv(fixture);

describe('rules from Ken', () => {
  it('ZETCITI is groceries', () => {
    expect(categorize('ZETCITI BROADWAY GLEBE AU', -547).categoryId).toBe('groceries');
  });
  it('photo booth is entertainment', () => {
    expect(categorize('Metro Auto Photo Melbourne AU', -800).categoryId).toBe('entertainment');
  });
  it('Moose Mobile refund reduces Utilities', () => {
    const r = categorize('Direct Credit 333732 TELCO PAY PTY LT Moose Refunds', 1498);
    expect(r.kind).toBe('spend');
    expect(r.categoryId).toBe('utilities');
  });
});

describe('rent rules from the older CSV', () => {
  const c = (d, a) => categorize(d, a).categoryId;
  it('older rent direct debits (broadwayx) are rent', () => {
    expect(c('Direct Debit 507156 STRP_BRO broadwayx_ABC123', -95400)).toBe('housing');
  });
  it('a bounced rent debit coming back reduces rent', () => {
    expect(c('Return 10/02/26 Direct Debit 507156 STRP_BRO broadwayx_XYZ', 93500)).toBe('housing');
  });
  it('a transfer to SCAPE BROADWAY is rent', () => {
    expect(c("Transfer To SCAPE BROADWAY CommBank App rent", -190800)).toBe('housing');
  });
  it('small Scape card purchase is laundry, big one is rent', () => {
    expect(c('SCAPE AUSTRALIA BROADW ULTIMO AUS', -900)).toBe('personal-care');
    expect(c('SCAPE AUSTRALIA BROADW SYDNEY AU', -98300)).toBe('housing');
  });
  it('transport tap and Subway', () => {
    expect(c('TRANSPORTFORNSW TAP SYDNEY AUS', -231)).toBe('transport');
    expect(c('Subway Broadway Ultimo NS AUS', -1495)).toBe('eating-out');
  });
});

describe('helpers', () => {
  it('detects transfers to and from people', () => {
    expect(isPersonTransfer('Transfer To A SMITH PayID Phone from CommBank App movie')).toBe(true);
    expect(isPersonTransfer('Fast Transfer From B JONES to PayID Phone')).toBe(true);
    expect(isPersonTransfer('Transfer To Jetstar Airways Pty Ltd - $3 PayID Email')).toBe(false);
    expect(isPersonTransfer('ZETCITI BROADWAY GLEBE AU')).toBe(false);
  });
  it('makes a short merchant keyword', () => {
    expect(merchantKey('WOOLWORTHS 1248 SYDNEY NS AUS')).toBe('WOOLWORTHS');
    expect(merchantKey('SQ *ROLL?D MELBOURNE A Melbourne Air VI AUS')).toBe('ROLL?D MELBOURNE');
    expect(merchantKey('DD *DOORDASH FISHBOWL MELBOURNE')).toBe('DOORDASH FISHBOWL');
    expect(merchantKey('TB_Haymarket_3114 Pyrmont')).toBe('TB_HAYMARKET_3114');
  });
  it('user rules win over built-in ones', () => {
    const rules = [makeUserRule('aldi', 'shopping', 'spend'), ...DEFAULT_RULES];
    expect(categorize('ALDI STORES BROADWAY NSWAU', -100, rules).categoryId).toBe('shopping');
  });
  it('kind follows category', () => {
    expect(kindForCategory('groceries')).toBe('spend');
    expect(kindForCategory('income')).toBe('income');
    expect(kindForCategory('investing')).toBe('investing');
    expect(kindForCategory('internal')).toBe('internal');
  });
  it('orders picker by direction', () => {
    expect(pickerCategories(100)[0].id).toBe('income');
    expect(pickerCategories(-100)[0].type).toBe('spend');
  });
  it('dates', () => {
    expect(shiftMonth('2026-10', -1)).toBe('2026-09');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(nowSydneyTime(new Date('2026-10-12T14:30:00Z'))).toBe('01:30');
    expect(longDay('2026-10-01')).toBe('Thu 1 Oct');
  });
});

describe('import', () => {
  it('adds everything the first time', () => {
    const p = prepareImport(rows, { rules: DEFAULT_RULES });
    expect(p.toAdd).toHaveLength(rows.length);
    expect(p.duplicates).toBe(0);
    expect(p.reviewCount).toBe(2); // two PayID transfers with people
    expect(p.toAdd[0].uid).toBe(`csv|${rows[0].importKey}`);
    expect(new Set(p.toAdd.map((t) => t.uid)).size).toBe(rows.length);
  });
  it('skips rows already imported', () => {
    const existingKeys = new Set(rows.slice(5).map((r) => r.importKey));
    const p = prepareImport(rows, { existingKeys, rules: DEFAULT_RULES });
    expect(p.toAdd).toHaveLength(5);
    expect(p.duplicates).toBe(rows.length - 5);
  });
  it('replaces a matching manual entry instead of double counting', () => {
    const manualTxns = [
      { uid: 'm7', date: '2026-09-29', amountCents: -3252, kind: 'spend', categoryId: 'shopping', note: '', description: 'Aldi run' },
    ];
    const p = prepareImport(rows, { manualTxns, rules: DEFAULT_RULES });
    expect(p.mergedManualIds).toEqual(['m7']);
    const aldi = p.toAdd.find((t) => t.amountCents === -3252);
    expect(aldi.categoryId).toBe('shopping'); // keeps the category you chose
    expect(aldi.note).toBe('Aldi run');
  });
  it('does not match a manual entry more than 4 days away', () => {
    const manualTxns = [{ uid: 'm8', date: '2026-09-20', amountCents: -3252, kind: 'spend', categoryId: 'groceries' }];
    expect(prepareImport(rows, { manualTxns, rules: DEFAULT_RULES }).mergedManualIds).toEqual([]);
  });
  it('never matches a manual entry to a savings transfer', () => {
    const manualTxns = [{ uid: 'm9', date: '2026-10-01', amountCents: -1000, kind: 'spend', categoryId: 'other' }];
    expect(prepareImport(rows, { manualTxns, rules: DEFAULT_RULES }).mergedManualIds).toEqual([]);
  });
});

describe('balance', () => {
  it('takes the newest row and never goes backwards', () => {
    const b = nextBalance(rows, null);
    expect(b).toEqual({ key: 'balance', cents: 6315, asOf: '2026-10-01' });
    const newer = { key: 'balance', cents: 999, asOf: '2026-10-05' };
    expect(nextBalance(rows, newer)).toBe(newer);
  });
  it('adds manual entries after the bank date', () => {
    const b = { cents: 6315, asOf: '2026-10-01' };
    const txns = [
      { source: 'manual', date: '2026-10-03', amountCents: -500, kind: 'spend' },
      { source: 'manual', date: '2026-09-30', amountCents: -900, kind: 'spend' },
      { source: 'csv', date: '2026-10-03', amountCents: -100, kind: 'spend' },
    ];
    expect(currentBalance(b, txns)).toBe(5815);
  });
});
