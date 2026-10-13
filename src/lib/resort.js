// Re-sorting existing transactions with newer rules (pure logic, tested).
//
// Rules only run at import time, so when the rules change, older transactions keep
// their old category. Two ways to catch up:
// - 'review': sort what is still in Review using the current rules.
// - 'migrate' (once, for M2.5): also re-sort anything a rule had sorted, but leave
//   alone what you changed by hand. A transaction counts as "sorted by a rule" when
//   its category is exactly what the old (M2) rules gave it.
//   Items you put in the old "Income" (now "Other income") get re-checked too:
//   if a new rule knows it's job income, family support or interest, it moves there.
// A sorted transaction is never sent back to Review.
import { categorize, DEFAULT_RULES, isBroadKeyword } from './rules.js';
import { RULES_V1 } from './rules-v1.js';

// Learned rules, newest first, minus any that would catch too much.
export function usableUserRules(userRules = []) {
  return [...userRules]
    .filter((r) => !isBroadKeyword(Array.isArray(r.match?.contains) ? r.match.contains[0] : r.match?.contains))
    .sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
}

export function resortPlan(txns, { userRules = [], mode = 'review', oldRules = RULES_V1, newRules = DEFAULT_RULES } = {}) {
  const user = usableUserRules(userRules);
  const now = [...user, ...newRules];
  // What actually ran at import time, including any too-broad learned rule (so its mistakes get fixed)
  const allUser = [...userRules].sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
  const before = [...allUser, ...oldRules];
  const changes = [];

  for (const t of txns) {
    if (t.source !== 'csv') continue;
    const next = categorize(t.description, t.amountCents, now);
    if (next.kind === 'review' || !next.categoryId) continue;

    let apply = false;
    if (t.kind === 'review' || !t.categoryId) {
      apply = true;
    } else if (mode === 'migrate') {
      const old = categorize(t.description, t.amountCents, before);
      const byRule = old.kind === t.kind && (old.categoryId ?? null) === (t.categoryId ?? null);
      const oldIncome = t.categoryId === 'income' && next.kind === 'income';
      apply = byRule || oldIncome;
    }
    if (apply && (next.kind !== t.kind || next.categoryId !== t.categoryId || !!next.bill !== !!t.bill)) {
      changes.push({ uid: t.uid, kind: next.kind, categoryId: next.categoryId, bill: next.bill, from: t.categoryId ?? 'review' });
    }
  }
  return changes;
}
