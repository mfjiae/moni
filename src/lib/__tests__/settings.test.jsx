// Render check: Settings shows the side list; desktop opens Sync by default, phone shows only the list.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mq = (matches) => () => ({ matches, addEventListener() {}, removeEventListener() {} });
async function render(wide) {
  vi.resetModules();
  globalThis.window = { matchMedia: mq(wide) };
  const { default: Settings } = await import('../../components/Settings.jsx');
  return renderToStaticMarkup(<Settings sync={{ token: null }} txns={[]} onToast={() => {}} />);
}
beforeEach(() => { delete globalThis.window; });

describe('Settings', () => {
  it('phone: a list of sections, no section open', async () => {
    const out = await render(false);
    for (const t of ['Sync', 'This device', 'Categories', 'Learned rules']) expect(out).toContain(t);
    expect(out).not.toContain('Data repo');
  });
  it('desktop: list on the left and Sync open', async () => {
    const out = await render(true);
    expect(out).toContain('settings-layout');
    expect(out).toContain('Sync between devices');
  });
});
