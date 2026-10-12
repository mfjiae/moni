import { describe, it, expect } from 'vitest';
import { mergeSnapshots, sameSnapshot, stableStringify, normalize } from '../merge.js';
import { toBase64, fromBase64 } from '../github.js';

const t = (uid, updatedAt, extra = {}) => ({ uid, updatedAt, amountCents: -100, categoryId: 'groceries', ...extra });

describe('merge between devices', () => {
  it('first sync with an empty remote keeps everything local', () => {
    const local = { txns: [t('a', 1), t('b', 1)], rules: [], tombstones: {}, balance: null };
    expect(mergeSnapshots(local, null).txns.map((x) => x.uid)).toEqual(['a', 'b']);
  });

  it('a new device pulls everything', () => {
    const remote = { txns: [t('a', 1)], rules: [{ uid: 'r1', updatedAt: 1 }], tombstones: {}, balance: { asOf: '2026-10-01', cents: 6315 } };
    const m = mergeSnapshots({}, remote);
    expect(m.txns).toHaveLength(1);
    expect(m.rules).toHaveLength(1);
    expect(m.balance.cents).toBe(6315);
  });

  it('combines records added on different devices', () => {
    const m = mergeSnapshots({ txns: [t('phone', 5)] }, { txns: [t('desk', 6)] });
    expect(m.txns.map((x) => x.uid)).toEqual(['desk', 'phone']);
  });

  it('the newest edit wins', () => {
    const m = mergeSnapshots(
      { txns: [t('a', 10, { categoryId: 'shopping' })] },
      { txns: [t('a', 20, { categoryId: 'entertainment' })] },
    );
    expect(m.txns[0].categoryId).toBe('entertainment');
  });

  it('the same bank row imported on both devices appears once', () => {
    const m = mergeSnapshots({ txns: [t('csv|k1', 3)] }, { txns: [t('csv|k1', 4)] });
    expect(m.txns).toHaveLength(1);
  });

  it('a delete on one device removes it everywhere', () => {
    const m = mergeSnapshots({ txns: [t('a', 5)] }, { txns: [], tombstones: { a: 9 } });
    expect(m.txns).toHaveLength(0);
    expect(m.tombstones.a).toBe(9);
  });

  it('an edit made after the delete brings it back', () => {
    const m = mergeSnapshots({ txns: [t('a', 12)] }, { tombstones: { a: 9 } });
    expect(m.txns).toHaveLength(1);
  });

  it('keeps the newer bank balance', () => {
    const m = mergeSnapshots(
      { balance: { asOf: '2026-10-05', cents: 100, updatedAt: 1 } },
      { balance: { asOf: '2026-10-01', cents: 999, updatedAt: 2 } },
    );
    expect(m.balance.cents).toBe(100);
  });

  it('is the same whichever side is local', () => {
    const a = { txns: [t('x', 1), t('y', 3)], tombstones: { z: 4 } };
    const b = { txns: [t('y', 2), t('z', 1)], tombstones: {} };
    expect(sameSnapshot(mergeSnapshots(a, b), mergeSnapshots(b, a))).toBe(true);
  });

  it('merging again changes nothing (so no endless re-uploads)', () => {
    const a = { txns: [t('x', 1)] };
    const b = { txns: [t('y', 2)] };
    const once = mergeSnapshots(a, b);
    expect(sameSnapshot(mergeSnapshots(once, b), once)).toBe(true);
  });
});

describe('helpers', () => {
  it('stable stringify ignores key order', () => {
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(stableStringify({ a: [2, { c: 2, d: 1 }], b: 1 }));
  });
  it('normalize sorts by uid', () => {
    expect(normalize({ txns: [t('b', 1), t('a', 1)] }).txns[0].uid).toBe('a');
  });
  it('base64 round-trips non-English text and symbols', () => {
    const s = JSON.stringify({ note: 'phở with Paul — $12.40 ✓' });
    expect(fromBase64(toBase64(s))).toBe(s);
  });
});
