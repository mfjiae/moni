// Merchant rules: checked top to bottom, most specific first; the first match wins.
// kind decides how a transaction counts:
//   spend      -> counts in its category (refunds/reimbursements reduce it)
//   income     -> money in
//   saving     -> to/from your own savings account; never spending
//   investing  -> counts as spending, in the Investing category
//   review     -> goes to the Review inbox for you to categorize
//
// match fields (all on the UPPERCASED cleaned description):
//   startsWith, contains (string or list = any of), sign ('in' | 'out')

export const DEFAULT_RULES = [
  // Own savings account (xx2066)
  { match: { contains: 'TRANSFER TO XX2066' }, kind: 'saving', categoryId: 'saving' },
  { match: { contains: 'TRANSFER FROM XX2066' }, kind: 'saving', categoryId: 'saving' },

  // Income
  { match: { startsWith: 'SALARY' }, kind: 'income', categoryId: 'income' },

  // Investing
  { match: { contains: ['BETASHARES', 'COMMSEC'] }, kind: 'investing', categoryId: 'investing' },

  // Rent vs laundry: both contain SCAPE, so rent (direct debit) must come first
  { match: { startsWith: 'DIRECT DEBIT', contains: 'SCAPE' }, kind: 'spend', categoryId: 'housing', bill: true },
  { match: { contains: 'SCAPE AUSTRALIA' }, kind: 'spend', categoryId: 'personal-care' },

  // Businesses that are paid by PayID (must come before the people rule below)
  { match: { contains: ['JETSTAR', 'QANTAS', 'VIRGIN AUSTRALIA'] }, kind: 'spend', categoryId: 'travel' },

  // Payments to and from people: you decide each time
  { match: { contains: ['PAYID', 'FAST TRANSFER FROM'] }, kind: 'review' },

  // Groceries
  { match: { contains: ['ALDI', 'COLES', 'WOOLWORTHS', ' IGA ', 'IGA SUPERMA', 'BUTCHERY'] }, kind: 'spend', categoryId: 'groceries' },

  // Eating out (UBER EATS before plain UBER)
  { match: { contains: ['UBER EATS', 'DOORDASH', 'MENULOG', 'MCDONALDS', 'KFC', 'HJS ', 'HUNGRY JACK', 'TB_', 'TACO BELL', 'DAVID S KITCHEN', 'ROLL?D', "ROLL'D"] }, kind: 'spend', categoryId: 'eating-out' },

  // Transport
  { match: { contains: ['OPAL', 'MYKI', 'SKYBUS', 'UBER', 'DIDI'] }, kind: 'spend', categoryId: 'transport' },

  // Travel
  { match: { contains: ['AIRBNB', 'BOOKING.COM'] }, kind: 'spend', categoryId: 'travel' },

  // Health
  { match: { contains: ['CHEMIST WAREHOUSE', 'PRICELINE', 'PHARMACY'] }, kind: 'spend', categoryId: 'health' },

  // Utilities and subscriptions
  { match: { contains: ['YOMOJO', 'GOOGLE', 'SPOTIFY', 'NETFLIX', 'APPLE.COM'] }, kind: 'spend', categoryId: 'utilities' },

  // Shopping
  { match: { contains: ['OFFICEWORKS', 'KMART', 'TARGET', 'JB HI-FI', 'AMAZON'] }, kind: 'spend', categoryId: 'shopping' },
];

function asList(v) {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

export function ruleMatches(rule, desc, amountCents) {
  const d = ` ${desc.toUpperCase()} `;
  const { startsWith, contains, sign } = rule.match;
  if (startsWith && !desc.toUpperCase().startsWith(startsWith)) return false;
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
