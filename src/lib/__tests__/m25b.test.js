// M2.5b step 1: Home calculations (spend per day, vs last month, next rent) and date helpers.
// Made-up numbers only.
import { describe, it, expect } from 'vitest';
import { daysBetween, addDays, weekdayMonFirst, ordinal, monthName, monthShort } from '../dates.js';
import { summarizeMonth, spentByDay, cumulativeSpend, monthCompare, upcomingRent } from '../summary.js';

const spend = (date, cents, categoryId = 'groceries', extra = {}) =>
  ({ uid: `${date}|${cents}|${categoryId}`, date, amountCents: -Math.abs(cents), kind: 'spend', categoryId, ...extra });

describe('date helpers', () => {
  it('counts and adds days across month and year ends', () => {
    expect(daysBetween('2026-10-06', '2026-10-20')).toBe(14);
    expect(daysBetween('2026-10-20', '2026-10-06')).toBe(-14);
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('weekdays start on Monday', () => {
    expect(weekdayMonFirst('2026-10-12')).toBe(0); // Monday
    expect(weekdayMonFirst('2026-10-13')).toBe(1); // Tuesday
    expect(weekdayMonFirst('2026-10-18')).toBe(6); // Sunday
  });
  it('ordinals and month names', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal))
      .toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st']);
    expect(monthName('2026-09')).toBe('September');
    expect(monthShort('2026-09')).toBe('Sep');
  });
});

describe('spentByDay / cumulativeSpend', () => {
  const txns = [
    spend('2026-10-01', 1000), spend('2026-10-01', 500), spend('2026-10-03', 2500),
    { ...spend('2026-10-03', 300), amountCents: 300 },                // refund on the 3rd
    spend('2026-10-05', 700, 'investing', { kind: 'investing' }),     // not spending
    { uid: 'r', date: '2026-10-04', amountCents: -999, kind: 'review', categoryId: null },
    { uid: 's', date: '2026-10-06', amountCents: -4000, kind: 'saving', categoryId: 'saving' },
    spend('2026-09-30', 1234),                                        // other month
  ];
  it('puts each day in its slot and matches the month total', () => {
    const { days, total } = spentByDay(txns, '2026-10');
    expect(days).toHaveLength(31);
    expect(days[0]).toBe(1500);
    expect(days[2]).toBe(2200);
    expect(days[3]).toBe(0);                 // review rows aren't counted
    expect(days[4]).toBe(0);                 // investing isn't spending
    expect(total).toBe(3700);
    expect(total).toBe(summarizeMonth(txns, '2026-10').spent);
  });
  it('a refund-only day shows 0 but still lowers the total', () => {
    const list = [spend('2026-10-02', 1000), { ...spend('2026-10-03', 400), amountCents: 400 }];
    const { days, total } = spentByDay(list, '2026-10');
    expect(days[2]).toBe(0);
    expect(total).toBe(600);
    expect(cumulativeSpend(list, '2026-10', 3)).toEqual([0, 1000, 600]);
  });
  it('cumulative stops at the day asked for', () => {
    expect(cumulativeSpend(txns, '2026-10', 3)).toEqual([1500, 1500, 3700]);
    expect(cumulativeSpend(txns, '2026-10')).toHaveLength(31);
    expect(cumulativeSpend(txns, '2026-02', 99)).toHaveLength(28);
  });
});

describe('monthCompare', () => {
  const txns = [
    spend('2026-09-02', 10000), spend('2026-09-10', 20000), spend('2026-09-20', 30000), // Sep total 600.00
    spend('2026-10-03', 15000), spend('2026-10-12', 5000),                              // Oct so far 200.00
  ];
  it('this month so far vs last month up to the same day', () => {
    const c = monthCompare(txns, '2026-10', '2026-10-13');
    expect(c.spent).toBe(20000);
    expect(c.prevTotal).toBe(60000);
    expect(c.prevThrough).toBe(30000);       // Sep up to the 13th
    expect(c.delta).toBe(-10000);            // spent 100.00 less by this date
    expect(c.share).toBeCloseTo(1 / 3);
    expect(c.day).toBe(13);
    expect(c.cum).toHaveLength(13);
    expect(c.prevCum).toHaveLength(30);
  });
  it('a past month compares the whole month with the month before', () => {
    const c = monthCompare(txns, '2026-09', '2026-10-13');
    expect(c).toBeNull();                    // nothing in August to compare with
    const more = monthCompare([...txns, spend('2026-08-15', 1000)], '2026-09', '2026-10-13');
    expect(more.isCurrent).toBe(false);
    expect(more.spent).toBe(60000);
    expect(more.prevThrough).toBe(1000);
    expect(more.delta).toBe(59000);
  });
  it('the 31st against a 30-day month uses that month\'s last day', () => {
    const list = [spend('2026-09-30', 9000), spend('2026-10-31', 4000)];
    const c = monthCompare(list, '2026-10', '2026-10-31');
    expect(c.prevThrough).toBe(9000);
    expect(c.delta).toBe(-5000);
  });
  it('returns null when the previous month has no spending', () => {
    expect(monthCompare([spend('2026-10-03', 100)], '2026-10', '2026-10-13')).toBeNull();
  });
});

describe('upcomingRent', () => {
  const rent = (date) => spend(date, 91600, 'housing', { bill: true });
  const fortnightly = ['2026-09-08', '2026-09-22', '2026-10-06'].map(rent);

  it('predicts the next payment from the last two and warns within 7 days', () => {
    expect(upcomingRent(fortnightly, '2026-10-13')).toEqual({ date: '2026-10-20', cents: 91600, days: 7 });
    expect(upcomingRent(fortnightly, '2026-10-19')).toMatchObject({ date: '2026-10-20', days: 1 });
    expect(upcomingRent(fortnightly, '2026-10-20')).toMatchObject({ date: '2026-10-20', days: 0 });
  });
  it('stays quiet when it is not due soon', () => {
    expect(upcomingRent(fortnightly, '2026-10-08')).toBeNull();
    expect(upcomingRent(fortnightly, '2026-10-13', 3)).toBeNull();
  });
  it('rolls forward if the data is behind (no stale past dates)', () => {
    expect(upcomingRent(fortnightly, '2026-10-24')).toBeNull();                       // next is 3 Nov, 10 days away
    expect(upcomingRent(fortnightly, '2026-10-24', 14)).toMatchObject({ date: '2026-11-03', days: 10 });
    expect(upcomingRent(fortnightly, '2026-11-01')).toMatchObject({ date: '2026-11-03', days: 2 });
  });
  it('needs two bill payments and ignores laundry / other housing items', () => {
    expect(upcomingRent([rent('2026-10-06')], '2026-10-13')).toBeNull();
    const noise = [...fortnightly, spend('2026-10-10', 900, 'personal-care'), spend('2026-10-11', 5000, 'housing')];
    expect(upcomingRent(noise, '2026-10-13')).toMatchObject({ date: '2026-10-20' });
  });
  it('ignores one-off gaps that are not a regular schedule', () => {
    expect(upcomingRent([rent('2026-10-01'), rent('2026-10-03')], '2026-10-04')).toBeNull();
    expect(upcomingRent([rent('2026-01-01'), rent('2026-10-03')], '2026-10-04')).toBeNull();
  });
});
