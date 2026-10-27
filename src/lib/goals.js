// Savings goal (Ken, 27 Oct 2026, batch 3, UI locked option A). ONE goal for now.
// Stored as meta `goal` { name, targetCents, byDate, startDate, updatedAt } and synced like the cash setting.
// Progress = money moved INTO savings since the start date, minus money moved out (interest does not count).
import { daysBetween } from './dates.js';

// txns = the counted view (each own-account transfer once, from the Smart Access side).
export function goalProgress(goal, txns) {
  if (!goal) return 0;
  let net = 0;
  for (const t of txns) {
    if (t.kind === 'saving' && t.date >= goal.startDate) net -= t.amountCents;
  }
  return net;
}

// The numbers behind the card. `status`: 'done' | 'ontrack' | 'behind' | 'late'.
export function goalView(goal, txns, today) {
  const saved = goalProgress(goal, txns);
  const target = goal.targetCents;
  const left = Math.max(target - saved, 0);
  const pct = target > 0 ? Math.max(0, Math.min(100, Math.floor((Math.max(saved, 0) / target) * 100))) : 0;
  const total = Math.max(daysBetween(goal.startDate, goal.byDate), 1);
  const gone = Math.min(Math.max(daysBetween(goal.startDate, today), 0), total);
  const daysLeft = daysBetween(today, goal.byDate);
  const weeksLeft = Math.max(daysLeft, 1) / 7;
  const perWeek = left > 0 ? Math.ceil(left / Math.max(weeksLeft, 1)) : 0;
  // Expected so far if the money went in evenly from the start date to the due date.
  const expected = Math.round((target * gone) / total);
  let status = 'ontrack';
  if (saved >= target) status = 'done';
  else if (daysLeft < 0) status = 'late';
  else if (saved < expected) status = 'behind';
  return { saved, target, left, pct, daysLeft, perWeek, expected, status, markPct: Math.round((gone / total) * 100) };
}
