// Activity search and filters (M2.5b step 4). Pure functions, all money in integer cents.
// A filter object `f`:
//   q        search text: matches the bank description, your nickname for it, note, category name, or the amount ("34" / "34.00" / "$34")
//   range    'all' | 'this-month' | 'last-month' | 'this-year' | 'custom' (custom uses from / to, 'YYYY-MM-DD', both optional)
//   types    ['spend' | 'income' | 'saving' | 'investing']  (empty = every type)
//   cats     category ids (empty = every category)
//   toSort   true = only transactions still waiting for a category ("To sort")
//   savings  true = show transfers to and from savings when no type is picked
//   min, max amount range in cents on the SIZE of the amount (sign ignored), null = no limit
//   typed    true = only entries you typed in by hand (pending or settled manual; UI bundle 2, Ken 26 Oct 2026).
//   cash     true = only rows that move cash in hand: cash purchases, ATM withdrawals, own cash deposited (cash.js).
//            Typed transfers to savings show too, without the savings switch.
//
// Rules (Ken, 24 Oct 2026):
// - Savings transfers stay hidden unless "Show transfers to and from savings" is on, or the Saved type is picked.
// - "To sort" items have no type yet, so they are hidden while a type is picked. They show with no type picked,
//   or on their own with "To sort only".
// - Min / max compare the size only: $20 to $50 matches both -$30 and +$30.
import { monthKey, shiftMonth } from './dates.js';
import { categoryName } from './categories.js';
import { nicknameFor } from './names.js';
import { movesCash } from './cash.js';
import { isHandTyped } from './typed.js';

export const EMPTY_FILTER = Object.freeze({
  q: '', range: 'all', from: '', to: '', types: [], cats: [], toSort: false, savings: false, typed: false, cash: false, min: null, max: null,
});

export const RANGES = [
  ['all', 'All time'], ['this-month', 'This month'], ['last-month', 'Last month'], ['this-year', 'This year'], ['custom', 'Custom'],
];

export const TYPES = [
  ['spend', 'Spending', 'out'], ['income', 'Income', 'in'], ['saving', 'Saved', 'save'], ['investing', 'Invested', 'invest'],
];

// First and last day (inclusive, 'YYYY-MM-DD') for a date range; '' = open-ended.
export function rangeBounds(f, today) {
  const m = monthKey(today);
  switch (f.range) {
    case 'this-month': return { from: `${m}-01`, to: today };
    case 'last-month': { const p = shiftMonth(m, -1); return { from: `${p}-01`, to: `${p}-31` }; }
    case 'this-year': return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case 'custom': return { from: f.from || '', to: f.to || '' };
    default: return { from: '', to: '' };
  }
}

// "$34" / "34" / "34.5" -> the amount text to look for in "34.00"; null if the search isn't a number
function amountQuery(q) {
  const s = q.replace(/[$,\s]/g, '');
  return /^\d+(\.\d{0,2})?$/.test(s) ? s : null;
}
const dollars = (cents) => (Math.abs(cents) / 100).toFixed(2);

export function matchesSearch(t, q) {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  if (t.description.toLowerCase().includes(s)) return true;
  if ((nicknameFor(t) ?? '').toLowerCase().includes(s)) return true;
  if ((t.note ?? '').toLowerCase().includes(s)) return true;
  if (t.kind === 'review' ? 'to sort'.includes(s) : t.categoryId && categoryName(t.categoryId).toLowerCase().includes(s)) return true;
  const a = amountQuery(s);
  return a != null && dollars(t.amountCents).startsWith(a);
}

// Does one transaction pass every filter? skipCats leaves the category filter out (for the category counts).
export function passes(t, f, bounds, { skipCats = false } = {}) {
  if (bounds.from && t.date < bounds.from) return false;
  if (bounds.to && t.date > bounds.to) return false;
  const size = Math.abs(t.amountCents);
  if (f.min != null && size < f.min) return false;
  if (f.max != null && size > f.max) return false;
  if (!matchesSearch(t, f.q)) return false;
  if (f.typed && !isHandTyped(t)) return false;
  if (f.cash && !movesCash(t)) return false;
  if (f.toSort) return t.kind === 'review';
  if (f.types.length) {
    if (!f.types.includes(t.kind)) return false;
  } else if (t.kind === 'saving' && !f.savings && !f.typed) {
    return false;
  }
  if (!skipCats && f.cats.length && !f.cats.includes(t.categoryId)) return false;
  return true;
}

// Newest first, like the bank.
export function filterTxns(txns, f, today) {
  const bounds = rangeBounds(f, today);
  return txns.filter((t) => passes(t, f, bounds))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

// Count and money in / money out of what is shown (S2 totals line). outCents is a positive number.
export function totals(list) {
  let inCents = 0;
  let outCents = 0;
  for (const t of list) {
    if (t.amountCents > 0) inCents += t.amountCents;
    else outCents -= t.amountCents;
  }
  return { count: list.length, inCents, outCents };
}

// Categories to offer in the filter: every category that appears in the data (not To sort, not savings),
// with how many transactions match the OTHER filters. Most used first; picked ones always included.
export function categoryCounts(txns, f, today) {
  const bounds = rangeBounds(f, today);
  const all = new Map();
  for (const t of txns) {
    if (t.kind === 'review' || t.kind === 'saving' || !t.categoryId) continue;
    if (!all.has(t.categoryId)) all.set(t.categoryId, 0);
    if (passes(t, f, bounds, { skipCats: true })) all.set(t.categoryId, all.get(t.categoryId) + 1);
  }
  for (const id of f.cats) if (!all.has(id)) all.set(id, 0);
  return [...all.entries()]
    .map(([id, count]) => ({ id, name: categoryName(id), count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// The filters that are on, as removable chips: [{ key, label }]
export function activeChips(f) {
  const chips = [];
  if (f.q.trim()) chips.push({ key: 'q', label: `“${f.q.trim()}”` });
  if (f.range !== 'all') {
    const label = f.range === 'custom'
      ? `${f.from || 'Start'} to ${f.to || 'today'}`
      : RANGES.find(([k]) => k === f.range)[1];
    chips.push({ key: 'range', label });
  }
  for (const k of f.types) chips.push({ key: `type:${k}`, label: TYPES.find(([id]) => id === k)[1] });
  for (const id of f.cats) chips.push({ key: `cat:${id}`, label: categoryName(id) });
  if (f.toSort) chips.push({ key: 'toSort', label: 'To sort only' });
  if (f.typed) chips.push({ key: 'typed', label: 'Typed only' });
  if (f.cash) chips.push({ key: 'cash', label: 'Cash only' });
  if (f.savings && !f.types.length && !f.toSort) chips.push({ key: 'savings', label: 'Savings transfers shown' });
  if (f.min != null || f.max != null) {
    const d = (c) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
    chips.push({ key: 'amount', label: `${f.min != null ? d(f.min) : '$0'} to ${f.max != null ? d(f.max) : 'any'}` });
  }
  return chips;
}

// Remove one chip's filter.
export function removeChip(f, key) {
  if (key === 'q') return { ...f, q: '' };
  if (key === 'range') return { ...f, range: 'all', from: '', to: '' };
  if (key === 'toSort') return { ...f, toSort: false };
  if (key === 'typed') return { ...f, typed: false };
  if (key === 'cash') return { ...f, cash: false };
  if (key === 'savings') return { ...f, savings: false };
  if (key === 'amount') return { ...f, min: null, max: null };
  if (key.startsWith('type:')) return { ...f, types: f.types.filter((k) => k !== key.slice(5)) };
  if (key.startsWith('cat:')) return { ...f, cats: f.cats.filter((k) => k !== key.slice(4)) };
  return f;
}

// "12.5" -> 1250; '' or not a number -> null (used by the min / max boxes)
export function dollarsToCents(text) {
  const s = String(text ?? '').replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const [d, c = ''] = s.split('.');
  return Number(d) * 100 + Number(c.padEnd(2, '0'));
}

// Bank descriptions for card purchases end with "Card xx1234 ... Value Date: DD/MM/YYYY". Lists show the
// name without that tail (display only; the stored description is untouched and search still sees all of it).
export function shortName(description) {
  const s = description
    .replace(/\s+Card\s+xx\d{4}\b.*$/i, '')
    .replace(/\s+Value Date:\s*\d{2}\/\d{2}\/\d{4}\s*$/i, '')
    .trim();
  return s || description;
}
