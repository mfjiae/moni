// Batch 4 (27 Oct 2026): backup and restore, "Remember these for next time?", offline pill. Fake data only.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildBackup, parseBackup, backupCounts, planRestore, backupDue, backupAgo, backupFileName, REMIND_AFTER_MS } from '../backup.js';
import { normalize } from '../merge.js';
import { rememberCandidates } from '../screenshot.js';
import { DEFAULT_RULES, makeUserRule } from '../rules.js';
import { OfflinePill } from '../../components/ui.jsx';
import { readFileSync } from 'node:fs';

const t = (uid, updatedAt, extra = {}) => ({ uid, date: '2026-10-20', amountCents: -500, kind: 'spend', categoryId: 'groceries', description: uid, source: 'csv', updatedAt, ...extra });
const snap = (extra = {}) => normalize({ txns: [], rules: [], bills: [], ...extra });

describe('backup file', () => {
  it('round-trips and never holds a sync token', () => {
    const s = snap({ txns: [t('a', 1)], balance: { cents: 100, asOf: '2026-10-20', updatedAt: 1 } });
    const text = JSON.stringify(buildBackup(s, 1234));
    expect(text).not.toMatch(/token/i);
    const back = parseBackup(text);
    expect(back.savedAt).toBe(1234);
    expect(back.snapshot.txns.map((x) => x.uid)).toEqual(['a']);
    expect(back.snapshot.balance.cents).toBe(100);
  });
  it('rejects other files with plain words', () => {
    expect(() => parseBackup('not json')).toThrow(/isn’t a moni backup/);
    expect(() => parseBackup('{"hello":1}')).toThrow(/isn’t a moni backup/);
    expect(() => parseBackup(JSON.stringify({ app: 'moni', backupVersion: 99, snapshot: {} }))).toThrow(/newer version/);
    expect(() => parseBackup(JSON.stringify({ app: 'moni', backupVersion: 1, snapshot: { txns: 5 } }))).toThrow(/damaged/);
  });
  it('counts what is inside (dismissed bill suggestions are not bills; accounts = balances held)', () => {
    const s = snap({
      txns: [t('a', 1), t('b', 1)], rules: [{ uid: 'r', updatedAt: 1 }], names: [{ uid: 'n', updatedAt: 1 }],
      bills: [{ uid: 'b1', updatedAt: 1 }, { uid: 'bill|skip|X', dismissed: true, updatedAt: 1 }],
      budgets: [{ uid: 'g', updatedAt: 1 }], balance: { cents: 1, asOf: '2026-10-01' }, balances: { xx2066: { cents: 5 } },
    });
    expect(backupCounts(s)).toEqual({ txns: 2, rules: 1, names: 1, bills: 1, budgets: 1, accounts: 2 });
  });
  it('names the file by Sydney date', () => {
    expect(backupFileName(new Date('2026-10-27T20:00:00Z'))).toBe('moni-backup-2026-10-28.json');
  });
});

describe('restore: merge', () => {
  it('adds what is missing, newest edit wins, deletes nothing', () => {
    const local = snap({ txns: [t('a', 5, { note: 'new' }), t('only-here', 1)] });
    const file = snap({ txns: [t('a', 2, { note: 'old' }), t('only-file', 1)] });
    const { result } = planRestore(local, file, 'merge', 100);
    const by = Object.fromEntries(result.txns.map((x) => [x.uid, x]));
    expect(Object.keys(by).sort()).toEqual(['a', 'only-file', 'only-here']);
    expect(by.a.note).toBe('new');
  });
  it('a delete made after the backup stays deleted', () => {
    const local = snap({ tombstones: { gone: 50 } });
    const file = snap({ txns: [t('gone', 10)] });
    expect(planRestore(local, file, 'merge', 100).result.txns).toEqual([]);
  });
});

describe('restore: replace', () => {
  it('device becomes the backup: local-only records get delete marks, file records are stamped now', () => {
    const local = snap({ txns: [t('a', 5), t('only-here', 1)], tombstones: { 'was-deleted': 3 }, cash: { cents: 9, updatedAt: 1 } });
    const file = snap({ txns: [t('a', 2), t('was-deleted', 1)], goal: { name: 'x', updatedAt: 1 } });
    const { result } = planRestore(local, file, 'replace', 100);
    expect(result.txns.map((x) => x.uid).sort()).toEqual(['a', 'was-deleted']);
    expect(result.txns.every((x) => x.updatedAt === 100)).toBe(true);
    expect(result.tombstones['only-here']).toBe(100);
    expect(result.tombstones.a).toBeUndefined();
    expect(result.cash).toBeNull();
    expect(result.goal.updatedAt).toBe(100);
  });
  it('a restored record beats an older delete mark from another device', () => {
    const file = snap({ txns: [t('x', 1)], tombstones: { x: 50 } });
    const { result } = planRestore(snap(), file, 'replace', 100);
    expect(result.tombstones.x).toBeUndefined();
    expect(result.txns[0].updatedAt).toBeGreaterThan(50);
  });
});

describe('backup reminder', () => {
  const now = 100 * 86400000;
  it('due after 30 days since the last backup, or since the clock started when there never was one', () => {
    expect(backupDue({ at: now - REMIND_AFTER_MS - 1 }, true, now)).toBe(true);
    expect(backupDue({ at: now - 10 * 86400000 }, true, now)).toBe(false);
    expect(backupDue({ since: now - 31 * 86400000 }, true, now)).toBe(true);
  });
  it('not due without data, with the switch off, or before the clock starts', () => {
    expect(backupDue({ at: 0 }, false, now)).toBe(false);
    expect(backupDue({ at: 0, remind: false }, true, now)).toBe(false);
    expect(backupDue(null, true, now)).toBe(false);
  });
  it('says how long ago', () => {
    expect(backupAgo(null, now)).toBe('never');
    expect(backupAgo(now - 9 * 86400000, now)).toBe('9 days ago');
    expect(backupAgo(now - 86400000, now)).toBe('1 day ago');
    expect(backupAgo(now - 1000, now)).toBe('today');
  });
});

describe('Remember these for next time? (screenshot import)', () => {
  const it0 = (id, name, categoryId, extra = {}) => ({ id, name, amountCents: -650, kind: 'spend', categoryId, transfer: false, atm: false, ...extra });
  const rules = [...DEFAULT_RULES];
  it('offers one rule per name, with the row count', () => {
    const { candidates } = rememberCandidates([it0('1', 'Fakecafe Brightside', 'eating-out'), it0('2', 'Fakecafe Brightside', 'eating-out'), it0('3', 'Fakegym Nova', 'sport')], { rules });
    expect(candidates.map((c) => [c.key, c.categoryId, c.count])).toEqual([['FAKECAFE BRIGHTSIDE', 'eating-out', 2], ['FAKEGYM NOVA', 'sport', 1]]);
  });
  it('leaves out people, too-general names, rows left in To sort, transfers and ATM rows', () => {
    const { candidates, skipped } = rememberCandidates([
      it0('1', 'Fast Transfer To FAKE PERSON', 'gifts'),
      it0('2', 'Direct Debit 123456', 'utilities'),
      it0('6', 'Sam Fakename', 'gifts', { bankLabel: 'Transfers & payments' }),
      it0('3', 'Fakeshop One', 'shopping'),
      it0('4', 'Transfer to xx2066', 'saving', { kind: 'saving', transfer: true }),
      it0('5', 'ATM Fakestreet', 'internal', { kind: 'internal', atm: true }),
    ], { toSort: new Set(['3']), rules });
    expect(candidates).toEqual([]);
    expect(skipped).toBe(3);
  });
  it('skips a name your rules already sort that way, and a name given two categories', () => {
    const mine = [makeUserRule('FAKEMART', 'groceries', 'spend'), ...DEFAULT_RULES];
    const { candidates, skipped } = rememberCandidates([it0('1', 'Fakemart Central', 'groceries'), it0('2', 'Fakeshop Two', 'shopping'), it0('3', 'Fakeshop Two', 'gifts')], { rules: mine });
    expect(candidates).toEqual([]);
    expect(skipped).toBe(1);
  });
});

describe('offline notice B1', () => {
  it('is a red warning pill with a status role and a full sentence for screen readers', () => {
    const out = renderToStaticMarkup(<OfflinePill />);
    expect(out).toContain('off-pill');
    expect(out).toContain('Offline');
    expect(out).toContain('role="status"');
    expect(out).toContain('sync when you are back online');
  });
  it('the header keeps a fixed place for it (inside the month cell, so the sort pill never moves)', () => {
    const home = readFileSync(new URL('../../components/Home.jsx', import.meta.url), 'utf8');
    expect(home).toContain('head-month');
    expect(home).toMatch(/\{!online && <OfflinePill \/>\}/);
  });
});
