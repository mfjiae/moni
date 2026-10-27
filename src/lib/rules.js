// Merchant rules: checked top to bottom, most specific first; the first match wins.
// kind decides how a transaction counts:
//   spend      -> counts in its category (refunds/reimbursements reduce it)
//   income     -> money in
//   saving     -> to/from your own savings account; never spending
//   investing  -> counts as spending, in the Investing category
//   review     -> goes to the Review inbox for you to categorize
//
// match fields (all on the UPPERCASED cleaned description):
//   startsWith, contains (string or list = any of), sign ('in' | 'out'), maxCents (absolute amount limit)

export const DEFAULT_RULES = [
  // Own savings accounts (xx2066 main savings, xx2103 2nd savings)
  { match: { contains: ['TRANSFER TO XX2066', 'TRANSFER TO XX2103'] }, kind: 'saving', categoryId: 'saving' },
  { match: { contains: ['TRANSFER FROM XX2066', 'TRANSFER FROM XX2103'] }, kind: 'saving', categoryId: 'saving' },
  // ...and the same transfers seen from a saver's own CSV (M2.6)
  { match: { contains: ['TRANSFER TO XX6193', 'TRANSFER FROM XX6193'] }, kind: 'saving', categoryId: 'saving' },

  // ATM cash withdrawals (Paid with cash, Ken 26 Oct 2026): the money moves to cash in hand, so it is not
  // spending; the cash counts when you spend it. The bank's wording is NOT verified (no withdrawal in Ken's
  // CSVs); a miss lands in To sort. Same pattern as isAtmWithdrawal in cash.js.
  { match: { startsWith: 'ATM ', sign: 'out' }, kind: 'internal', categoryId: 'internal' },
  { match: { startsWith: 'WDL ', sign: 'out' }, kind: 'internal', categoryId: 'internal' },
  { match: { startsWith: 'CASH WITHDRAWAL', sign: 'out' }, kind: 'internal', categoryId: 'internal' },
  { match: { contains: 'ATM WITHDRAWAL', sign: 'out' }, kind: 'internal', categoryId: 'internal' },

  // Income
  { match: { startsWith: 'SALARY' }, kind: 'income', categoryId: 'job-income' },
  // Family money: transfers marked "living fee/expenses" and the ATM cash deposits (Ken, Oct 2026)
  { match: { contains: ['LIVING FEE', 'LIVING EXPENSES'], sign: 'in' }, kind: 'income', categoryId: 'family' },
  { match: { startsWith: 'CASH DEPOSIT', sign: 'in' }, kind: 'income', categoryId: 'family' },
  { match: { startsWith: 'CREDIT INTEREST', sign: 'in' }, kind: 'income', categoryId: 'interest' },

  // Investing
  { match: { contains: ['BETASHARES', 'COMMSEC'] }, kind: 'investing', categoryId: 'investing' },

  // Uni: tuition is only the UTS BPAY payments; UTS card charges (kits, printing) are Education
  { match: { startsWith: 'UTS SYDNEY', contains: 'BPAY' }, kind: 'spend', categoryId: 'tuition', bill: true },
  // ...except "University Of Technol Broadway NS" (a different UTS merchant: health visit, Ken 13 Oct 2026)
  { match: { contains: 'UNIVERSITY OF TECHNOL BROADWAY NS' }, kind: 'spend', categoryId: 'health' },
  { match: { contains: 'UNIVERSITY OF TECHNO' }, kind: 'spend', categoryId: 'education' },
  // Health insurance claim refunds (AGA Assistance) reduce Health & medical
  { match: { contains: 'AGA ASSISTANCE' }, kind: 'spend', categoryId: 'health' },

  // Rent vs laundry: both contain SCAPE, so rent must come first.
  // Rent: direct debits (code STRP_BRO, older ones say broadwayx), transfers to SCAPE BROADWAY,
  // and returned (bounced) rent debits, which reduce Rent.
  { match: { startsWith: 'DIRECT DEBIT', contains: ['SCAPE', 'STRP_BRO'] }, kind: 'spend', categoryId: 'housing', bill: true },
  { match: { startsWith: 'RETURN', contains: 'STRP_BRO' }, kind: 'spend', categoryId: 'housing' },
  { match: { startsWith: 'TRANSFER TO SCAPE' }, kind: 'spend', categoryId: 'housing' },
  // Laundry = small Scape card purchases; a big one at Scape's desk is rent/fees
  { match: { contains: 'SCAPE AUSTRALIA', maxCents: 5000 }, kind: 'spend', categoryId: 'personal-care' },
  { match: { contains: 'SCAPE AUSTRALIA' }, kind: 'spend', categoryId: 'housing' },

  // Sport & fitness (badminton is often paid by PayID, so this comes before the people rule)
  { match: { startsWith: 'DIRECT DEBIT', contains: 'BROADWAY GYM' }, kind: 'spend', categoryId: 'sport', bill: true },
  { match: { contains: ['ACTIVATEUTS', 'ACTIVATE UTS', 'BROADWAY GYM', 'BADMINTON'] }, kind: 'spend', categoryId: 'sport' },

  // Phone (Moose Mobile, billed by TelcoPay; earlier Yomojo). Moose refunds reduce Utilities.
  { match: { startsWith: 'DIRECT DEBIT', contains: 'TELCOPAY' }, kind: 'spend', categoryId: 'utilities', bill: true },
  { match: { contains: ['TELCOPAY', 'TELCO PAY', 'MOOSE', 'YOMOJO'] }, kind: 'spend', categoryId: 'utilities' },

  // Bank fees
  { match: { contains: ['UNPAID PAYMENT FEE', 'INTERNATIONAL TRANSACTION FEE', 'DEBIT EXCESS INTEREST'] }, kind: 'spend', categoryId: 'fees' },

  // Businesses that are paid by PayID (must come before the people rule below)
  { match: { contains: ['JETSTAR', 'QANTAS', 'VIRGIN AUSTRALIA'] }, kind: 'spend', categoryId: 'travel' },

  // Payments to and from people: you decide each time
  { match: { contains: ['PAYID', 'FAST TRANSFER FROM'] }, kind: 'review' },

  // Groceries
  { match: { contains: ['ALDI', 'COLES', 'WOOLWORTHS', ' IGA ', 'IGA SUPERMA', 'BUTCHERY', 'ZETCITI'] }, kind: 'spend', categoryId: 'groceries' },

  // Entertainment
  { match: { contains: ['METRO AUTO PHOTO', 'PHOTOBOOTH', 'PHOTO BOOTH'] }, kind: 'spend', categoryId: 'entertainment' },

  // Eating out (UBER EATS before plain UBER)
  { match: { contains: ['UBER EATS', 'DOORDASH', 'MENULOG', 'MCDONALDS', 'KFC', 'HJS ', 'HUNGRY JACK', 'TB_', 'TACO BELL', 'DAVID S KITCHEN', 'ROLL?D', "ROLL'D", 'SUBWAY'] }, kind: 'spend', categoryId: 'eating-out' },

  // Transport
  { match: { contains: ['OPAL', 'TRANSPORTFORNSW', 'MYKI', 'SKYBUS', 'UBER', 'DIDI'] }, kind: 'spend', categoryId: 'transport' },

  // Travel
  { match: { contains: ['AIRBNB', 'BOOKING.COM'] }, kind: 'spend', categoryId: 'travel' },

  // Health
  { match: { contains: ['CHEMIST WAREHOUSE', 'PRICELINE', 'PHARMACY'] }, kind: 'spend', categoryId: 'health' },

  // Subscriptions and app purchases (the phone plan stays in Utilities, above)
  { match: { contains: ['ANTHROPIC', 'CLAUDE.AI', 'PATREON', 'REAL DEBRID', 'REAL-DEBRID', 'GOOGLE', 'SPOTIFY', 'NETFLIX', 'APPLE.COM'] }, kind: 'spend', categoryId: 'subscriptions' },

  // Shopping
  { match: { contains: ['OFFICEWORKS', 'KMART', 'TARGET', 'JB HI-FI', 'JB HI FI', 'AMAZON'] }, kind: 'spend', categoryId: 'shopping' },
];

// Payments to or from a person (always reviewed by hand, never auto-learned)
export function isPersonTransfer(description) {
  return /PAYID|FAST TRANSFER FROM/i.test(description) &&
    categorize(description, -1).kind === 'review';
}

// A short keyword to learn from a merchant description:
// "WOOLWORTHS 1248 SYDNEY NS AUS" -> "WOOLWORTHS", "SQ *ROLL?D MELBOURNE" -> "ROLL?D MELBOURNE",
// "Direct Debit 502541 TelcoPay 11708963" -> "TELCOPAY" (never just "DIRECT DEBIT")
const KEY_PREFIXES = [
  /^(REFUND PURCHASE|RETURN)\s+(\d{2}\/\d{2}\/\d{2,4}\s+)?/,
  /^DIRECT (DEBIT|CREDIT)\s+\d+\s+/,
  /^(FAST\s+)?TRANSFER\s+(TO|FROM)\s+/,
  /^[A-Z]{2,5}\s?\*\s*/, // card processor prefixes: SQ *, DD *, ZLR*, EZI*, KPAY*
];

export function merchantKey(description) {
  let s = description.toUpperCase().trim();
  for (const re of KEY_PREFIXES) s = s.replace(re, '');
  const tokens = s.split(/\s+/).filter(Boolean);
  const out = [];
  for (const raw of tokens) {
    const t = raw.replace(/\*.*$/, ''); // "REVOLUT**1899*" -> "REVOLUT"
    if (!t || /\d/.test(t) || out.length >= 2) break;
    out.push(t);
    if (t !== raw) break;
  }
  const key = out.length ? out.join(' ') : (tokens[0] ?? '');
  return isBroadKeyword(key) ? '' : key;
}

// Keywords that would catch far too much (the M2 bug: "DIRECT DEBIT" matched every direct debit).
// Learned rules with these are ignored and can't be saved.
const BROAD = /^(DIRECT( DEBIT| CREDIT)?|(FAST )?TRANSFER( TO| FROM)?|FAST|CARD|VALUE( DATE)?|PAYID|BPAY|COMMBANK( APP)?|REFUND( PURCHASE)?|RETURN|DEBIT|CREDIT|AUS?|SYDNEY|NSW|PTY|LTD|THE)$/;
export function isBroadKeyword(keyword) {
  const k = String(keyword ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
  return k.length < 3 || BROAD.test(k);
}

// A rule learned from the user: "always put KEYWORD in CATEGORY"
export function makeUserRule(keyword, categoryId, kind) {
  return { match: { contains: keyword.toUpperCase().trim() }, kind, categoryId, createdBy: 'user' };
}

function asList(v) {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

export function ruleMatches(rule, desc, amountCents) {
  const d = ` ${desc.toUpperCase()} `;
  const { startsWith, contains, sign, maxCents } = rule.match;
  if (startsWith && !desc.toUpperCase().startsWith(startsWith)) return false;
  if (maxCents != null && Math.abs(amountCents) > maxCents) return false;
  const any = asList(contains);
  if (any.length && !any.some((c) => d.includes(c))) return false;
  if (sign === 'in' && amountCents <= 0) return false;
  if (sign === 'out' && amountCents >= 0) return false;
  return true;
}

// Returns { kind, categoryId, bill, refund, ruleIndex }
export function categorize(description, amountCents, rules = DEFAULT_RULES) {
  let desc = description;
  let refund = false;
  const up = desc.toUpperCase();
  if (up.startsWith('REFUND PURCHASE ')) {
    refund = true;
    desc = desc.slice('REFUND PURCHASE '.length);
  }
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (ruleMatches(r, desc, refund ? -amountCents : amountCents)) {
      return { kind: r.kind, categoryId: r.categoryId ?? null, bill: !!r.bill, refund, ruleIndex: i };
    }
  }
  return { kind: 'review', categoryId: null, bill: false, refund, ruleIndex: -1 };
}
