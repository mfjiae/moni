// Budgets (M3). Pure logic, tested in __tests__/budgets.test.js. Money = integer cents.
//
// A budget is one amount per category, the same every month. It is stored as "from-month" records:
// { uid: 'budget|<categoryId>|<from>', categoryId, from: 'YYYY-MM', cents, updatedAt }.
// The record with the latest `from` that is not after a month decides that month's amount.
// cents = 0 means "no budget from that month on". A change made in the current month adds a record
// from the current month, so past months keep their old number (unless "also change past months").
import { summarizeMonth, upcomingRent } from './summary.js';
import { allCategories, categoryName } from './categories.js';
import { monthKey, daysInMonth, monthPace } from './dates.js';

export const BEGINNING = '2000-01';        // "from the beginning": used by "also change past months"
export const FASTER_MARGIN = 8;            // "faster than the month" = used % is 8+ points ahead of the month %
export const RENT_ID = 'housing';          // rent is a fixed bill, never given a budget amount
export const NOT_BUDGETABLE = new Set(['tuition', RENT_ID, 'other']);

export const budgetUid = (categoryId, from) => `budget|${categoryId}|${from}`;

// Categories that can get a budget: visible spending categories except tuition, rent and Uncategorized.
export function budgetableCategories() {
  return allCategories().filter((c) => c.type === 'spend' && !c.hidden && !NOT_BUDGETABLE.has(c.id));
}

// month -> Map(categoryId -> cents) of the budgets in force that month (only amounts above $0).
export function budgetsForMonth(records, month) {
  const best = new Map();
  for (const r of records ?? []) {
    if (r.from > month) continue;
    const cur = best.get(r.categoryId);
    if (!cur || r.from > cur.from) best.set(r.categoryId, r);
  }
  const out = new Map();
  for (const [id, r] of best) if (r.cents > 0) out.set(id, r.cents);
  return out;
}

// What to write when one category's amount changes.
// fromMonth: the month the change starts (the current month). alsoPast: apply to earlier months too.
// cents = 0 removes the budget. Returns { puts: [record], deletes: [uid] } (deletes get tombstones).
export function planChange(records, categoryId, cents, fromMonth, alsoPast, now) {
  const mine = (records ?? []).filter((r) => r.categoryId === categoryId);
  const puts = [];
  const deletes = [];
  if (alsoPast) {
    for (const r of mine) if (r.from <= fromMonth) deletes.push(r.uid);
    if (cents > 0) {
      const uid = budgetUid(categoryId, BEGINNING);
      puts.push({ uid, categoryId, from: BEGINNING, cents, updatedAt: now });
      const i = deletes.indexOf(uid);
      if (i >= 0) deletes.splice(i, 1);   // replaced in place, not deleted
    }
    return { puts, deletes };
  }
  // Nothing to do when the amount in force already equals the new one.
  const inForce = budgetsForMonth(mine, fromMonth).get(categoryId) ?? 0;
  if (inForce === cents) return { puts, deletes };
  puts.push({ uid: budgetUid(categoryId, fromMonth), categoryId, from: fromMonth, cents, updatedAt: now });
  return { puts, deletes };
}

// Several changes at once (the paste box). Later lines for the same category win.
export function planChanges(records, changes, fromMonth, alsoPast, now) {
  const puts = new Map();
  const deletes = new Set();
  let working = [...(records ?? [])];
  for (const { categoryId, cents } of changes) {
    const p = planChange(working, categoryId, cents, fromMonth, alsoPast, now);
    for (const uid of p.deletes) { deletes.add(uid); puts.delete(uid); }
    for (const r of p.puts) { puts.set(r.uid, r); deletes.delete(r.uid); }
    working = working.filter((r) => !p.deletes.includes(r.uid) && !p.puts.some((x) => x.uid === r.uid)).concat(p.puts);
  }
  return { puts: [...puts.values()], deletes: [...deletes] };
}

// ---------- Paste a list ----------

const norm = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\band\b/g, ' ').replace(/\s+/g, ' ').trim();

// "Groceries 300" per line -> { ok: [{ categoryId, name, cents }], bad: [{ line, reason }] }.
// Names match the category names (any case, "&" or "and"); a unique start of a name also works.
// Anything in brackets is a note and ignored; a "Total" line is skipped.
export function parseBudgetList(text, categories = allCategories()) {
  const ok = [];
  const bad = [];
  const eligible = categories.filter((c) => c.type === 'spend' && !c.hidden && !NOT_BUDGETABLE.has(c.id));
  const refused = categories.filter((c) => NOT_BUDGETABLE.has(c.id));
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.replace(/\([^)]*\)/g, ' ').trim();
    if (!line) continue;
    const m = /^(.*?)[\s:=,\-–—]*\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:\/\s*(?:month|mo|m))?\s*$/i.exec(line);
    if (!m || !m[1].trim()) { bad.push({ line: raw.trim(), reason: 'No amount found' }); continue; }
    const key = norm(m[1]);
    if (!key) { bad.push({ line: raw.trim(), reason: 'No category name' }); continue; }
    if (key === 'total') continue;
    const cents = Math.round(parseFloat(m[2].replace(/,/g, '')) * 100);
    const exact = eligible.filter((c) => norm(c.name) === key);
    const starts = eligible.filter((c) => norm(c.name).startsWith(key));
    const hit = exact.length === 1 ? exact[0] : exact.length === 0 && starts.length === 1 ? starts[0] : null;
    if (hit) { ok.push({ categoryId: hit.id, name: hit.name, cents }); continue; }
    if (refused.some((c) => norm(c.name) === key)) {
      bad.push({ line: raw.trim(), reason: key === 'rent housing' ? 'Rent is a fixed bill, not budgeted' : 'Not budgetable' });
    } else if (exact.length > 1 || starts.length > 1) {
      bad.push({ line: raw.trim(), reason: 'Matches more than one category' });
    } else {
      bad.push({ line: raw.trim(), reason: 'No category with that name' });
    }
  }
  // the same category twice: the last line wins
  const last = new Map(ok.map((o) => [o.categoryId, o]));
  return { ok: [...last.values()], bad };
}

// ---------- The Budgets screen ----------

// Rent: the usual amount is the latest rent payment (so no amount is typed into moni).
function rentInfo(txns, month, today) {
  const housing = txns.filter((t) => t.kind === 'spend' && t.categoryId === RENT_ID && t.amountCents < 0);
  const inMonth = housing.filter((t) => monthKey(t.date) === month);
  const paidCents = inMonth.reduce((s, t) => s - t.amountCents, 0);
  const paidOn = inMonth.length ? inMonth.map((t) => t.date).sort().pop() : null;
  const upTo = housing.filter((t) => monthKey(t.date) <= month).sort((a, b) => a.date.localeCompare(b.date));
  const usual = upTo.length ? -upTo[upTo.length - 1].amountCents : 0;
  const isCurrent = monthKey(today) === month;
  let status = 'none';        // paid | due | unpaid | none
  let dueIn = null;
  if (paidCents > 0) status = 'paid';
  else if (isCurrent && usual > 0) {
    const next = upcomingRent(txns, today, 45);
    if (next) { status = 'due'; dueIn = next.days; } else status = 'unpaid';
  } else if (usual > 0) status = 'unpaid';
  return { usual, paidCents, paidOn, status, dueIn, shown: usual > 0 || paidCents > 0 };
}

// Everything the Budgets screen draws for one month.
// txns: what moni counts (countedView). withRent adds rent to the total and shows its row.
export function budgetOverview(txns, records, month, today, { withRent = false } = {}) {
  const sum = summarizeMonth(txns, month);
  const limits = budgetsForMonth(records, month);
  const isCurrent = monthKey(today) === month;
  const pace = isCurrent ? monthPace(today) : 1;     // share of the month gone (today counts as done)

  const rows = [...limits].map(([id, limitCents]) => {
    const spent = Math.max(0, sum.byCategory[id] ?? 0);
    return { id, name: categoryName(id), limitCents, spent, ratio: spent / limitCents, left: limitCents - spent };
  });

  const rent = rentInfo(txns, month, today);
  const rentRow = withRent && rent.shown
    ? (() => {
      const limitCents = Math.max(rent.usual, rent.paidCents);
      return { id: RENT_ID, name: categoryName(RENT_ID), limitCents, spent: rent.paidCents, ratio: limitCents ? rent.paidCents / limitCents : 0,
        left: limitCents - rent.paidCents, fixed: true };
    })()
    : null;
  const all = rentRow ? [...rows, rentRow] : rows;

  const over = all.filter((r) => r.spent > r.limitCents).sort((a, b) => (b.spent - b.limitCents) - (a.spent - a.limitCents));
  // Spending faster than the month: only this month, never rent
  const faster = isCurrent
    ? all.filter((r) => !r.fixed && r.spent <= r.limitCents && r.ratio * 100 >= pace * 100 + FASTER_MARGIN).sort((a, b) => b.ratio - a.ratio)
    : [];
  const taken = new Set([...over, ...faster].map((r) => r.id));
  const onTrack = all.filter((r) => !taken.has(r.id)).sort((a, b) => b.ratio - a.ratio);

  const total = all.reduce((s, r) => s + r.limitCents, 0);
  const spent = all.reduce((s, r) => s + r.spent, 0);
  const dim = daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5)));
  const daysLeft = isCurrent ? dim - Number(today.slice(8)) : null;

  return {
    isCurrent, pace, has: all.length > 0, hasBudgets: rows.length > 0,
    total, spent, left: total - spent, daysLeft, overCount: over.length,
    over, faster, onTrack, rent,
  };
}

// "Due in 3 days" etc. for the Fixed bills line.
export function rentStatusText(rent, isCurrent) {
  if (rent.status === 'paid') return { text: 'Paid', tone: 'paid' };
  if (rent.status === 'due') {
    return { text: rent.dueIn === 0 ? 'Due today' : rent.dueIn === 1 ? 'Due tomorrow' : `Due in ${rent.dueIn} days`, tone: 'due' };
  }
  if (rent.status === 'unpaid') return { text: isCurrent ? 'Not paid yet' : 'No rent payment', tone: 'unpaid' };
  return { text: 'No rent payments yet', tone: 'none' };
}

// Monthly cash flow caption (wording A, Ken 24 Oct 2026): up to 100% "Spent N% of what came in";
// over 100% "Spent $X more than came in" (cents of the difference); nothing in: "No money in yet this month".
export function cashFlowCaption(income, spent) {
  if (!(income > 0)) return { kind: 'none', percent: null, overCents: 0 };
  if (spent > income) return { kind: 'over', percent: null, overCents: spent - income };
  return { kind: 'pct', percent: Math.round((spent / income) * 100), overCents: 0 };
}
