// Default categories. type: spend | income | saving | investing | internal
// Users can add, rename or hide categories later; ids never change.
export const DEFAULT_CATEGORIES = [
  { id: 'entertainment', name: 'Entertainment', type: 'spend' },
  { id: 'shopping', name: 'Shopping', type: 'spend' },
  { id: 'groceries', name: 'Groceries', type: 'spend' },
  { id: 'eating-out', name: 'Eating out & takeaway', type: 'spend' },
  { id: 'personal-care', name: 'Personal care', type: 'spend' },
  { id: 'utilities', name: 'Utilities', type: 'spend' },
  { id: 'transport', name: 'Vehicle & transport', type: 'spend' },
  { id: 'travel', name: 'Travel & holidays', type: 'spend' },
  { id: 'health', name: 'Health & medical', type: 'spend' },
  { id: 'gifts', name: 'Gifts & donations', type: 'spend' },
  { id: 'housing', name: 'Rent & housing', type: 'spend' },
  { id: 'other', name: 'Other', type: 'spend' },
  { id: 'investing', name: 'Investing', type: 'investing' },
  { id: 'income', name: 'Income', type: 'income' },
  { id: 'saving', name: 'Savings transfers', type: 'saving' },
  { id: 'internal', name: 'Excluded', type: 'internal' },
];

export const categoryById = Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.id, c]));

// How a transaction counts follows from its category's type.
export const kindForCategory = (id) => categoryById[id]?.type ?? 'spend';

// Picker order: money in shows Income first; money out shows spending first.
export function pickerCategories(amountCents) {
  const by = (t) => DEFAULT_CATEGORIES.filter((c) => c.type === t);
  return amountCents > 0
    ? [...by('income'), ...by('spend'), ...by('saving'), ...by('investing'), ...by('internal')]
    : [...by('spend'), ...by('investing'), ...by('saving'), ...by('internal'), ...by('income')];
}
