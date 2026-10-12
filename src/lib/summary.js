// Month totals. All values in cents.
import { monthKey } from './dates.js';
import { categoryById } from './categories.js';

// txn: { date, amountCents, kind, categoryId }
// spend kinds: 'spend' and 'investing'. A positive amount in a spend category
// (refund or a friend paying you back) reduces that category's spending.
export function summarizeMonth(txns, key) {
  const byCategory = {};
  let income = 0;
  let spent = 0;
  let savedNet = 0;
  let review = 0;
  for (const t of txns) {
    if (monthKey(t.date) !== key) continue;
    if (t.kind === 'review' || !t.categoryId) { review++; continue; }
    if (t.kind === 'saving') { savedNet += -t.amountCents; continue; }
    if (t.kind === 'income') { income += t.amountCents; continue; }
    if (t.kind === 'spend' || t.kind === 'investing') {
      const out = -t.amountCents;
      byCategory[t.categoryId] = (byCategory[t.categoryId] ?? 0) + out;
      spent += out;
    }
  }
  return { income, spent, savedNet, net: income - spent, byCategory, review };
}

// budgets: [{ categoryId, limitCents }]
export function budgetRows(summary, budgets) {
  return budgets.map((b) => {
    const spent = Math.max(0, summary.byCategory[b.categoryId] ?? 0);
    return {
      ...b,
      name: categoryById[b.categoryId]?.name ?? b.categoryId,
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
