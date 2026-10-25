// M4: ETF tags and splits, the Investments page numbers, Tuition by semester, syncing the ETF list.
// Fake data and sample amounts only.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  cleanTicker, splitOf, etfShares, buildSplit, lastPick, etfList, rangeStart, investView, UNTAGGED, etfUid,
} from '../investing.js';
import { tuitionView, semesterOf, prevSemester, yearAgo, pct } from '../tuition.js';
import { mergeSnapshots } from '../merge.js';
import { InvestmentsPage, TuitionPage } from '../../components/InvestPages.jsx';
import TxnSheet from '../../components/TxnSheet.jsx';

const inv = (uid, date, cents, etfSplit, extra = {}) => ({
  uid, date, amountCents: cents, kind: 'investing', categoryId: 'investing', description: 'FAKE BETASHARES', source: 'csv', etfSplit, ...extra,
});
const TODAY = '2026-10-25';
const txns = [
  inv('a', '2026-05-10', -20000, [{ ticker: 'AAA', cents: 20000 }]),
  inv('b', '2026-06-10', -30000, [{ ticker: 'AAA', cents: 18000 }, { ticker: 'BBB', cents: 12000 }]),
  inv('c', '2026-08-10', -40000, undefined),                                    // not tagged
  inv('d', '2026-09-17', -35000, [{ ticker: 'BBB', cents: 35000 }]),
  inv('e', '2026-10-17', -35000, [{ ticker: 'AAA', cents: 30000 }]),           // bad split: doesn't add up -> not tagged
  inv('old', '2025-12-01', -10000, [{ ticker: 'CCC', cents: 10000 }]),
  { uid: 's', date: '2026-10-01', amountCents: -5000, kind: 'spend', categoryId: 'groceries', description: 'FAKE SHOP', source: 'csv' },
];

describe('tickers and splits', () => {
  it('cleans a ticker and refuses junk', () => {
    expect(cleanTicker(' bgbl ')).toBe('BGBL');
    expect(cleanTicker('ioz.ax')).toBe('IOZ.AX');
    expect(() => cleanTicker('')).toThrow();
    expect(() => cleanTicker('not a ticker')).toThrow();
  });
  it('a split only counts when it adds up exactly, with no repeats or zero amounts', () => {
    expect(splitOf(txns[1])).toHaveLength(2);
    expect(splitOf(txns[4])).toBeNull();
    expect(splitOf(inv('x', TODAY, -100, [{ ticker: 'A', cents: 50 }, { ticker: 'A', cents: 50 }]))).toBeNull();
    expect(splitOf(inv('x', TODAY, -100, [{ ticker: 'A', cents: 100 }, { ticker: 'B', cents: 0 }]))).toBeNull();
    expect(splitOf(inv('x', TODAY, -100, []))).toBeNull();
  });
  it('shares per ETF; untagged and money back', () => {
    expect(etfShares(txns[1])).toEqual({ AAA: 18000, BBB: 12000 });
    expect(etfShares(txns[2])).toEqual({ [UNTAGGED]: 40000 });
    expect(etfShares(inv('r', TODAY, 5000, [{ ticker: 'AAA', cents: 5000 }]))).toEqual({ AAA: -5000 });
  });
  it('buildSplit: one ETF takes the whole amount; several must add up; none = not tagged', () => {
    expect(buildSplit([{ ticker: 'AAA', cents: NaN }], -35000)).toEqual({ split: [{ ticker: 'AAA', cents: 35000 }], left: 0, ok: true });
    expect(buildSplit([{ ticker: '', cents: NaN }], -35000)).toEqual({ split: [], left: 35000, ok: true });
    expect(buildSplit([], -35000).split).toEqual([]);
    const two = buildSplit([{ ticker: 'AAA', cents: 24500 }, { ticker: 'BBB', cents: 10500 }], -35000);
    expect(two).toMatchObject({ ok: true, left: 0 });
    expect(buildSplit([{ ticker: 'AAA', cents: 24500 }, { ticker: 'BBB', cents: 10000 }], -35000)).toMatchObject({ ok: false, left: 500, split: null });
    expect(buildSplit([{ ticker: 'AAA', cents: 24500 }, { ticker: 'AAA', cents: 10500 }], -35000).ok).toBe(false);
    expect(buildSplit([{ ticker: 'AAA', cents: 24500 }, { ticker: '', cents: 10500 }], -35000).ok).toBe(false);
  });
  it('pre-picks the ETF of the newest tagged buy', () => {
    expect(lastPick(txns)).toBe('BBB');
    expect(lastPick([txns[2]])).toBeNull();
  });
  it('ETF list: synced ones plus any used, biggest all-time first', () => {
    expect(etfList([{ uid: etfUid('ZZZ'), ticker: 'ZZZ' }], txns)).toEqual(['BBB', 'AAA', 'CCC', 'ZZZ']);
  });
});

describe('ranges', () => {
  it('1W = last 7 days, 1M = since the same day last month, 3M/6M/1Y = whole months, All = first buy', () => {
    expect(rangeStart('1w', TODAY)).toBe('2026-10-19');
    expect(rangeStart('1m', TODAY)).toBe('2026-09-26');
    expect(rangeStart('1m', '2026-03-31')).toBe('2026-03-01');
    expect(rangeStart('3m', TODAY)).toBe('2026-08-01');
    expect(rangeStart('6m', TODAY)).toBe('2026-05-01');
    expect(rangeStart('1y', TODAY)).toBe('2025-11-01');
    expect(rangeStart('all', TODAY, '2025-12-01')).toBe('2025-12-01');
  });
});

describe('investView', () => {
  const order = etfList([], txns);
  it('6M: totals, per-ETF rows, untagged, months and the stacked running total', () => {
    const v = investView(txns, '6m', TODAY, order);
    expect(v.total).toBe(20000 + 30000 + 40000 + 35000 + 35000);
    expect(v.allTime).toBe(v.total + 10000);
    expect(Object.fromEntries(v.rows.map((r) => [r.id, r.cents]))).toEqual({ AAA: 38000, BBB: 47000, [UNTAGGED]: 75000 });
    expect(v.rows[v.rows.length - 1].id).toBe(UNTAGGED);            // not tagged sits on top
    expect(v.untagged).toBe(2);
    expect(v.keys).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    const aaa = v.bands.find((b) => b.id === 'AAA').values;
    expect(aaa).toEqual([20000, 38000, 38000, 38000, 38000, 38000]);
    const top = v.keys.map((_, i) => v.bands.reduce((a, b) => a + b.values[i], 0));
    expect(top[top.length - 1]).toBe(v.total);
    expect(v.months.map((m) => m.cents)).toEqual([35000, 35000, 40000, 0, 30000, 20000]);
    expect(v.list.every((t) => t.kind === 'investing')).toBe(true);
  });
  it('1W uses days; spending never counts', () => {
    const v = investView(txns, '1w', TODAY, order);
    expect(v.daily).toBe(true);
    expect(v.keys).toHaveLength(7);
    expect(v.total).toBe(0);
    expect(v.bands).toEqual([]);
  });
  it('All starts at the first buy', () => {
    const v = investView(txns, 'all', TODAY, order);
    expect(v.keys[0]).toBe('2025-12');
    expect(v.total).toBe(v.allTime);
  });
});

describe('tuition by semester', () => {
  const tu = (uid, date, cents) => ({ uid, date, amountCents: cents, kind: 'spend', categoryId: 'tuition', description: 'FAKE UNI BPAY', source: 'csv' });
  const list = [
    tu('t1', '2025-03-03', -400000), tu('t2', '2025-07-28', -400000),
    tu('t3', '2026-03-02', -440000), tu('t3r', '2026-03-20', 20000),            // refund reduces Autumn 2026
    tu('t4', '2026-07-27', -440000),
    { uid: 'x', date: '2026-07-27', amountCents: -5000, kind: 'spend', categoryId: 'education' },
  ];
  it('Jan–Jun = Autumn, Jul–Dec = Spring', () => {
    expect(semesterOf('2026-06-30')).toEqual({ year: 2026, term: 'A' });
    expect(semesterOf('2026-07-01')).toEqual({ year: 2026, term: 'S' });
    expect(prevSemester('2026-S')).toBe('2026-A');
    expect(prevSemester('2026-A')).toBe('2025-S');
    expect(yearAgo('2026-S')).toBe('2025-S');
    expect(pct(110, 100)).toBe(10);
    expect(pct(100, 0)).toBeNull();
  });
  it('totals, newest first, chip vs the semester before and the same one a year earlier', () => {
    const v = tuitionView(list);
    expect(v.total).toBe(400000 + 400000 + 420000 + 440000);
    expect(v.count).toBe(4);
    expect(v.average).toBe(415000);
    expect(v.semesters.map((s) => s.name)).toEqual(['Spring 2026', 'Autumn 2026', 'Spring 2025', 'Autumn 2025']);
    const [s26, a26, s25, a25] = v.semesters;
    expect(s26.vsPrev).toMatchObject({ name: 'Autumn 2026', pct: 4.8 });     // 4400 vs 4200
    expect(s26.vsYear).toMatchObject({ name: 'Spring 2025', pct: 10 });
    expect(a26.cents).toBe(420000);
    expect(a26.payments.map((t) => t.uid)).toEqual(['t3r', 't3']);
    expect(a26.vsPrev).toMatchObject({ name: 'Spring 2025', pct: 5 });
    expect(a26.vsYear).toMatchObject({ name: 'Autumn 2025', pct: 5 });
    expect(s25.vsPrev).toMatchObject({ name: 'Autumn 2025', pct: 0 });
    expect(s25.vsYear).toBeNull();
    expect(a25.vsPrev).toBeNull();
  });
  it('no tuition: empty', () => {
    expect(tuitionView([])).toEqual({ total: 0, count: 0, average: 0, semesters: [] });
  });
  it('the page draws chips and the comparison line', () => {
    const out = renderToStaticMarkup(<TuitionPage txns={list} today={TODAY} onOpen={() => {}} />);
    expect(out).toContain('Spring 2026');
    expect(out).toContain('+4.8%');
    expect(out).toContain('vs Autumn 2026 · +10% vs Spring 2025');
    expect(out).toContain('sem-chip flat');                     // Spring 2025: 0% vs Autumn 2025
    expect(out).toContain('$16,600.00');
  });
});

describe('Investments page and the ETF picker', () => {
  it('draws the range buttons, stacked chart, donut, each month and tags', () => {
    const out = renderToStaticMarkup(<InvestmentsPage txns={txns} today={TODAY} onOpen={() => {}} etfs={etfList([], txns)} />);
    expect(out).toContain('Put in, last 6 months');
    expect(out).toContain('$1,600.00');
    expect(out).toContain('class="stacked"');
    expect(out).toContain('By ETF');
    expect(out).toContain('Not tagged');
    expect(out).toContain('Each month');
    expect(out).toContain('etf-tag none');
    expect(out).toContain('>BBB<');
  });
  it('the sheet asks which ETF for an investing transaction and pre-picks the last one', () => {
    const out = renderToStaticMarkup(<TxnSheet txn={txns[2]} etfs={['BBB', 'AAA']} lastEtf="BBB" onClose={() => {}} onToast={() => {}} />);
    expect(out).toContain('Which ETF?');
    expect(out).toMatch(/<option value="BBB" selected="">BBB<\/option>/);
    expect(out).not.toContain('Left to split');
  });
  it('a split transaction opens with both rows and the left-to-split line', () => {
    const out = renderToStaticMarkup(<TxnSheet txn={txns[1]} etfs={['BBB', 'AAA']} onClose={() => {}} onToast={() => {}} />);
    expect(out).toContain('Which ETFs did this buy?');
    expect(out).toContain('Left to split');
    expect(out).toContain('value="180.00"');
  });
  it('a spending transaction has no ETF picker', () => {
    expect(renderToStaticMarkup(<TxnSheet txn={txns[6]} etfs={['BBB']} onClose={() => {}} onToast={() => {}} />)).not.toContain('Which ETF');
  });
});

describe('syncing the ETF list', () => {
  const base = { txns: [], rules: [], categories: [], tombstones: {} };
  it('merges ETF records and keeps them when the other side is an older app', () => {
    const a = { ...base, etfs: [{ uid: etfUid('AAA'), ticker: 'AAA', updatedAt: 1 }] };
    const b = { ...base, etfs: [{ uid: etfUid('BBB'), ticker: 'BBB', updatedAt: 2 }] };
    expect(mergeSnapshots(a, b).etfs.map((e) => e.ticker)).toEqual(['AAA', 'BBB']);
    expect(mergeSnapshots(a, base).etfs).toHaveLength(1);
  });
  it('tags travel on the transaction: the newer edit wins', () => {
    const t1 = { ...txns[2], updatedAt: 5 };
    const t2 = { ...txns[2], etfSplit: [{ ticker: 'AAA', cents: 40000 }], updatedAt: 9 };
    expect(mergeSnapshots({ ...base, txns: [t1] }, { ...base, txns: [t2] }).txns[0].etfSplit).toEqual(t2.etfSplit);
  });
});

// ---- Manage ETFs (M4.2) ----
import { buyCount, renameInSplit, planRenameEtf, planRemoveEtf } from '../investing.js';
import { ManageEtfsSheet } from '../../components/InvestPages.jsx';

describe('Manage ETFs plans', () => {
  const recs = [{ uid: 'etf|AAA', ticker: 'AAA' }, { uid: 'etf|BBB', ticker: 'BBB' }, { uid: 'etf|ZZZ', ticker: 'ZZZ' }];
  it('counts buys per ticker', () => {
    expect(buyCount(txns, 'AAA')).toBe(3);
    expect(buyCount(txns, 'BBB')).toBe(2);
    expect(buyCount(txns, 'ZZZ')).toBe(0);
  });
  it('rename rewrites every split and moves the list record', () => {
    const p = planRenameEtf(recs, txns, 'AAA', ' qqq ', 5);
    expect(p.to).toBe('QQQ');
    expect(p.merge).toBe(false);
    expect(p.updates).toHaveLength(3);
    expect(p.updates.find((u) => u.uid === 'b').etfSplit).toEqual([{ ticker: 'QQQ', cents: 18000 }, { ticker: 'BBB', cents: 12000 }]);
    expect(p.put).toEqual({ uid: 'etf|QQQ', ticker: 'QQQ', updatedAt: 5 });
    expect(p.del).toEqual(['etf|AAA']);
  });
  it('rename to an existing ticker merges and adds cents when a split would have it twice', () => {
    const p = planRenameEtf(recs, txns, 'AAA', 'BBB');
    expect(p.merge).toBe(true);
    expect(p.updates.find((u) => u.uid === 'b').etfSplit).toEqual([{ ticker: 'BBB', cents: 30000 }]);
    expect(renameInSplit([{ ticker: 'A', cents: 1 }, { ticker: 'B', cents: 2 }], 'A', 'B')).toEqual([{ ticker: 'B', cents: 3 }]);
  });
  it('rename to the same name does nothing; junk throws', () => {
    expect(planRenameEtf(recs, txns, 'AAA', 'aaa').updates).toEqual([]);
    expect(() => planRenameEtf(recs, txns, 'AAA', 'not a ticker')).toThrow();
  });
  it('remove makes the whole buy Not tagged, even a split one', () => {
    const p = planRemoveEtf(txns, 'AAA');
    expect(p.buys).toBe(3);
    expect(p.updates.find((u) => u.uid === 'b').etfSplit).toEqual([]);
    expect(p.del).toEqual(['etf|AAA']);
    expect(planRemoveEtf(txns, 'ZZZ').updates).toEqual([]);
  });
  it('after a remove the buys count as Not tagged', () => {
    const after = txns.map((t) => (t.uid === 'a' ? { ...t, etfSplit: [] } : t));
    expect(etfShares(after[0])).toEqual({ [UNTAGGED]: 20000 });
  });
  it('the sheet lists each ETF with its buy count, Rename, Remove and the add box', () => {
    const html = renderToStaticMarkup(<ManageEtfsSheet txns={txns} etfs={['AAA', 'BBB', 'ZZZ']} colorOf={() => '#fff'} onClose={() => {}} />);
    expect(html).toContain('Manage ETFs');
    expect(html).toContain('3 buys');
    expect(html).toContain('0 buys');
    expect(html).toContain('Rename');
    expect(html).toContain('Remove');
    expect(html).toContain('New ticker, like BGBL');
  });
});
