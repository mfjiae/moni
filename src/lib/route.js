// Page <-> URL hash (28 Oct 2026). The app shows `#/budgets` or `#/home/spending?category=groceries`
// so a reload opens the same page instead of Home. Pure functions; App.jsx reads and writes the hash.

export const TABS = ['home', 'budgets', 'add', 'cashflow', 'bills', 'activity', 'settings'];
export const DETAIL_PAGES = ['spending', 'income', 'saved', 'invested', 'where', 'cashflow', 'tuition', 'account'];
// Detail pages only open on top of these tabs (same rule App.jsx uses to draw them).
const DETAIL_TABS = ['home', 'cashflow', 'bills'];
// Activity can open with a preset: 'review' = To sort only, 'all' = no filters (Home's shortcuts).
const FILTERS = ['review', 'all'];

// '#/home/spending?category=x' -> { tab: 'home', page: { name: 'spending', category: 'x' }, filter: null }
// Anything unknown or missing falls back to Home with no detail page.
export function parseHash(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const [tabPart, pagePart] = path.split('/').map((s) => decodeURIComponent(s || ''));
  const tab = TABS.includes(tabPart) ? tabPart : 'home';
  const params = new URLSearchParams(query);
  const filter = tab === 'activity' && FILTERS.includes(params.get('filter')) ? params.get('filter') : null;
  if (!pagePart || !DETAIL_TABS.includes(tab) || !DETAIL_PAGES.includes(pagePart)) return { tab, page: null, filter };
  const page = { name: pagePart };
  if (params.get('category')) page.category = params.get('category');
  if (params.get('account')) page.account = params.get('account');
  return { tab, page, filter };
}

// { tab, page, filter } -> '#/home/spending?category=x' or '#/activity?filter=review'
export function formatHash(tab, page, filter) {
  let hash = `#/${encodeURIComponent(tab)}`;
  if (page?.name && DETAIL_TABS.includes(tab)) {
    hash += `/${encodeURIComponent(page.name)}`;
    const params = new URLSearchParams();
    if (page.category) params.set('category', page.category);
    if (page.account) params.set('account', page.account);
    const q = params.toString();
    if (q) hash += `?${q}`;
  } else if (tab === 'activity' && FILTERS.includes(filter)) {
    hash += `?filter=${filter}`;
  }
  return hash;
}
