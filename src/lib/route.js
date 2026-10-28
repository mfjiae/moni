// Page <-> URL hash (28 Oct 2026). The app shows `#/budgets` or `#/home/spending?category=groceries`
// so a reload opens the same page instead of Home. Pure functions; App.jsx reads and writes the hash.

export const TABS = ['home', 'budgets', 'add', 'cashflow', 'bills', 'activity', 'settings'];
export const DETAIL_PAGES = ['spending', 'income', 'saved', 'invested', 'where', 'cashflow', 'tuition', 'account'];
// Detail pages only open on top of these tabs (same rule App.jsx uses to draw them).
const DETAIL_TABS = ['home', 'cashflow', 'bills'];

// '#/home/spending?category=x' -> { tab: 'home', page: { name: 'spending', category: 'x' } }
// Anything unknown or missing falls back to Home with no detail page.
export function parseHash(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const [tabPart, pagePart] = path.split('/').map((s) => decodeURIComponent(s || ''));
  const tab = TABS.includes(tabPart) ? tabPart : 'home';
  if (!pagePart || !DETAIL_TABS.includes(tab) || !DETAIL_PAGES.includes(pagePart)) return { tab, page: null };
  const params = new URLSearchParams(query);
  const page = { name: pagePart };
  if (params.get('category')) page.category = params.get('category');
  if (params.get('account')) page.account = params.get('account');
  return { tab, page };
}

// { tab, page } -> '#/home/spending?category=x'
export function formatHash(tab, page) {
  let hash = `#/${encodeURIComponent(tab)}`;
  if (page?.name && DETAIL_TABS.includes(tab)) {
    hash += `/${encodeURIComponent(page.name)}`;
    const params = new URLSearchParams();
    if (page.category) params.set('category', page.category);
    if (page.account) params.set('account', page.account);
    const q = params.toString();
    if (q) hash += `?${q}`;
  }
  return hash;
}
