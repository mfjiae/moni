// Investments (M4). Pure logic, tested in __tests__/investing.test.js. Money = integer cents.
//
// moni only sees the money that leaves for Betashares / CommSec, not which ETF it bought. You tag each
// investing transaction with its ETF(s): `etfSplit` on the transaction = [{ ticker, cents }], cents positive,
// adding up to the size of the transaction. One ETF = the whole amount. A transaction with no valid split
// counts as "Not tagged". Your ETF list is synced as records { uid: 'etf|<TICKER>', ticker, updatedAt }.
import { addDays, monthKey, shiftMonth, daysInMonth } from './dates.js';

export const UNTAGGED = '__untagged';
export const RANGES = [['1w', '1W'], ['1m', '1M'], ['3m', '3M'], ['6m', '6M'], ['1y', '1Y'], ['all', 'All']];
export const etfUid = (ticker) => `etf|${ticker}`;

// " bgbl " -> "BGBL". Throws on anything that isn't a plain ticker (2-8 letters/digits, an optional dot).
export function cleanTicker(text) {
  const t = String(text ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]{2,8}(\.[A-Z]{1,3})?$/.test(t)) throw new Error('Type the ticker, like BGBL');
  return t;
}

// Money put in by one transaction (out = positive, money back = negative).
export const putIn = (t) => -t.amountCents;

// The transaction's split if it is valid (tickers present, all positive, adds up to the amount), else null.
export function splitOf(t) {
  const s = t.etfSplit;
  if (!Array.isArray(s) || !s.length) return null;
  const size = Math.abs(t.amountCents);
  let sum = 0;
  const seen = new Set();
  for (const p of s) {
    if (!p?.ticker || !Number.isInteger(p.cents) || p.cents <= 0 || seen.has(p.ticker)) return null;
    seen.add(p.ticker);
    sum += p.cents;
  }
  return sum === size ? s : null;
}

// { ticker -> cents put in } for one transaction (UNTAGGED when it has no valid split).
export function etfShares(t) {
  const sign = putIn(t) >= 0 ? 1 : -1;
  const s = splitOf(t);
  if (!s) return { [UNTAGGED]: putIn(t) };
  return Object.fromEntries(s.map((p) => [p.ticker, sign * p.cents]));
}

// The sheet's editor rows -> what to store. rows: [{ ticker, cents }]; one row takes the whole amount.
// Returns { split, left, ok }: ok = every row has a ticker, no ticker twice, amounts add up exactly.
export function buildSplit(rows, amountCents) {
  const size = Math.abs(amountCents);
  const filled = rows.filter((r) => r.ticker);
  if (!filled.length) return { split: [], left: size, ok: true };      // nothing picked = Not tagged
  if (filled.length === 1 && rows.length === 1) return { split: [{ ticker: filled[0].ticker, cents: size }], left: 0, ok: true };
  const sum = rows.reduce((a, r) => a + (Number.isInteger(r.cents) ? r.cents : 0), 0);
  const tickers = rows.map((r) => r.ticker);
  const ok = rows.every((r) => r.ticker && Number.isInteger(r.cents) && r.cents > 0)
    && new Set(tickers).size === tickers.length && sum === size;
  return { split: ok ? rows.map((r) => ({ ticker: r.ticker, cents: r.cents })) : null, left: size - sum, ok };
}

// The ETF(s) of the newest tagged buy: pre-picked when you open an untagged one.
export function lastPick(txns) {
  let best = null;
  for (const t of txns) {
    if (t.kind !== 'investing' || !splitOf(t)) continue;
    if (!best || t.date > best.date || (t.date === best.date && (t.updatedAt ?? 0) > (best.updatedAt ?? 0))) best = t;
  }
  return best ? splitOf(best)[0].ticker : null;
}

// Your ETFs: the synced list plus any ticker used in a split; biggest all-time first (keeps colors steady).
export function etfList(records, txns) {
  const totals = new Map((records ?? []).map((r) => [r.ticker, 0]));
  for (const t of txns) {
    if (t.kind !== 'investing') continue;
    for (const [k, c] of Object.entries(etfShares(t))) if (k !== UNTAGGED) totals.set(k, (totals.get(k) ?? 0) + c);
  }
  return [...totals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
}

// First day of a range ending today. 1W = the last 7 days, 1M = since the same day last month (daily points);
// 3M / 6M / 1Y = whole calendar months including this one; All = from the first investing transaction.
export function rangeStart(range, today, firstDate) {
  if (range === '1w') return addDays(today, -6);
  if (range === '1m') {
    const prev = shiftMonth(monthKey(today), -1);
    const dim = daysInMonth(Number(prev.slice(0, 4)), Number(prev.slice(5)));
    const day = Math.min(Number(today.slice(8)), dim);
    return addDays(`${prev}-${String(day).padStart(2, '0')}`, 1);   // 25 Oct -> 26 Sep; 31 Mar -> 1 Mar
  }
  const n = { '3m': 3, '6m': 6, '1y': 12 }[range];
  if (n) return `${shiftMonth(monthKey(today), -(n - 1))}-01`;
  return firstDate ?? today;
}

// Everything the Investments page draws for one range.
// order: ETF tickers (etfList) for steady colors; buckets are days (1W, 1M) or months (the rest).
export function investView(txns, range, today, order = []) {
  const all = txns.filter((t) => t.kind === 'investing' && t.date <= today);
  const firstDate = all.reduce((m, t) => (!m || t.date < m ? t.date : m), null);
  const from = rangeStart(range, today, firstDate);
  const inRange = all.filter((t) => t.date >= from);
  const daily = range === '1w' || range === '1m';

  const keys = [];
  if (daily) for (let d = from; d <= today; d = addDays(d, 1)) keys.push(d);
  else for (let m = monthKey(from); m <= monthKey(today); m = shiftMonth(m, 1)) keys.push(m);
  const at = new Map(keys.map((k, i) => [k, i]));

  const ids = [...order];
  const perBucket = keys.map(() => ({}));
  const byEtf = {};
  for (const t of inRange) {
    const i = at.get(daily ? t.date : monthKey(t.date));
    if (i == null) continue;
    for (const [k, c] of Object.entries(etfShares(t))) {
      if (k !== UNTAGGED && !ids.includes(k)) ids.push(k);
      perBucket[i][k] = (perBucket[i][k] ?? 0) + c;
      byEtf[k] = (byEtf[k] ?? 0) + c;
    }
  }
  const bandIds = [...ids.filter((k) => byEtf[k]), ...(byEtf[UNTAGGED] ? [UNTAGGED] : [])];
  // Running total per ETF, bucket by bucket (stacked in the chart)
  const bands = bandIds.map((id) => {
    let run = 0;
    return { id, values: perBucket.map((b) => (run += b[id] ?? 0)) };
  });
  const total = Object.values(byEtf).reduce((a, c) => a + c, 0);
  const rows = bandIds.map((id) => ({ id, cents: byEtf[id], share: total > 0 ? byEtf[id] / total : 0 }));
  const months = [];
  for (let m = monthKey(today); m >= monthKey(from); m = shiftMonth(m, -1)) {
    const cents = all.filter((t) => monthKey(t.date) === m && t.date >= from).reduce((a, t) => a + putIn(t), 0);
    months.push({ key: m, cents });
  }
  return {
    from, daily, keys, bands, rows, total, months,
    allTime: all.reduce((a, t) => a + putIn(t), 0),
    list: inRange,
    untagged: inRange.filter((t) => !splitOf(t)).length,
  };
}
