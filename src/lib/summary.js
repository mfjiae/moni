// Month totals. All values in cents.
import { monthKey, shiftMonth, daysInMonth, daysBetween, addDays } from './dates.js';
import { categoryName } from './categories.js';

// txn: { date, amountCents, kind, categoryId }
// - spent: real spending (kind 'spend'). A positive amount in a spend category
//   (refund or a friend paying you back) reduces that category's spending.
// - upToDay (optional): only count days 1..upToDay (for "by the 13th" comparisons)
// - invested: Betashares/CommSec etc. (kind 'investing'), kept out of `spent`.
//   Home shows it as its own box; the Spending page adds it back ("everything that left").
// - savedNet: to savings minus from savings (negative = took money out of savings).
// - byCategory: spending AND investing, by category (money out as a positive number).
// - incomeByCategory: money in, by income category.
export function summarizeMonth(txns, key, upToDay) {
  const byCategory = {};
  const incomeByCategory = {};
  let income = 0;
  let spent = 0;
  let invested = 0;
  let savedNet = 0;
  let review = 0;
  for (const t of txns) {
    if (monthKey(t.date) !== key) continue;
    if (upToDay != null && Number(t.date.slice(8)) > upToDay) continue;
    if (t.kind === 'review' || !t.categoryId) { review++; continue; }
    if (t.kind === 'saving') { savedNet += -t.amountCents; continue; }
    if (t.kind === 'income') {
      income += t.amountCents;
      incomeByCategory[t.categoryId] = (incomeByCategory[t.categoryId] ?? 0) + t.amountCents;
      continue;
    }
    if (t.kind === 'spend' || t.kind === 'investing') {
      const out = -t.amountCents;
      byCategory[t.categoryId] = (byCategory[t.categoryId] ?? 0) + out;
      if (t.kind === 'investing') invested += out;
      else spent += out;
    }
  }
  return {
    income, spent, invested, savedNet,
    outgoings: spent + invested,
    net: income - spent - invested,
    byCategory, incomeByCategory, review,
  };
}

// Category rows sorted biggest first, with each one's share of the total.
// totals: { categoryId: cents }; exclude: ids to leave out (e.g. tuition)
export function categoryRows(totals, { exclude = [] } = {}) {
  const rows = Object.entries(totals)
    .filter(([id, c]) => c !== 0 && !exclude.includes(id))
    .map(([id, cents]) => ({ id, name: categoryName(id), cents }))
    .sort((a, b) => b.cents - a.cents);
  const total = rows.reduce((s, r) => s + r.cents, 0);
  return {
    total,
    rows: rows.map((r) => ({ ...r, share: total > 0 ? r.cents / total : 0 })),
  };
}

// budgets: [{ categoryId, limitCents }]
export function budgetRows(summary, budgets) {
  return budgets.map((b) => {
    const spent = Math.max(0, summary.byCategory[b.categoryId] ?? 0);
    return {
      ...b,
      name: categoryName(b.categoryId),
      spent,
      left: b.limitCents - spent,
      ratio: b.limitCents > 0 ? spent / b.limitCents : 0,
    };
  });
}

export function leftToSpend(rows) {
  const total = rows.reduce((s, r) => s + r.limitCents, 0);
  const spent = rows.reduce((s, r) => s + r.spent, 0);
  return { total, spent, left: total - spent };
}

// Bar color rule: >100% over, >=90% near, else ok
export function budgetStatus(ratio) {
  if (ratio > 1) return 'over';
  if (ratio >= 0.9) return 'near';
  return 'ok';
}

// The first month with any transaction (never before Jan 2024), for the month switcher.
export function firstDataMonth(txns, floor = '2024-01') {
  let min = null;
  for (const t of txns) if (!min || t.date < min) min = t.date;
  if (!min) return null;
  const m = monthKey(min);
  return m < floor ? floor : m;
}

// End-of-day bank balances for the account chart, oldest first: [{ date, cents }].
// Uses the running balance on each bank row. When a day has several rows, the last
// one is the row no other row on that day leads into (its balance isn't another
// row's "balance before").
export function balanceHistory(txns) {
  const byDay = new Map();
  for (const t of txns) {
    if (t.source !== 'csv' || t.balanceCents == null) continue;
    const d = t.postedDate ?? t.date;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(t);
  }
  const out = [];
  for (const [date, rows] of byDay) {
    let last = rows[0];
    if (rows.length > 1) {
      const before = new Set(rows.map((r) => r.balanceCents - r.amountCents));
      last = rows.find((r) => !before.has(r.balanceCents)) ?? rows[0];
    }
    out.push({ date, cents: last.balanceCents });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- Home: spending over the month ----------

// Spending per day of a month (same rule as `spent`: kind 'spend', refunds reduce it,
// investing and savings left out). Returns { days: [cents per day, index 0 = the 1st], total }.
// A day with only a refund shows 0 (a bar can't be negative); `total` is the true net.
export function spentByDay(txns, key) {
  const [y, m] = key.split('-').map(Number);
  const dim = daysInMonth(y, m);
  const raw = new Array(dim).fill(0);
  for (const t of txns) {
    if (t.kind !== 'spend' || !t.categoryId || monthKey(t.date) !== key) continue;
    raw[Number(t.date.slice(8)) - 1] += -t.amountCents;
  }
  return { days: raw.map((c) => Math.max(c, 0)), total: raw.reduce((a, c) => a + c, 0) };
}

// Running total of spending by day: [after the 1st, after the 2nd, ...], up to `upTo` days
// (default the whole month). Uses the true net per day so it matches `spent`.
export function cumulativeSpend(txns, key, upTo) {
  const [y, m] = key.split('-').map(Number);
  const dim = daysInMonth(y, m);
  const raw = new Array(dim).fill(0);
  for (const t of txns) {
    if (t.kind !== 'spend' || !t.categoryId || monthKey(t.date) !== key) continue;
    raw[Number(t.date.slice(8)) - 1] += -t.amountCents;
  }
  const n = Math.min(upTo ?? dim, dim);
  const out = [];
  let run = 0;
  for (let i = 0; i < n; i++) { run += raw[i]; out.push(run); }
  return out;
}

// This month's spending against the month before, for the Home pace card.
// - Current month: this month so far vs the previous month up to the same day
//   (the 31st vs a 30-day month compares against that month's last day).
// - Any other month: the whole month vs the whole previous month.
// Returns null when the previous month has no spending (nothing to compare with).
export function monthCompare(txns, key, today) {
  const prev = shiftMonth(key, -1);
  const [py, pm] = prev.split('-').map(Number);
  const prevDim = daysInMonth(py, pm);
  const prevCum = cumulativeSpend(txns, prev);
  const prevTotal = prevCum[prevCum.length - 1] ?? 0;
  const isCurrent = monthKey(today) === key;
  const day = isCurrent ? Number(today.slice(8)) : null;
  const cum = cumulativeSpend(txns, key, day ?? undefined);
  const spent = cum[cum.length - 1] ?? 0;
  if (!prevTotal) return null;
  const prevThrough = day == null ? prevTotal : prevCum[Math.min(day, prevDim) - 1];
  return {
    prev, prevTotal, prevThrough, spent, day, isCurrent,
    share: spent / prevTotal,            // e.g. 0.44 = 44% of the previous month's total
    delta: spent - prevThrough,          // positive = spent more than last month by this date
    cum, prevCum,
  };
}

// The next rent payment, guessed from your last two rent payments (bills flagged as
// Rent & housing): same gap again. Returns { date, cents, days } when it falls due within
// `withinDays` (0 = today), otherwise null. A simple stand-in until M5 (Bills).
export function upcomingRent(txns, today, withinDays = 7) {
  const rent = txns
    .filter((t) => t.kind === 'spend' && t.categoryId === 'housing' && t.bill && t.amountCents < 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (rent.length < 2) return null;
  const last = rent[rent.length - 1];
  const gap = daysBetween(rent[rent.length - 2].date, last.date);
  if (gap < 7 || gap > 31) return null;
  let due = addDays(last.date, gap);
  while (due < today) due = addDays(due, gap);
  const days = daysBetween(today, due);
  if (days > withinDays) return null;
  return { date: due, cents: -last.amountCents, days };
}

// This month against the month before, for any of the four numbers (money in, spent, saved, invested).
// now = this month so far; prevThrough = last month up to the same day (current month only);
// prevTotal = all of last month. For a past month, prevThrough is the whole month.
export function compareMonths(txns, key, today) {
  const prev = shiftMonth(key, -1);
  const [py, pm] = prev.split('-').map(Number);
  const isCurrent = monthKey(today) === key;
  const day = isCurrent ? Number(today.slice(8)) : null;
  const now = summarizeMonth(txns, key);
  const prevTotal = summarizeMonth(txns, prev);
  const prevThrough = day == null ? prevTotal : summarizeMonth(txns, prev, Math.min(day, daysInMonth(py, pm)));
  return { prev, day, isCurrent, hasPrev: txns.some((t) => monthKey(t.date) === prev), now, prevThrough, prevTotal };
}

// What was spent on one day, by category (biggest first). Same rule as `spent`.
export function dayItems(txns, date) {
  const by = {};
  for (const t of txns) {
    if (t.date !== date || t.kind !== 'spend' || !t.categoryId) continue;
    by[t.categoryId] = (by[t.categoryId] ?? 0) - t.amountCents;
  }
  return Object.entries(by).filter(([, c]) => c !== 0)
    .map(([id, cents]) => ({ id, name: categoryName(id), cents }))
    .sort((a, b) => b.cents - a.cents);
}
