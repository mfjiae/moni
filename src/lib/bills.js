// Bills (M5). Pure logic, tested in __tests__/bills.test.js. Money = integer cents, dates = YYYY-MM-DD.
//
// A bill record (synced, table `bills`): { uid, name, cents, every, anchor, since, categoryId, key, updatedAt }
//   every  = 'weekly' | 'fortnightly' | 'monthly' | 'halfyearly'
//   anchor = one due date of the bill; every other due date is counted from it
//   since  = first date moni tracks it from (unpaid due dates before it are not shown as late)
//   key    = how its payments are found: a merchant key (merchantKey of the bank text) or 'cat:tuition'.
//            A bill typed by hand has no key: its payments are found by category and a similar amount.
// "Not a bill" on a suggestion stores { uid: 'bill|skip|<key>', key, dismissed: true } so moni never asks again.
//
// moni suggests a bill (detectBills) when the same merchant was paid at a steady rhythm with a steady amount.
// Tuition is grouped by UTS semester (several payments in one semester = one bill payment).
import { addDays, daysBetween, daysInMonth, monthKey, shiftMonth } from './dates.js';
import { merchantKey } from './rules.js';
import { semesterOf, semesterKey } from './tuition.js';

export const EVERY = {
  weekly: { label: 'Weekly', days: 7, tol: 3, min: 5, max: 9 },
  fortnightly: { label: 'Fortnightly', days: 14, tol: 5, min: 11, max: 17 },
  monthly: { label: 'Monthly', months: 1, tol: 7, min: 26, max: 35 },
  halfyearly: { label: 'Half-yearly', months: 6, tol: 45, min: 150, max: 215 },
};
export const EVERY_IDS = ['weekly', 'fortnightly', 'monthly', 'halfyearly'];

export const billUid = (key) => `bill|${key}`;
export const skipUid = (key) => `bill|skip|${key}`;
export const manualUid = (rand) => `bill|m|${rand}`;

// Spending that is never a bill suggestion (too irregular; you can still add one by hand).
const NOT_BILLS = new Set(['groceries', 'eating-out', 'shopping', 'transport', 'travel', 'gifts', 'other']);

// The key a payment is grouped by: tuition by category, everything else by merchant.
export const keyOf = (t) => (t.categoryId === 'tuition' ? 'cat:tuition' : merchantKey(t.description ?? ''));

// The n-th due date counted from the anchor (n can be negative). Months keep the anchor's day,
// clamped to short months (31 Jan -> 28 Feb -> 31 Mar).
export function stepDate(anchor, every, n) {
  const e = EVERY[every];
  if (e.days) return addDays(anchor, n * e.days);
  const m = shiftMonth(monthKey(anchor), n * e.months);
  const day = Math.min(Number(anchor.slice(8)), daysInMonth(Number(m.slice(0, 4)), Number(m.slice(5))));
  return `${m}-${String(day).padStart(2, '0')}`;
}

// Every due date from `from` to `to` (inclusive).
export function dueDates(bill, from, to) {
  const e = EVERY[bill.every];
  if (!e || !bill.anchor) return [];
  const span = e.days ?? e.months * 30.44;
  let n = Math.floor(daysBetween(bill.anchor, from) / span) - 1;
  while (stepDate(bill.anchor, bill.every, n) >= from) n--;
  const out = [];
  for (;; n++) {
    const d = stepDate(bill.anchor, bill.every, n);
    if (d > to) break;
    if (d >= from) out.push(d);
  }
  return out;
}

const isPayment = (t) => t.kind === 'spend' && t.amountCents < 0;

// Does this transaction look like a payment of the bill?
export function paysBill(bill, t) {
  if (!isPayment(t)) return false;
  if (bill.key) return keyOf(t) === bill.key;
  if (!bill.categoryId || t.categoryId !== bill.categoryId) return false;
  return Math.abs(-t.amountCents - bill.cents) <= Math.max(Math.round(bill.cents * 0.15), 100);
}

// Each due date between from and to, with the payment(s) that paid it (closest within the tolerance;
// a payment pays one due date only). Tuition: every tuition payment in the window counts.
export function occurrences(bill, txns, from, to) {
  const e = EVERY[bill.every];
  const pays = txns.filter((t) => paysBill(bill, t)).sort((a, b) => a.date.localeCompare(b.date));
  const used = new Set();
  return dueDates(bill, from, to).map((due) => {
    const near = pays.filter((t) => !used.has(t.uid) && Math.abs(daysBetween(due, t.date)) <= e.tol);
    let paid = [];
    if (bill.key === 'cat:tuition') {
      const sem = semesterKey(semesterOf(due));
      paid = near.filter((t) => semesterKey(semesterOf(t.date)) === sem);
    } else if (near.length) {
      paid = [near.reduce((best, t) => (Math.abs(daysBetween(due, t.date)) < Math.abs(daysBetween(due, best.date)) ? t : best))];
    }
    paid.forEach((t) => used.add(t.uid));
    return {
      bill, due,
      paid: paid.length > 0,
      paidCents: paid.reduce((a, t) => a - t.amountCents, 0),
      paidDate: paid.length ? paid[0].date : null,
      payments: paid,
    };
  });
}

// Everything the Bills page draws. filter = 'all' or one of EVERY_IDS.
// timeline: due dates from the 1st of this month to 30 days ahead, oldest first, each
//   { bill, due, status: 'paid' | 'due' | 'late', cents, paidDate } (late = past and no payment seen yet;
//   a payment made a few days early counts as paid).
// later: each bill with nothing still to pay in that window, with its next due date after it.
// months: the 3 months before this one plus this one: { key, paid, toPay } (toPay only this month).
export function billsView(records, txns, today, filter = 'all') {
  const bills = records.filter((b) => !b.dismissed && EVERY[b.every] && (filter === 'all' || b.every === filter));
  const monthStart = `${monthKey(today)}-01`;
  const end = addDays(today, 30);
  const firstMonth = shiftMonth(monthKey(today), -3);
  const from = `${firstMonth}-01`;
  const timeline = [];
  const later = [];
  const months = [0, 1, 2, 3].map((i) => ({ key: shiftMonth(firstMonth, i), paid: 0, toPay: 0 }));
  const monthAt = new Map(months.map((m) => [m.key, m]));

  for (const bill of bills) {
    const far = addDays(today, 400);
    const occ = occurrences(bill, txns, from, far);
    for (const o of occ) {
      if (!o.paid && bill.since && o.due < bill.since) continue;   // before the bill was tracked
      const m = monthAt.get(monthKey(o.paid ? o.paidDate : o.due));
      if (o.paid && m && o.paidDate <= today) m.paid += o.paidCents;
      if (o.due >= monthStart && o.due <= end) {
        const status = o.paid ? 'paid' : o.due < today ? 'late' : 'due';
        timeline.push({ bill, due: o.due, status, cents: o.paid ? o.paidCents : bill.cents, paidDate: o.paidDate });
        if (!o.paid && monthKey(o.due) === monthKey(today)) monthAt.get(monthKey(today)).toPay += bill.cents;
      }
    }
    const stillDue = occ.some((o) => !o.paid && o.due >= today && o.due <= end);
    if (!stillDue) {
      const next = occ.find((o) => o.due > end && !o.paid);
      if (next) later.push({ bill, due: next.due, cents: bill.cents });
    }
  }
  timeline.sort((a, b) => a.due.localeCompare(b.due) || a.bill.name.localeCompare(b.bill.name));
  later.sort((a, b) => a.due.localeCompare(b.due));
  const dueCents = timeline.filter((x) => x.status !== 'paid').reduce((a, x) => a + x.cents, 0);
  return { timeline, later, months, dueCents, count: bills.length };
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

const classify = (gap) => EVERY_IDS.find((id) => gap >= EVERY[id].min && gap <= EVERY[id].max) ?? null;

const title = (key) => key.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

// Name shown for a suggestion: Tuition, Rent (rent & housing direct debits), else the merchant.
function nameFor(key, categoryId) {
  if (key === 'cat:tuition') return 'Tuition';
  if (categoryId === 'housing') return 'Rent';
  return title(key);
}

// Payments grouped into one entry per bill payment: same-day payments add up; tuition adds up per semester.
function groupPayments(key, list) {
  const by = new Map();
  for (const t of list) {
    const k = key === 'cat:tuition' ? semesterKey(semesterOf(t.date)) : t.date;
    const g = by.get(k) ?? { date: t.date, cents: 0, categoryId: t.categoryId };
    if (t.date < g.date) g.date = t.date;
    g.cents += -t.amountCents;
    by.set(k, g);
  }
  return [...by.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// Suggestions: steady rhythm (every gap of the last 3 in the same range: weekly / fortnightly / monthly;
// half-yearly needs 2 payments), steady amount (last 3 within 25% of their middle value; tuition may vary),
// still going (last payment no older than 2 rhythms), and not already a bill or dismissed.
// Returns [{ key, name, cents, every, anchor, seen, next, categoryId }], most recent first.
export function detectBills(txns, records, today) {
  const known = new Set(records.map((r) => r.key).filter(Boolean));
  const groups = new Map();
  for (const t of txns) {
    if (!isPayment(t) || !t.categoryId || NOT_BILLS.has(t.categoryId)) continue;
    const key = keyOf(t);
    if (!key || known.has(key)) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const out = [];
  for (const [key, list] of groups) {
    const pays = groupPayments(key, list);
    if (pays.length < 2) continue;
    const last = pays.slice(-4);
    const gaps = last.slice(1).map((p, i) => daysBetween(last[i].date, p.date));
    const every = classify(gaps[gaps.length - 1]);
    if (!every) continue;
    if (every !== 'halfyearly' && last.length < 3) continue;
    if (!gaps.slice(-3).every((g) => classify(g) === every)) continue;
    const span = EVERY[every].days ?? EVERY[every].months * 30.44;
    const lastPay = last[last.length - 1];
    if (daysBetween(lastPay.date, today) > span * 2 + EVERY[every].tol) continue;
    const amounts = last.slice(-3).map((p) => p.cents);
    const mid = median(amounts);
    if (key !== 'cat:tuition' && !amounts.every((c) => Math.abs(c - mid) <= mid * 0.25)) continue;
    const categoryId = lastPay.categoryId;
    out.push({
      key, name: nameFor(key, categoryId), cents: key === 'cat:tuition' ? lastPay.cents : mid, every,
      anchor: lastPay.date, seen: last.map((p) => p.date), next: stepDate(lastPay.date, every, 1), categoryId,
    });
  }
  return out.sort((a, b) => b.anchor.localeCompare(a.anchor));
}

// A suggestion turned into a bill record (every may be changed in the confirm sheet).
export function billFromSuggestion(s, every = s.every, now = Date.now()) {
  return { uid: billUid(s.key), name: s.name, cents: s.cents, every, anchor: s.anchor, since: s.seen[0], categoryId: s.categoryId, key: s.key, updatedAt: now };
}

// Home's rent pill (M5): when you have a Rent & housing bill, its next unpaid due date within `withinDays`
// ({ date, cents, days } or null). undefined = no rent bill yet (Home then guesses from past rent payments).
export function rentFromBills(records, txns, today, withinDays = 7) {
  const rent = records.find((b) => !b.dismissed && b.categoryId === 'housing' && EVERY[b.every]);
  if (!rent) return undefined;
  const next = occurrences(rent, txns, addDays(today, -EVERY[rent.every].tol), addDays(today, 400))
    .find((o) => !o.paid && o.due >= today);
  if (!next) return null;
  const days = daysBetween(today, next.due);
  return days <= withinDays ? { date: next.due, cents: rent.cents, days } : null;
}
