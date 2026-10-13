// Group an already-sorted (newest first) transaction list by day for the detail and account pages.
// Pages by whole days: keeps adding days until at least `limit` transactions are shown, so a day is
// never cut in half. Each day carries its net total (money in minus money out) in integer cents.
export function groupByDay(list, limit = 30) {
  const groups = [];
  let shown = 0;
  for (const t of list) {
    const last = groups[groups.length - 1];
    if (last && last.date === t.date) {
      last.items.push(t);
      last.netCents += t.amountCents;
      shown += 1;
    } else {
      if (shown >= limit) break;
      groups.push({ date: t.date, items: [t], netCents: t.amountCents });
      shown += 1;
    }
  }
  return { groups, shown };
}
