import { describe, it, expect } from 'vitest';
import { parseHash, formatHash } from '../route.js';

describe('route hash', () => {
  it('empty or unknown hash opens Home', () => {
    expect(parseHash('')).toEqual({ tab: 'home', page: null });
    expect(parseHash('#/nonsense')).toEqual({ tab: 'home', page: null });
  });
  it('reads a tab', () => {
    expect(parseHash('#/budgets')).toEqual({ tab: 'budgets', page: null });
    expect(parseHash('#/activity')).toEqual({ tab: 'activity', page: null });
  });
  it('reads a detail page with its extras', () => {
    expect(parseHash('#/home/spending?category=groceries')).toEqual({ tab: 'home', page: { name: 'spending', category: 'groceries' } });
    expect(parseHash('#/home/account?account=xx2066')).toEqual({ tab: 'home', page: { name: 'account', account: 'xx2066' } });
  });
  it('ignores detail pages on tabs that cannot show them, and unknown pages', () => {
    expect(parseHash('#/budgets/spending')).toEqual({ tab: 'budgets', page: null });
    expect(parseHash('#/home/hacked')).toEqual({ tab: 'home', page: null });
  });
  it('formats and round-trips', () => {
    expect(formatHash('budgets', null)).toBe('#/budgets');
    expect(formatHash('home', { name: 'spending', category: 'eating-out' })).toBe('#/home/spending?category=eating-out');
    const h = formatHash('bills', { name: 'tuition' });
    expect(parseHash(h)).toEqual({ tab: 'bills', page: { name: 'tuition' } });
  });
});
