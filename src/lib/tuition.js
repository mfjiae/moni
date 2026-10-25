// Tuition by UTS semester (M4). Pure logic, tested in __tests__/tuition.test.js. Money = integer cents.
// Ken pays at the start of each semester, so a payment belongs to the half-year it falls in:
// Jan–Jun = Autumn, Jul–Dec = Spring (UTS calendar). Refunds reduce that semester.

export const semesterOf = (iso) => ({ year: Number(iso.slice(0, 4)), term: Number(iso.slice(5, 7)) <= 6 ? 'A' : 'S' });
export const semesterKey = ({ year, term }) => `${year}-${term}`;
export const semesterName = (key) => `${key.endsWith('A') ? 'Autumn' : 'Spring'} ${key.slice(0, 4)}`;

// The semester just before: Spring 2026 -> Autumn 2026; Autumn 2026 -> Spring 2025.
export function prevSemester(key) {
  const year = Number(key.slice(0, 4));
  return key.endsWith('S') ? `${year}-A` : `${year - 1}-S`;
}
// The same semester a year earlier: Spring 2026 -> Spring 2025.
export const yearAgo = (key) => `${Number(key.slice(0, 4)) - 1}-${key.slice(5)}`;

// Percent change, one decimal; null when there's nothing to compare with.
export function pct(now, before) {
  if (!(before > 0)) return null;
  return Math.round(((now - before) / before) * 1000) / 10;
}

// txns: what moni counts. Returns { total, count, average, semesters } with semesters newest first:
// { key, name, cents, payments (newest first), vsPrev: { key, name, cents, pct } | null, vsYear: ... | null }.
// A comparison only shows when that semester has tuition in it.
export function tuitionView(txns) {
  const pays = txns.filter((t) => t.kind === 'spend' && t.categoryId === 'tuition');
  const map = new Map();
  for (const t of pays) {
    const key = semesterKey(semesterOf(t.date));
    if (!map.has(key)) map.set(key, { key, name: semesterName(key), cents: 0, payments: [] });
    const s = map.get(key);
    s.cents += -t.amountCents;
    s.payments.push(t);
  }
  const cmp = (s, key) => {
    const o = map.get(key);
    return o && o.cents > 0 ? { key, name: o.name, cents: o.cents, pct: pct(s.cents, o.cents) } : null;
  };
  const semesters = [...map.values()]
    .sort((a, b) => b.key.localeCompare(a.key))
    .map((s) => ({
      ...s,
      payments: s.payments.sort((a, b) => b.date.localeCompare(a.date)),
      vsPrev: cmp(s, prevSemester(s.key)),
      vsYear: cmp(s, yearAgo(s.key)),
    }));
  const total = semesters.reduce((a, s) => a + s.cents, 0);
  return { total, count: semesters.length, average: semesters.length ? Math.round(total / semesters.length) : 0, semesters };
}
