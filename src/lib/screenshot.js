// Screenshot import (Ken, 27 Oct 2026; UI locked: review list C, CommBank's category as the fallback guess,
// pending rows in with a "pending" tag, Import menu next to the CSV import). Pure logic, tested in
// __tests__/screenshot.test.js. The reading itself (OCR) is in ocr.js and only runs in the browser.
//
// Two ways in:
// - a screenshot of the CommBank app's Smart Access transactions page, read on the phone (ocr.js gives
//   us its words with their positions; parseShotLines turns them into rows);
// - rows pasted from chat, one per line: "26/10/2026 | PENDING: Shop name | -111.95 | Entertainment"
//   (parsePastedRows).
// Either way you confirm every row before it is saved (Ken: "it'll ask me to confirm on each transaction").
//
// What a saved screenshot row is: a Smart Access row with `source: 'manual', shot: true` (plus
// `pending: true` when CommBank showed "PENDING:"). It counts in every total and in the balance like a
// typed entry that is still pending, so the balance is "bank CSV balance + rows seen since". It is NOT a
// typed entry: no "typed" tag, not in "Typed only". When the bank CSV later has the same amount within
// MATCH_DAYS, moni always asks "is it the same one?" (Ken: "Ask me each time"), see importer.js / typed.js.
import { categorize } from './rules.js';
import { addDays, parseDMY } from './dates.js';
import { MATCH_DAYS } from './typed.js';
import { MAIN, accountOf, isMain, transferOther } from './accounts.js';
import { allCategories, getCategory, kindForCategory } from './categories.js';

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const WEEKDAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const validDay = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
const weekday = (s) => new Date(`${s}T00:00:00Z`).getUTCDay();
const dayNumber = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000;

// "Mon 26 Oct", "Monday 26 October", "26 Oct", "26 Oct 2026", "Today", "Yesterday" (CommBank's day
// headings; anything after the date, like "Yesterday" or "2 days ago", is ignored). No year on screen, so
// it is the latest such day that isn't after today (a weekday that only fits last year picks last year).
const HEADER = /^\W{0,3}(?:(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?\b/i;
export function headerDate(text, today) {
  const t = String(text).trim();
  if (/^\W{0,3}today\b/i.test(t)) return today;
  if (/^\W{0,3}yesterday\b/i.test(t)) return addDays(today, -1);
  const m = HEADER.exec(t);
  if (!m) return null;
  const d = Number(m[2]);
  const mo = MONTHS[m[3].toLowerCase()];
  if (m[4]) return validDay(+m[4], mo, d) ? iso(+m[4], mo, d) : null;
  const y = Number(today.slice(0, 4));
  const tomorrow = addDays(today, 1);
  const options = [y, y - 1].filter((yy) => validDay(yy, mo, d)).map((yy) => iso(yy, mo, d)).filter((s) => s <= tomorrow);
  if (!options.length) return null;
  const wd = m[1] ? WEEKDAYS[m[1].toLowerCase()] : null;
  return (wd != null && options.find((s) => weekday(s) === wd)) || options[0];
}

// A pasted date: DD/MM/YYYY, YYYY-MM-DD, or a CommBank-style heading.
function pastedDate(text, today) {
  const t = String(text).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return validDay(+t.slice(0, 4), +t.slice(5, 7), +t.slice(8, 10)) ? t : null;
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (dmy) { try { return parseDMY(`${pad(dmy[1])}/${pad(dmy[2])}/${dmy[3]}`); } catch { return null; } }
  return headerDate(t, today);
}

// "$111.95", "-$4.50", "1,234.00" -> cents (always positive; the sign is decided elsewhere), or null.
// It must have cents ("$450" could be a misread "$4.50", so it is not trusted).
export function moneyCents(text) {
  const t = String(text).replace(/\s+/g, '').replace(/^[-−–—~_+]+/, '');
  const m = /^\$?(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})$/.exec(t);
  if (!m) return null;
  return Number(m[1].replace(/,/g, '')) * 100 + Number(m[2]);
}
const looksMoney = (text) => /\$|\d[.,]\d\d$/.test(text) && !/[a-z]{2,}/i.test(text);

// CommBank's category label -> a moni category id (only a starting guess). Labels that don't say
// enough ("Transfers & payments", "Uncategorised") give null: the row is To sort unless a rule knew it.
const BANK_LABELS = {
  'eating out': 'eating-out', 'eating out & takeaway': 'eating-out', 'restaurants & takeaway': 'eating-out', 'food & drink': 'eating-out', takeaway: 'eating-out',
  groceries: 'groceries', shopping: 'shopping', entertainment: 'entertainment', 'personal care': 'personal-care',
  health: 'health', 'health & medical': 'health', medical: 'health',
  'sport & fitness': 'sport', fitness: 'sport', education: 'education',
  home: 'housing', rent: 'housing', housing: 'housing', 'rent & housing': 'housing',
  utilities: 'utilities', 'bills & utilities': 'utilities', subscriptions: 'subscriptions',
  transport: 'transport', 'vehicle & transport': 'transport', 'travel & holidays': 'travel', travel: 'travel', holidays: 'travel',
  'gifts & donations': 'gifts', gifts: 'gifts', donations: 'gifts', 'fees & interest': 'fees', fees: 'fees',
  'professional services': 'professional', insurance: 'insurance', pets: 'pets', childcare: 'childcare', 'tax paid': 'tax', tax: 'tax',
  business: 'business', 'home loan': 'home-loan', shares: 'investing', 'other investments': 'investing', investments: 'investing',
  income: 'income', 'other income': 'income', salary: 'job-income', wages: 'job-income', interest: 'interest',
};
const NO_GUESS = new Set(['transfers & payments', 'transfers', 'uncategorised', 'uncategorized', 'other', 'cash']);
const norm = (s) => String(s).toLowerCase().replace(/\band\b/g, '&').replace(/[^a-z& ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Is this text one of CommBank's category labels? (Used to tell the small grey line under a name.)
export function isBankLabel(text) {
  const n = norm(text);
  return !!n && (n in BANK_LABELS || NO_GUESS.has(n) || allCategories().some((c) => norm(c.name) === n));
}

// moni category for a CommBank label, checked against the money direction: income only for money in,
// investing only for money out (a money-in row with a spending category is a refund, which is fine).
export function bankCategory(label, amountCents) {
  if (!label) return null;
  const n = norm(label);
  if (NO_GUESS.has(n)) return null;
  const id = BANK_LABELS[n] ?? allCategories().find((c) => norm(c.name) === n)?.id ?? null;
  const type = id ? getCategory(id)?.type : null;
  if (!type) return null;
  if (type === 'income' && amountCents < 0) return null;
  if (type === 'investing' && amountCents > 0) return null;
  if (type === 'saving' || type === 'internal') return null;
  return id;
}

const cleanName = (s) => String(s).replace(/\s+/g, ' ').trim();
function splitPending(name) {
  const m = /^\W{0,2}pending\s*[:;.]?\s*/i.exec(name);
  return m ? { name: cleanName(name.slice(m[0].length)), pending: true } : { name: cleanName(name), pending: false };
}

// Rows pasted from chat. One per line: date | name | amount | category (category optional; commas or tabs
// work too). "-" = money out, no sign or "+" = money in. "PENDING:" before the name, or a "pending" field,
// marks a pending row. Returns { rows, errors: [{ line, text }] }.
export function parsePastedRows(text, today) {
  const rows = [];
  const errors = [];
  String(text).split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const parts = (/[|\t]/.test(line) ? line.split(/[|\t]/) : line.split(',')).map((p) => p.trim()).filter((p) => p !== '');
    const date = parts.length ? pastedDate(parts[0], today) : null;
    let ai = -1;
    for (let k = parts.length - 1; k >= 1; k--) if (moneyCents(parts[k]) != null) { ai = k; break; }
    if (!date || ai < 2) { errors.push({ line: i + 1, text: line }); return; }
    const cents = moneyCents(parts[ai]);
    const sign = /^\s*[-−–—]/.test(parts[ai]) ? -1 : 1;
    const rest = parts.slice(ai + 1);
    const pendingField = rest.some((p) => /^pending$/i.test(p));
    const label = rest.find((p) => !/^pending$/i.test(p)) ?? null;
    const { name, pending } = splitPending(parts.slice(1, ai).join(', '));
    if (!name || !cents) { errors.push({ line: i + 1, text: line }); return; }
    rows.push({ date, name, amountCents: sign * cents, pending: pending || pendingField, bankLabel: label, problem: null });
  });
  return { rows, errors };
}

// The words OCR found on a CommBank transactions screenshot -> rows.
// lines: [{ words: [{ text, x0, y0, x1, y1 }] }] in the picture's pixels. isGreen(box) says whether an amount
// sits on CommBank's green "money in" pill (the minus sign of money out is often lost by OCR, the color isn't).
// Layout (CommBank app, Oct 2026): a status bar and the account title on top, then day headings
// ("Mon 26 Oct  Yesterday"), each followed by rows: logo, name (with "PENDING:" when pending), CommBank's
// category on a smaller line under it, the amount on the right. The app's bottom menu (Home, Accounts, Pay,
// Cards) and anything just above it is ignored. An amount moni can't read (hidden under the round search
// button, cut off) gives problem 'amount', so you fix or skip that row.
// Returns { rows, account: 'xx6193' | 'other' | null, title }.
export function parseShotLines({ width, height, lines, isGreen = () => false, today }) {
  const ordered = lines
    .map((l) => {
      const words = (l.words ?? []).filter((w) => w.text && w.text.trim());
      if (!words.length) return null;
      return { words, y0: Math.min(...words.map((w) => w.y0)), y1: Math.max(...words.map((w) => w.y1)), text: words.map((w) => w.text).join(' ') };
    })
    .filter(Boolean)
    .sort((a, b) => a.y0 - b.y0);

  const nav = ordered.find((l) => l.words.filter((w) => /^(home|accounts|pay|cards)$/i.test(w.text.trim())).length >= 3);
  const cut = nav ? nav.y0 - 0.045 * height : height;
  const titleText = ordered.filter((l) => l.y1 < 0.16 * height).map((l) => l.text).join(' ');
  const account = /smart\s*access/i.test(titleText) ? MAIN : /saver|xx\d{4}|goal/i.test(titleText) ? 'other' : null;

  const logoEdge = 0.19 * width; // the round logos on the left
  const half = 0.5 * width; // amounts sit right of the middle...
  const edge = 0.78 * width; // ...and anything else this far right is not part of a name (the search button)
  const rows = [];
  let date = null;
  let row = null;
  const close = () => { if (row) rows.push(row); row = null; };

  for (const l of ordered) {
    if ((l.y0 + l.y1) / 2 >= cut) break;
    const hd = headerDate(l.text, today);
    if (hd && !l.words.some((w) => w.x0 > half && moneyCents(w.text) != null)) { close(); date = hd; continue; }
    if (!date) continue;
    const words = l.words.filter((w) => w.x1 >= logoEdge);
    const isMoney = (w) => w.x0 >= half && looksMoney(w.text);
    const moneyWords = words.filter(isMoney);
    const left = words.filter((w) => !isMoney(w) && w.x0 < edge);
    const rightWords = words.filter((w) => w.x0 >= edge);
    const text = cleanName(left.map((w) => w.text).join(' '));
    const money = moneyWords.length ? {
      cents: moneyCents(moneyWords.map((w) => w.text).join('')),
      box: { x0: Math.min(...moneyWords.map((w) => w.x0)), y0: Math.min(...moneyWords.map((w) => w.y0)), x1: Math.max(...moneyWords.map((w) => w.x1)), y1: Math.max(...moneyWords.map((w) => w.y1)) },
      text: moneyWords.map((w) => w.text).join(''),
    } : null;
    const junkRight = rightWords.some((w) => !isMoney(w));

    // The small category line under a name (it can carry the amount, which is centred between the two lines).
    if (row && !row.bankLabel && text && isBankLabel(text) && l.y0 - row.y1 < 0.035 * height) {
      row.bankLabel = text;
      row.y1 = l.y1;
      if (!row.money && money) row.money = money;
      if (junkRight && !row.money) row.junk = true;
      continue;
    }
    if (!text) { if (row && !row.money && money) row.money = money; continue; }
    close();
    row = { date, text, money, junk: junkRight, y0: l.y0, y1: l.y1 };
  }
  close();

  return {
    title: titleText,
    account,
    rows: rows.map((r) => {
      const { name, pending } = splitPending(r.text);
      const cents = r.money?.cents ?? null;
      const credit = cents != null && isGreen(r.money.box);
      return {
        date: r.date,
        name,
        pending,
        amountCents: cents == null ? null : credit ? cents : -cents,
        bankLabel: r.bankLabel ?? null,
        problem: cents == null ? 'amount' : null,
      };
    }).filter((r) => r.name),
  };
}

// Several pictures (scrolling down the list): the same row seen in an earlier picture is only kept once.
// Two identical rows inside ONE picture are both kept (two coffees at the same price).
export function combineShots(lists) {
  const out = [];
  const key = (r) => `${r.date}|${r.amountCents}|${norm(r.name)}`;
  for (const list of lists) {
    const earlier = new Map();
    for (const r of out) earlier.set(key(r), (earlier.get(key(r)) ?? 0) + 1);
    for (const r of list) {
      const k = key(r);
      if (r.amountCents != null && earlier.get(k) > 0) { earlier.set(k, earlier.get(k) - 1); continue; }
      out.push(r);
    }
  }
  return out;
}

const words = (s) => new Set(String(s).toUpperCase().split(/[^A-Z0-9]+/).filter((w) => w.length >= 3 && !/^\d+$/.test(w)));
function overlap(a, b) {
  const A = words(a);
  let n = 0;
  for (const w of words(b)) if (A.has(w)) n++;
  return n;
}

// The review list: each row with moni's category guess and whether it is already in moni.
// rows: from parsePastedRows / parseShotLines (combined). txns = every stored row. Returns
// [{ id, date, name, amountCents, pending, bankLabel, kind, categoryId, guess: 'rule'|'bank'|null,
//    transfer, atm, dupOf: { uid, from: 'bank'|'typed'|'screenshot', name, date } | null, problem }].
// "Already in moni" = a Smart Access row (bank, typed or an earlier screenshot; not cash) with the same
// amount within MATCH_DAYS, one to one; a row sharing words with the name, then the closest date, wins.
export function planShot(rows, { txns = [], rules, today } = {}) {
  const items = rows.map((r, i) => {
    const base = { id: `s${i}`, date: r.date, name: r.name, amountCents: r.amountCents, pending: !!r.pending, bankLabel: r.bankLabel ?? null, problem: r.problem ?? null, dupOf: null, transfer: false, atm: false };
    if (r.amountCents == null) return { ...base, kind: 'review', categoryId: null, guess: null };
    if (r.date > addDays(today, 1)) return { ...base, kind: 'review', categoryId: null, guess: null, problem: 'date' };
    const other = transferOther(r.name);
    if (other && !isMain(other)) return { ...base, kind: 'saving', categoryId: 'saving', guess: 'rule', transfer: true };
    const c = categorize(r.name, r.amountCents, rules);
    if (c.kind !== 'review' && c.categoryId) return { ...base, kind: c.kind, categoryId: c.categoryId, guess: 'rule', atm: !!c.atm };
    const id = bankCategory(r.bankLabel, r.amountCents);
    return id ? { ...base, kind: getCategory(id).type, categoryId: id, guess: 'bank' } : { ...base, kind: 'review', categoryId: null, guess: null };
  });

  const pool = txns.filter((t) => isMain(accountOf(t)) && !t.cash);
  const pairs = [];
  for (const it of items) {
    if (it.amountCents == null || it.problem) continue;
    for (const t of pool) {
      if (t.amountCents !== it.amountCents) continue;
      const gap = Math.min(Math.abs(dayNumber(t.date) - dayNumber(it.date)), Math.abs(dayNumber(t.postedDate ?? t.date) - dayNumber(it.date)));
      if (gap > MATCH_DAYS) continue;
      pairs.push({ it, t, score: overlap(it.name, `${t.description} ${t.nickname ?? ''}`) * 10 - gap });
    }
  }
  pairs.sort((a, b) => b.score - a.score || a.it.id.localeCompare(b.it.id));
  const usedT = new Set();
  for (const { it, t } of pairs) {
    if (it.dupOf || usedT.has(t.uid)) continue;
    usedT.add(t.uid);
    it.dupOf = { uid: t.uid, from: t.shot ? 'screenshot' : t.source === 'csv' ? 'bank' : 'typed', name: t.nickname || t.description, date: t.date };
  }
  return items;
}

// Rows you can tick: readable amount, a date that isn't in the future, and a category picked.
export const canConfirm = (it) => !it.problem && it.amountCents != null && !!it.categoryId;

// The record saved for a confirmed row (the caller adds uid / updatedAt / createdAt).
// toSort = "Leave in To sort": saved without a category.
export function shotRecord(it, { toSort = false } = {}) {
  const sorted = !toSort && it.categoryId;
  return {
    date: it.date, postedDate: it.date, amountCents: it.amountCents,
    description: it.name, rawDescription: it.name,
    source: 'manual', shot: true,
    ...(it.pending ? { pending: true } : {}),
    ...(it.transfer ? { transfer: true } : {}),
    ...(it.atm && sorted ? { atm: true } : {}),
    ...(it.bankLabel ? { bankLabel: it.bankLabel } : {}),
    kind: sorted ? kindForCategory(it.categoryId) : 'review',
    categoryId: sorted ? it.categoryId : null,
    refund: false,
    note: '',
  };
}
