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
];

export const categoryById = Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.id, c]));
