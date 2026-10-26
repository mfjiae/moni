// A table's key can't change in place in IndexedDB: the upgrade fails and the app sits on "Loading…"
// for everyone who already has data (this happened with `bills` in the first M5 release).
// So across the version history, a table that comes back with a different key must have been dropped (null) first.
import { describe, it, expect } from 'vitest';
import { db } from '../db.js';

const keyOf = (spec) => spec.split(',')[0].trim();

describe('database versions', () => {
  it('never change a table key without dropping the table first', () => {
    const versions = [...db._versions].sort((a, b) => a._cfg.version - b._cfg.version);
    const keys = {};
    const problems = [];
    for (const v of versions) {
      for (const [name, spec] of Object.entries(v._cfg.storesSource ?? {})) {
        if (spec === null) { delete keys[name]; continue; }
        const k = keyOf(spec);
        if (name in keys && keys[name] !== k) problems.push(`${name}: ${keys[name]} -> ${k} in v${v._cfg.version}`);
        keys[name] = k;
      }
    }
    expect(problems).toEqual([]);
    expect(keys.bills).toBe('uid');
  });
  it('the real bug would be caught: v1 bills used ++id', () => {
    const v1 = [...db._versions].find((v) => v._cfg.version === 1);
    expect(keyOf(v1._cfg.storesSource.bills)).toBe('++id');
  });
});
