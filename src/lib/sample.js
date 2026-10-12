// Made-up sample data for M1, shown until real data is imported (M2).
// Not real transactions.
export const SAMPLE_TODAY = '2026-10-12';

export const SAMPLE_BUDGETS = [
  { categoryId: 'groceries', limitCents: 40000 },
  { categoryId: 'eating-out', limitCents: 15000 },
  { categoryId: 'transport', limitCents: 12000 },
  { categoryId: 'entertainment', limitCents: 8000 },
  { categoryId: 'personal-care', limitCents: 6000 },
  { categoryId: 'utilities', limitCents: 6000 },
];

const t = (date, amountCents, description, kind, categoryId) =>
  ({ date, amountCents, description, kind, categoryId });

export const SAMPLE_TXNS = [
  t('2026-10-12', -4620, 'Woolworths', 'spend', 'groceries'),
  t('2026-10-11', -3250, 'Uber Eats', 'spend', 'eating-out'),
  t('2026-10-10', -2000, 'Opal top-up', 'spend', 'transport'),
  t('2026-10-09', 92000, 'Pay', 'income', 'income'),
  t('2026-10-08', -91600, 'Rent', 'spend', 'housing'),
  t('2026-10-08', -40000, 'To savings', 'saving', 'saving'),
  t('2026-10-07', -5850, 'Aldi', 'spend', 'groceries'),
  t('2026-10-06', -8697, 'Concert tickets', 'spend', 'entertainment'),
  t('2026-10-05', -10600, 'Dinner out', 'spend', 'eating-out'),
  t('2026-10-04', -900, 'Laundry', 'spend', 'personal-care'),
  t('2026-10-03', -2120, 'Opal top-up', 'spend', 'transport'),
  t('2026-10-02', -1245, 'Phone plan', 'spend', 'utilities'),
  t('2026-10-01', -7770, 'Coles', 'spend', 'groceries'),
  t('2026-10-01', -5000, 'Betashares', 'investing', 'investing'),
];
