// Quick sort (Ken, 27 Oct 2026, batch 3, UI locked option A): one To sort row at a time on an overlay over
// Activity. Pure logic here (tested in __tests__/quicksort.test.js); the saving reuses store.js.
import { pickerGroups } from './categories.js';
import { isPersonTransfer, merchantKey, isBroadKeyword } from './rules.js';

// The To sort rows, newest first (date, then bank posting date, then uid so the order never wobbles).
export function sortQueue(txns) {
  return txns
    .filter((t) => t.kind === 'review')
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')
      || (b.postedDate ?? '').localeCompare(a.postedDate ?? '')
      || String(a.uid).localeCompare(String(b.uid)))
    .map((t) => t.uid);
}

// First row at or after `from` that is still To sort (a remembered rule may have sorted some in the meantime).
export function nextIndex(queue, byUid, from) {
  for (let i = from; i < queue.length; i++) {
    if (byUid.get(queue[i])?.kind === 'review') return i;
  }
  return -1;
}

// Starter chips when the person has little history yet.
const DEFAULT_OUT = ['eating-out', 'groceries', 'shopping', 'transport'];
const DEFAULT_IN = ['income', 'family', 'job-income', 'interest'];

// The chips for one row: `top` = up to 4 most-used categories for that direction (padded with sensible
// defaults), `more` = the rest ("More…"). Investing is left out: it needs an ETF tag, which the row sheet asks for.
export function quickChips(amountCents, usage = {}) {
  const { most, groups } = pickerGroups(amountCents, usage);
  const visible = new Map(groups.flatMap((g) => g.items).map((c) => [c.id, c]));
  const top = [];
  for (const c of most) if (c.type !== 'investing' && c.type !== 'saving' && top.length < 4) top.push(c);
  for (const id of amountCents > 0 ? DEFAULT_IN : DEFAULT_OUT) {
    const c = visible.get(id);
    if (c && top.length < 4 && !top.some((x) => x.id === id)) top.push(c);
  }
  const taken = new Set(top.map((c) => c.id));
  const more = groups.filter((g) => g.type !== 'investing').flatMap((g) => g.items).filter((c) => !taken.has(c.id));
  return { top, more };
}

// "Remember for similar rows": the keyword to save, or '' when the row can't be remembered
// (not a bank row, a payment to a person, or text too general).
export function rememberKeyword(t) {
  if (t.source !== 'csv' || isPersonTransfer(t.description)) return '';
  const k = merchantKey(t.description);
  return k && !isBroadKeyword(k) ? k : '';
}
