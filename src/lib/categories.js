// Categories. type: spend | income | saving | investing | internal
// Ids never change (transactions store the id). Names and hidden can be changed
// by the user, and custom categories can be added; those changes are stored in the
// `categories` table and synced like transactions.

// CommBank-aligned set (M2.5). `hidden` = available but not shown in pickers until unhidden.
export const DEFAULT_CATEGORIES = [
  // Spending
  { id: 'eating-out', name: 'Eating out & takeaway', type: 'spend' },
  { id: 'groceries', name: 'Groceries', type: 'spend' },
  { id: 'shopping', name: 'Shopping', type: 'spend' },
  { id: 'entertainment', name: 'Entertainment', type: 'spend' },
  { id: 'personal-care', name: 'Personal care', type: 'spend' },
  { id: 'health', name: 'Health & medical', type: 'spend' },
  { id: 'sport', name: 'Sport & fitness', type: 'spend' },
  { id: 'education', name: 'Education', type: 'spend' },
  { id: 'tuition', name: 'Tuition', type: 'spend' },
  { id: 'housing', name: 'Rent & housing', type: 'spend' },
  { id: 'utilities', name: 'Utilities', type: 'spend' },
  { id: 'subscriptions', name: 'Subscriptions', type: 'spend' },
  { id: 'transport', name: 'Vehicle & transport', type: 'spend' },
  { id: 'travel', name: 'Travel & holidays', type: 'spend' },
  { id: 'gifts', name: 'Gifts & donations', type: 'spend' },
  { id: 'fees', name: 'Fees & interest', type: 'spend' },
  { id: 'professional', name: 'Professional services', type: 'spend' },
  { id: 'other', name: 'Uncategorized', type: 'spend' },
  // Hidden by default (CommBank has them; Ken doesn't use them yet)
  { id: 'business', name: 'Business', type: 'spend', hidden: true },
  { id: 'cash', name: 'Cash', type: 'spend', hidden: true },
  { id: 'childcare', name: 'Childcare', type: 'spend', hidden: true },
  { id: 'home-loan', name: 'Home loan', type: 'spend', hidden: true },
  { id: 'insurance', name: 'Insurance', type: 'spend', hidden: true },
  { id: 'pets', name: 'Pets', type: 'spend', hidden: true },
  { id: 'tax', name: 'Tax paid', type: 'spend', hidden: true },
  { id: 'super', name: 'Super contributions', type: 'spend', hidden: true },
  // Income ('income' was the single M2 income category; it is now "Other income")
  { id: 'job-income', name: 'Job income', type: 'income' },
  { id: 'family', name: 'Family support', type: 'income' },
  { id: 'interest', name: 'Interest', type: 'income' },
  { id: 'income', name: 'Other income', type: 'income' },
  // Not spending
  { id: 'investing', name: 'Investing', type: 'investing' },
  { id: 'saving', name: 'Savings transfers', type: 'saving' },
  { id: 'internal', name: 'Transfers & payments (excluded)', type: 'internal' },
];

// Categories the user can't hide (the app depends on them).
export const LOCKED = new Set(['other', 'income', 'investing', 'saving', 'internal']);

export const TYPE_LABEL = {
  spend: 'Spending', income: 'Income', investing: 'Investing', saving: 'Savings', internal: 'Excluded',
};

const DEFAULT_BY_ID = Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.id, c]));

// Merge the defaults with the user's changes (renames, hide/unhide, custom categories).
// overrides: [{ id, name?, hidden?, type?, custom? }]
export function buildCategories(overrides = []) {
  const map = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, { ...c, hidden: !!c.hidden }]));
  for (const o of overrides) {
    const base = map.get(o.id);
    if (base) {
      map.set(o.id, {
        ...base,
        name: o.name?.trim() || base.name,
        hidden: LOCKED.has(o.id) ? false : (o.hidden ?? base.hidden),
      });
    } else if (o.custom && o.name && o.type) {
      map.set(o.id, { id: o.id, name: o.name, type: o.type, hidden: !!o.hidden, custom: true });
    }
  }
  return [...map.values()];
}

// The live set used by the screens. App.jsx calls setCategoryOverrides when the
// synced categories table changes; pure logic and tests use the defaults.
let current = buildCategories();
let currentById = Object.fromEntries(current.map((c) => [c.id, c]));

export function setCategoryOverrides(overrides) {
  current = buildCategories(overrides);
  currentById = Object.fromEntries(current.map((c) => [c.id, c]));
}

export const allCategories = () => current;
export const getCategory = (id) => currentById[id] ?? DEFAULT_BY_ID[id] ?? null;
export const categoryName = (id) => getCategory(id)?.name ?? 'Uncategorized';

// How a transaction counts follows from its category's type.
export const kindForCategory = (id) => getCategory(id)?.type ?? 'spend';

// Picker list for a direction. Money in shows Income first; money out shows spending first.
// usage: { categoryId: count } -> the most-used come first in their own group.
export function pickerGroups(amountCents, usage = {}, { includeHidden = false } = {}) {
  const visible = current.filter((c) => includeHidden || !c.hidden);
  const order = amountCents > 0
    ? ['income', 'spend', 'saving', 'investing', 'internal']
    : ['spend', 'investing', 'saving', 'internal', 'income'];
  const groups = order.map((t) => ({ type: t, label: TYPE_LABEL[t], items: visible.filter((c) => c.type === t) }));
  const want = amountCents > 0 ? 'income' : 'spend';
  const most = visible
    .filter((c) => (usage[c.id] ?? 0) > 0 && (c.type === want || c.type === 'investing' || c.type === 'saving'))
    .sort((a, b) => usage[b.id] - usage[a.id])
    .slice(0, 5);
  return { most, groups: groups.filter((g) => g.items.length) };
}

// "Gym stuff" -> "custom-gym-stuff-x7k2" (unique enough, never reused)
export function customCategoryId(name, rand = Math.random) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'category';
  return `custom-${slug}-${rand().toString(36).slice(2, 6)}`;
}
