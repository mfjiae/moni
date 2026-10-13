// Month totals. All values in cents.
import { monthKey } from './dates.js';
import { categoryName } from './categories.js';

// txn: { date, amountCents, kind, categoryId }
// - spent: real spending (kind 'spend'). A positive amount in a spend category
//   (refund or a friend paying you back) reduces that category's spending.
// - invested: Betashares/CommSec etc. (kind 'investing'), kept out of `spent`.
//   Home shows it as its own box; the Spending page adds it back ("everything that left").
// - savedNet: to savings minus from savings (negative = took money out of savings).
// - byCategory: spending AND investing, by category (money out as a positive number).
// - incomeByCategory: money in, by income category.
export function summarizeMonth(txns, key) {
  const byCategory = {};
  const incomeByCategory = {};
  let income = 0;
  let spent = 0;
  let invested = 0;
  let savedNet = 0;
  let review = 0;
  for (const t of txns) {
    if (monthKey(t.date) !== key) continue;
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
