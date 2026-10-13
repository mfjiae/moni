import { describe, it, expect } from 'vitest';
import { groupByDay } from '../daygroups.js';

const t = (date, amountCents) => ({ uid: `${date}|${amountCents}`, date, amountCents });

describe('groupByDay', () => {
  const list = [t('2026-10-12', -500), t('2026-10-12', -250), t('2026-10-11', 10000), t('2026-10-09', -1200), t('2026-10-09', -300), t('2026-10-08', -99)];

  it('groups by day with the net total in cents', () => {
    const { groups, shown } = groupByDay(list, 100);
    expect(groups.map((g) => g.date)).toEqual(['2026-10-12', '2026-10-11', '2026-10-09', '2026-10-08']);
    expect(groups.map((g) => g.netCents)).toEqual([-750, 10000, -1500, -99]);
    expect(shown).toBe(6);
  });

  it('pages by whole days, never splitting a day', () => {
    const { groups, shown } = groupByDay(list, 3);
    expect(groups.map((g) => g.date)).toEqual(['2026-10-12', '2026-10-11']);
    expect(shown).toBe(3);
    const next = groupByDay(list, 4);
    expect(next.groups.map((g) => g.date)).toEqual(['2026-10-12', '2026-10-11', '2026-10-09']);
    expect(next.shown).toBe(5);
  });

  it('handles an empty list', () => {
    expect(groupByDay([], 30)).toEqual({ groups: [], shown: 0 });
  });
});
