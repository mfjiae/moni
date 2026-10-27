// Batch 3 (27 Oct 2026): Quick sort logic, savings goal, tag pinning, goal sync. Fake data only.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { sortQueue, nextIndex, quickChips, rememberKeyword } from '../quicksort.js';
import { goalProgress, goalView } from '../goals.js';
import { mergeSnapshots, normalize } from '../merge.js';
import TxnRow from '../../components/TxnRow.jsx';
import { readFileSync } from 'node:fs';

const rev = (uid, date, cents, description, extra = {}) => ({ uid, date, amountCents: cents, kind: 'review', categoryId: null, description, source: 'csv', ...extra });

describe('Quick sort queue', () => {
  const txns = [
    rev('a', '2026-10-20', -500, 'FAKE CAFE Card xx1111 Value Date: 20/10/2026'),
    rev('b', '2026-10-25', -900, 'FAKE SHOP Card xx1111 Value Date: 25/10/2026'),
    { uid: 'c', date: '2026-10-26', amountCents: -100, kind: 'spend', categoryId: 'groceries', description: 'sorted', source: 'csv' },
    rev('d', '2026-10-25', 4000, 'FAKE PAY IN', { postedDate: '2026-10-26' }),
  ];
  it('lists only To sort rows, newest first', () => {
    expect(sortQueue(txns)).toEqual(['d', 'b', 'a']);
  });
  it('skips rows that were sorted meanwhile', () => {
    const q = sortQueue(txns);
    const by = new Map(txns.map((t) => [t.uid, t]));
    expect(nextIndex(q, by, 0)).toBe(0);
    by.set('d', { ...by.get('d'), kind: 'spend' });
    expect(nextIndex(q, by, 0)).toBe(1);
    expect(nextIndex(q, by, 3)).toBe(-1);
  });
});

describe('Quick sort chips', () => {
  it('money out and money in get different chips, most used first, max 4 on top', () => {
    const out = quickChips(-500, { groceries: 9, shopping: 4 });
    expect(out.top.length).toBeLessThanOrEqual(4);
    expect(out.top[0].id).toBe('groceries');
    expect(out.top.some((c) => c.type === 'income')).toBe(false);
    const inn = quickChips(500, {});
    expect(inn.top.length).toBeGreaterThan(0);
    expect(out.top.map((c) => c.id)).not.toEqual(inn.top.map((c) => c.id));
  });
  it('More… holds the rest and never repeats the top chips', () => {
    const { top, more } = quickChips(-500, {});
    const ids = new Set(top.map((c) => c.id));
    expect(more.some((c) => ids.has(c.id))).toBe(false);
    expect(more.length).toBeGreaterThan(0);
  });
});

describe('Remember for similar rows', () => {
  it('works for a merchant bank row', () => {
    expect(rememberKeyword(rev('x', '2026-10-20', -500, 'FAKE CAFE Card xx1111 Value Date: 20/10/2026'))).toBeTruthy();
  });
  it('is off for typed rows and too-general text', () => {
    expect(rememberKeyword({ ...rev('x', '2026-10-20', -500, 'Coffee'), source: 'manual' })).toBe('');
    expect(rememberKeyword(rev('x', '2026-10-20', -500, 'Direct Debit 123456 '))).toBe('');
  });
});

describe('Savings goal', () => {
  const goal = { name: 'Holiday', targetCents: 100000, startDate: '2026-10-01', byDate: '2026-12-31', updatedAt: 1 };
  const sv = (date, cents) => ({ uid: date + cents, date, amountCents: cents, kind: 'saving', categoryId: 'saving' });
  it('counts money moved into savings since the start date, minus money out; ignores earlier and interest', () => {
    const txns = [sv('2026-09-30', -50000), sv('2026-10-05', -20000), sv('2026-10-20', 5000),
      { uid: 'i', date: '2026-10-21', amountCents: 300, kind: 'income', categoryId: 'interest' }];
    expect(goalProgress(goal, txns)).toBe(15000);
  });
  it('on track vs behind vs done vs late', () => {
    const today = '2026-11-15'; // about 45 of 91 days gone
    const base = [sv('2026-10-05', -30000)];
    expect(goalView(goal, base, today).status).toBe('behind');
    const ahead = [sv('2026-10-05', -60000)];
    const v = goalView(goal, ahead, today);
    expect(v.status).toBe('ontrack');
    expect(v.left).toBe(40000);
    expect(v.perWeek).toBeGreaterThan(0);
    expect(goalView(goal, [sv('2026-10-05', -100000)], today).status).toBe('done');
    expect(goalView(goal, base, '2027-01-05').status).toBe('late');
  });
  it('percent is capped and never negative', () => {
    expect(goalView(goal, [sv('2026-10-05', -500000)], '2026-11-01').pct).toBe(100);
    expect(goalView(goal, [sv('2026-10-05', 9000)], '2026-11-01').pct).toBe(0);
  });
});

describe('Goal sync', () => {
  it('the newest goal wins and an empty side keeps the other', () => {
    const a = { goal: { name: 'A', targetCents: 1, byDate: '2027-01-01', startDate: '2026-10-01', updatedAt: 5 } };
    const b = { goal: { name: 'B', targetCents: 2, byDate: '2027-01-01', startDate: '2026-10-01', updatedAt: 9 } };
    expect(mergeSnapshots(a, b).goal.name).toBe('B');
    expect(mergeSnapshots(b, a).goal.name).toBe('B');
    expect(mergeSnapshots(a, {}).goal.name).toBe('A');
    expect(normalize({}).goal).toBe(null);
  });
  it('a removal marker newer than the goal wins', () => {
    const a = { goal: { name: 'A', targetCents: 1, byDate: '2027-01-01', startDate: '2026-10-01', updatedAt: 5 } };
    const gone = { goal: { removed: true, updatedAt: 8 } };
    expect(mergeSnapshots(a, gone).goal.removed).toBe(true);
  });
});

describe('Row tags stay pinned', () => {
  it('the category text sits in its own ellipsis span and the tag is a sibling', () => {
    const t = { uid: 'z', date: '2026-10-26', amountCents: -2000, kind: 'internal', categoryId: 'internal', description: 'ATM WITHDRAWAL CBA ATM BROADWAY', source: 'csv' };
    const out = renderToStaticMarkup(<TxnRow t={t} onOpen={() => {}} />);
    expect(out).toContain('class="small cat-line"');
    expect(out).toMatch(/<span class="cat-text">[^<]*<\/span><span class="cash-tag/);
  });
  it('CSS pins tags and ellipsises the text', () => {
    const css = readFileSync('src/index.css', 'utf8');
    expect(css).toMatch(/\.cat-line > \.cash-tag[^{]*\{[^}]*flex: none/);
    expect(css).toMatch(/\.cat-text \{[^}]*text-overflow: ellipsis/);
    expect(css).toMatch(/:focus-visible \{ outline: 2px solid var\(--balance\)/);
  });
});
