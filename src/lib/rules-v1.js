// Frozen copy of the M2 built-in rules. Only used once, by the M2.5 re-sort, to tell
// which transactions were sorted by a rule (safe to re-sort) and which you changed by hand (left alone).
// Do not edit.
export const RULES_V1 = [
  // Own savings account (xx2066)
  { match: { contains: 'TRANSFER TO XX2066' }, kind: 'saving', categoryId: 'saving' },
  { match: { contains: 'TRANSFER FROM XX2066' }, kind: 'saving', categoryId: 'saving' },

  // Income
  { match: { startsWith: 'SALARY' }, kind: 'income', categoryId: 'income' },

  // Investing
  { match: { contains: ['BETASHARES', 'COMMSEC'] }, kind: 'investing', categoryId: 'investing' },

  // Rent vs laundry: both contain SCAPE, so rent must come first.
  // Rent: direct debits (code STRP_BRO, older ones say broadwayx), transfers to SCAPE BROADWAY,
  // and returned (bounced) rent debits, which reduce Rent.
  { match: { startsWith: 'DIRECT DEBIT', contains: ['SCAPE', 'STRP_BRO'] }, kind: 'spend', categoryId: 'housing', bill: true },
  { match: { startsWith: 'RETURN', contains: 'STRP_BRO' }, kind: 'spend', categoryId: 'housing' },
  { match: { startsWith: 'TRANSFER TO SCAPE' }, kind: 'spend', categoryId: 'housing' },
  // Laundry = small Scape card purchases; a big one at Scape's desk is rent/fees
  { match: { contains: 'SCAPE AUSTRALIA', maxCents: 5000 }, kind: 'spend', categoryId: 'personal-care' },
  { match: { contains: 'SCAPE AUSTRALIA' }, kind: 'spend', categoryId: 'housing' },

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

  // Utilities and subscriptions
  // (Moose Mobile refunds arrive as money in and reduce Utilities)
  { match: { contains: ['YOMOJO', 'MOOSE', 'GOOGLE', 'SPOTIFY', 'NETFLIX', 'APPLE.COM'] }, kind: 'spend', categoryId: 'utilities' },

  // Shopping
  { match: { contains: ['OFFICEWORKS', 'KMART', 'TARGET', 'JB HI-FI', 'AMAZON'] }, kind: 'spend', categoryId: 'shopping' },
];
