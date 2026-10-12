// Dates are stored as "YYYY-MM-DD" strings in Sydney local time.
// Never use new Date("01/10/2026"): JavaScript reads that as 10 January.

export const TIME_ZONE = 'Australia/Sydney';

// "01/10/2026" (DD/MM/YYYY) -> "2026-10-01"
export function parseDMY(text) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(text).trim());
  if (!m) throw new Error(`Not a DD/MM/YYYY date: "${text}"`);
  const [, dd, mm, yyyy] = m;
  const d = Number(dd), mo = Number(mm);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(Number(yyyy), mo)) {
    throw new Error(`Invalid date: "${text}"`);
  }
  return `${yyyy}-${mm}-${dd}`;
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Today's date in Sydney as "YYYY-MM-DD"
export function todaySydney(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  return parts; // en-CA formats as YYYY-MM-DD
}

// "2026-10-12" -> "2026-10"
export const monthKey = (iso) => iso.slice(0, 7);

// Fraction of the month elapsed, counting today as done: day 12 of 31 -> 12/31
export function monthPace(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return d / daysInMonth(y, m);
}

// "2026-10", -1 -> "2026-09"; "2026-12", 1 -> "2027-01"
export function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

// Current Sydney time as "HH:mm"
export function nowSydneyTime(now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now);
}

// "2026-10-01" -> "Thu 1 Oct"
export function longDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = dt.toLocaleDateString('en-AU', { weekday: 'short', timeZone: 'UTC' });
  const mon = dt.toLocaleDateString('en-AU', { month: 'short', timeZone: 'UTC' });
  return `${wd} ${d} ${mon}`;
}

// "2026-10" -> "October 2026"
export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-AU', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

// Short label relative to today: "Today", "Yesterday", "10 Oct"
export function shortDay(iso, today) {
  if (iso === today) return 'Today';
  const t = Date.UTC(...today.split('-').map((n, i) => (i === 1 ? n - 1 : +n)));
  const d = Date.UTC(...iso.split('-').map((n, i) => (i === 1 ? n - 1 : +n)));
  if (t - d === 86400000) return 'Yesterday';
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
