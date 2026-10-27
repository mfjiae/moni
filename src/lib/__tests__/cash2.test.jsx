// Paid with cash, Push 2 (prototype "Moni Paid With Cash" v4; Ken 26-27 Oct 2026): the Cash balance formula and its
// set date, the rose dot, sync of the setting, the "Cash withdrawal?" question and remembered answers, and the UI.
// Fake merchants and amounts only.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { cashBalance, cashEffect, countsInCash, cashDot, atmQuestion, atmRule, atmSkipRules, isAtmWithdrawal, movesCash } from '../cash.js';
import { categorize, DEFAULT_RULES } from '../rules.js';
import { prepareImport } from '../importer.js';
import { usableUserRules, resortPlan } from '../resort.js';
import { mergeSnapshots, normalize, sameSnapshot } from '../merge.js';
import { summarizeMonth } from '../summary.js';
import Home, { SetCashSheet } from '../../components/Home.jsx';
import AddTxn from '../../components/AddTxn.jsx';
import TxnRow from '../../components/TxnRow.jsx';
import TxnSheet from '../../components/TxnSheet.jsx';

let k = 0;
const cashBuy = (date, cents, extra = {}) => ({ uid: `m${++k}`, date, postedDate: date, amountCents: cents, description: 'Lunch stall', source: 'manual', cash: true, kind: 'spend', categoryId: 'eating-out', createdAt: 100, updatedAt: 100, ...extra });
const bank = (date, cents, description, extra = {}) => {
  const c = categorize(description, cents);
  return { uid: `csv|${++k}`, date, postedDate: date, amountCents: cents, description, source: 'csv', kind: c.kind, categoryId: c.categoryId, updatedAt: 1, ...extra };
};
const atm = (date, cents) => bank(date, cents, 'ATM WITHDRAWAL CBA ATM FAKETOWN');
const ownDep = (date, cents) => ({ ...bank(date, cents, 'CASH DEPOSIT CBA ATM FAKETOWN A NSW'), kind: 'internal', categoryId: 'internal' });
const giftDep = (date, cents) => bank(date, cents, 'CASH DEPOSIT CBA ATM FAKETOWN A NSW');

describe('Cash balance formula (set + withdrawals - spent - own cash deposited)', () => {
  it('matches the prototype example: $50 set + $200 ATM - $20.50 spent = $229.50', () => {
    const set = { cents: 5000, asOf: '2026-10-20', setAt: 1000 };
    const txns = [atm('2026-10-23', -20000), cashBuy('2026-10-25', -800), cashBuy('2026-10-26', -1250)];
    const c = cashBalance(txns, set);
    expect(c.left).toBe(22950);
    expect(c.withdrawals).toEqual({ count: 1, cents: 20000 });
    expect(c.spent).toEqual({ count: 2, cents: 2050 });
    expect(c.own).toEqual({ count: 0, cents: 0 });
  });

  it('own cash deposited lowers it; cash someone gave me does not', () => {
    const set = { cents: 5000, asOf: '2026-10-20', setAt: 1000 };
    expect(cashBalance([ownDep('2026-10-25', 4000)], set).left).toBe(1000);
    expect(cashBalance([giftDep('2026-10-25', 4000)], set).left).toBe(5000);
  });

  it('may go below zero', () => {
    expect(cashBalance([cashBuy('2026-10-25', -1250)], { cents: 500, asOf: '2026-10-20', setAt: 1 }).left).toBe(-750);
  });

  it('never set: counts everything from $0', () => {
    const c = cashBalance([atm('2026-01-03', -5000), cashBuy('2026-02-01', -1000)], null);
    expect(c.set).toBeNull();
    expect(c.left).toBe(4000);
  });

  it('nothing before the set date changes it; they stay in Spending', () => {
    const set = { cents: 3000, asOf: '2026-10-20', setAt: 1000 };
    const old = [atm('2026-10-10', -20000), cashBuy('2026-10-15', -1000)];
    expect(cashBalance(old, set).left).toBe(3000);
    expect(cashBalance(old, set).effects.size).toBe(0);
    expect(summarizeMonth(old, '2026-10').spent).toBe(1000);
  });

  it('on the set day, only cash purchases typed after you set it count', () => {
    const set = { cents: 3000, asOf: '2026-10-20', setAt: 1000 };
    expect(countsInCash(cashBuy('2026-10-20', -500, { createdAt: 999 }), set)).toBe(false);
    expect(countsInCash(cashBuy('2026-10-20', -500, { createdAt: 1001 }), set)).toBe(true);
    expect(countsInCash(atm('2026-10-20', -2000), set)).toBe(false);
    expect(countsInCash(atm('2026-10-21', -2000), set)).toBe(true);
  });

  it('effect of each row on cash; ordinary rows have none', () => {
    expect(cashEffect(cashBuy('2026-10-26', -1250))).toBe(-1250);
    expect(cashEffect(atm('2026-10-23', -20000))).toBe(20000);
    expect(cashEffect(ownDep('2026-10-25', 4000))).toBe(-4000);
    expect(cashEffect(giftDep('2026-10-25', 4000))).toBe(0);
    expect(cashEffect(bank('2026-10-25', -1200, 'FAKE CAFE SYDNEY'))).toBe(0);
  });

  it('editing or deleting an entry corrects it (worked out from the entries)', () => {
    const set = { cents: 5000, asOf: '2026-10-20', setAt: 1 };
    const a = cashBuy('2026-10-25', -1000);
    expect(cashBalance([a], set).left).toBe(4000);
    expect(cashBalance([{ ...a, amountCents: -400 }], set).left).toBe(4600);
    expect(cashBalance([{ ...a, cash: false }], set).left).toBe(5000);
    expect(cashBalance([], set).left).toBe(5000);
  });
});

describe('rose dot on Cash', () => {
  const set = { cents: 0, asOf: '2026-10-01', setAt: 1 };
  it('shows while a cash purchase is newer than the last import, then clears', () => {
    const txns = [cashBuy('2026-10-26', -500)];
    expect(cashDot(txns, set, '2026-10-24')).toBe(true);
    expect(cashDot(txns, set, '2026-10-27')).toBe(false);
  });
  it('withdrawals alone never show it', () => {
    expect(cashDot([atm('2026-10-26', -2000)], set, '2026-10-24')).toBe(false);
  });
});

describe('sync of the cash setting', () => {
  it('the newest saved setting wins; an older app (no field) never wipes it', () => {
    const a = { cents: 5000, asOf: '2026-10-20', setAt: 10, updatedAt: 10 };
    const b = { cents: 9000, asOf: '2026-10-25', setAt: 20, updatedAt: 20 };
    expect(mergeSnapshots({ cash: a }, { cash: b }).cash).toEqual(b);
    expect(mergeSnapshots({ cash: b }, { cash: a }).cash).toEqual(b);
    expect(mergeSnapshots({ cash: a }, { txns: [] }).cash).toEqual(a);
    expect(normalize({}).cash).toBeNull();
    expect(sameSnapshot({}, { cash: null })).toBe(true);
  });
});

describe('"Cash withdrawal?" question', () => {
  const unsorted = (cents, description) => ({ ...bank('2026-10-24', cents, description), kind: 'review', categoryId: null });
  it('asks on a round, unsorted money-out row with no card / BPAY / debit / PayID / transfer wording', () => {
    const t = unsorted(-6000, 'FAKEBANK CASH OUT FAKETOWN');
    expect(t.kind).toBe('review');
    expect(atmQuestion(t)).toBe(true);
  });
  it('does not ask: odd amounts, money in, card purchases, transfers, PayID, sorted rows, answered rows', () => {
    expect(atmQuestion(unsorted(-6050, 'FAKEBANK CASH OUT'))).toBe(false);
    expect(atmQuestion(unsorted(6000, 'FAKEBANK CASH OUT'))).toBe(false);
    expect(atmQuestion(unsorted(-6000, 'FAKE SHOP SYDNEY Card xx1234 Value Date: 20/10/2026'))).toBe(false);
    expect(atmQuestion(unsorted(-6000, 'Transfer To FAKE PERSON CommBank App'))).toBe(false);
    expect(atmQuestion(unsorted(-6000, 'Transfer to other Bank NetBank FAKE PayID Phone'))).toBe(false);
    expect(atmQuestion(unsorted(-6000, 'Direct Debit 123 FAKECO'))).toBe(false);
    expect(atmQuestion(unsorted(-6000, 'FAKE BILLER BPAY 123'))).toBe(false);
    expect(atmQuestion({ ...unsorted(-6000, 'FAKEBANK CASH OUT'), kind: 'spend', categoryId: 'shopping' })).toBe(false);
    expect(atmQuestion({ ...unsorted(-6000, 'FAKEBANK CASH OUT'), atm: false })).toBe(false);
    expect(atmQuestion({ ...unsorted(-6000, 'FAKEBANK CASH OUT'), atm: true })).toBe(false);
  });
  it('Yes = counted as a withdrawal (fills cash); No = never counted', () => {
    const t = unsorted(-6000, 'FAKEBANK CASH OUT FAKETOWN');
    const yes = { ...t, atm: true, kind: 'internal', categoryId: 'internal' };
    expect(isAtmWithdrawal(yes)).toBe(true);
    expect(movesCash(yes)).toBe(true);
    expect(cashBalance([yes], null).left).toBe(6000);
    expect(isAtmWithdrawal({ ...t, atm: false })).toBe(false);
    expect(isAtmWithdrawal({ ...atm('2026-10-24', -2000), atm: false })).toBe(false);
  });
});

describe('remembered answers (learned rules)', () => {
  const yesRule = { ...atmRule('FAKEBANK CASH', true), uid: 'r1', order: 2, updatedAt: 1 };
  const noRule = { ...atmRule('FAKEBANK CASH', false), uid: 'r2', order: 1, updatedAt: 1 };
  it('a remembered Yes files similar rows at import as ATM withdrawals', () => {
    const rules = [...usableUserRules([yesRule]), ...DEFAULT_RULES];
    const row = { importKey: 'x1', date: '2026-10-28', postedDate: '2026-10-28', amountCents: -4000, description: 'FAKEBANK CASH OUT FAKETOWN', rawDescription: '', balanceCents: 0 };
    const t = prepareImport([row], { rules }).toAdd[0];
    expect(t).toMatchObject({ kind: 'internal', categoryId: 'internal', atm: true });
    expect(isAtmWithdrawal(t)).toBe(true);
  });
  it('a remembered Yes also sorts waiting rows via Re-sort', () => {
    const waiting = { ...bank('2026-10-24', -6000, 'FAKEBANK CASH OUT'), kind: 'review', categoryId: null };
    expect(resortPlan([waiting], { userRules: [yesRule] })[0]).toMatchObject({ categoryId: 'internal', atm: true });
  });
  it('a remembered No never sorts anything and stops the question for similar rows', () => {
    expect(usableUserRules([noRule])).toEqual([]);
    expect(categorize('FAKEBANK CASH OUT', -6000, [...usableUserRules([noRule]), ...DEFAULT_RULES]).kind).toBe('review');
    const t = { ...bank('2026-10-24', -6000, 'FAKEBANK CASH OUT'), kind: 'review', categoryId: null };
    expect(atmQuestion(t, atmSkipRules([noRule, yesRule]))).toBe(false);
    expect(atmQuestion({ ...t, description: 'OTHERBANK CASH OUT' }, atmSkipRules([noRule]))).toBe(true);
  });
});

describe('screens', () => {
  const noop = () => {};
  const set = { cents: 5000, asOf: '2026-10-20', setAt: 1 };
  const txns = [atm('2026-10-23', -20000), cashBuy('2026-10-25', -800), cashBuy('2026-10-26', -1250), bank('2026-10-22', -1200, 'FAKE CAFE SYDNEY', { kind: 'spend', categoryId: 'eating-out' })];
  const cash = { ...cashBalance(txns, set), dot: true };

  it('Home shows the Cash button with cash left and the rose dot', () => {
    const out = renderToStaticMarkup(<Home txns={txns} today="2026-10-27" month="2026-10" setMonth={noop} firstMonth="2026-10"
      balance={{ cents: 104420, asOf: '2026-10-24' }} saverBalances={{}} est={null} cash={cash} onNavigate={noop} onDetail={noop} />);
    expect(out).toContain('>Cash<');
    expect(out).toContain('$229.50');
    expect(out).toContain('cash-dot');
  });

  it('Set cash balance sheet: calculated, your count, adjustment', () => {
    const out = renderToStaticMarkup(<SetCashSheet cash={cash} today="2026-10-27" onClose={noop} />);
    for (const s of ['How much cash do you have right now?', 'Cash in hand (AUD)', 'Cash left today (calculated)', 'Your count', 'Adjustment', 'Save cash balance']) expect(out).toContain(s);
    expect(out).toContain('value="229.50"');
    expect(out).toContain('none');
  });

  it('Add transaction shows "cash left $X after this" when the switch is on', () => {
    // Switch state is internal; check the label maths through CashRow directly.
    const out = renderToStaticMarkup(<AddTxn today="2026-10-27" usage={{}} cash={cash} onDone={noop} onToast={noop} />);
    expect(out).toContain('Off · comes out of Smart Access');
  });

  it('rows show their cash effect and the Cash withdrawal? tag', () => {
    expect(renderToStaticMarkup(<TxnRow t={{ ...txns[0], cashFx: 20000 }} onOpen={noop} />)).toContain('cash +$200.00');
    expect(renderToStaticMarkup(<TxnRow t={{ ...txns[1], cashFx: -800 }} onOpen={noop} />)).toContain('cash −$8.00');
    const ask = { ...bank('2026-10-24', -6000, 'FAKEBANK CASH OUT'), kind: 'review', categoryId: null, atmAsk: true };
    expect(renderToStaticMarkup(<TxnRow t={ask} onOpen={noop} />)).toContain('Cash withdrawal?');
  });

  it('the flagged row sheet asks, with the remember toggle off', () => {
    const ask = { ...bank('2026-10-24', -6000, 'FAKEBANK CASH OUT 1234'), kind: 'review', categoryId: null, atmAsk: true };
    const out = renderToStaticMarkup(<TxnSheet txn={ask} usage={{}} onClose={noop} onToast={noop} />);
    for (const s of ['Was this a cash withdrawal?', 'Yes, ATM cash', 'No, sort it myself', 'Remember for similar rows', 'Rows with “FAKEBANK CASH”']) expect(out).toContain(s);
    expect(out).toMatch(/aria-checked="false" aria-label="Remember for similar rows"/);
  });

  it('own-cash deposit sheet shows the cash balance effect', () => {
    const out = renderToStaticMarkup(<TxnSheet txn={ownDep('2026-10-25', 4000)} usage={{}} onClose={noop} onToast={noop} />);
    expect(out).toContain('Cash balance');
    expect(out).toContain('−$40.00');
  });
});

describe('CashRow label', () => {
  it('On · cash left $X after this', async () => {
    const { CashRow } = await import('../../components/ui.jsx');
    expect(renderToStaticMarkup(<CashRow on onChange={() => {}} left={21700} />)).toContain('On · cash left $217.00 after this');
    expect(renderToStaticMarkup(<CashRow on onChange={() => {}} />)).toContain('>On<');
  });
});
