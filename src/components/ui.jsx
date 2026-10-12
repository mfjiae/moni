// Small shared pieces.
import { useEffect, useRef, useState } from 'react';

// True on desktop-width screens (matches the CSS breakpoint).
const WIDE = '(min-width: 900px)';
export function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}
import { pickerCategories } from '../lib/categories.js';
import { importCsvText } from '../lib/store.js';

const pct = (x) => `${(Math.min(Math.max(x, 0), 1) * 100).toFixed(1)}%`;

export function Bar({ ratio, status = 'ok', pace, thick = false, label }) {
  return (
    <div className={`bar${thick ? ' thick' : ''}`} role="img" aria-label={label}>
      <div className={`fill ${status}`} style={{ width: pct(ratio) }} />
      {pace != null && <div className="pace" style={{ left: pct(pace) }} />}
    </div>
  );
}

export function CategoryPicker({ value, onChange, amountCents }) {
  return (
    <div className="chips" role="group" aria-label="Category">
      {pickerCategories(amountCents).map((c) => (
        <button type="button" key={c.id} className={`chip${value === c.id ? ' selected' : ''}`}
          aria-pressed={value === c.id} onClick={() => onChange(c.id)}>
          {c.name}
        </button>
      ))}
    </div>
  );
}

export function ImportButton({ onDone, className = 'btn' }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);

  async function handle(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const r = await importCsvText(await file.text());
      if (!r.rows) {
        onDone('That file had no transactions moni could read. Is it a NetBank CSV export?');
      } else {
        const parts = [`Added ${r.added}`];
        if (r.duplicates) parts.push(`${r.duplicates} already here`);
        if (r.merged) parts.push(`${r.merged} matched your manual entries`);
        if (r.review) parts.push(`${r.review} to review`);
        if (r.errors.length) parts.push(`${r.errors.length} lines couldn't be read`);
        onDone(parts.join(' · '));
      }
    } catch (err) {
      onDone(`Import failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={className} disabled={busy} onClick={() => input.current?.click()}>
        {busy ? 'Importing…' : 'Import NetBank CSV'}
      </button>
      <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={handle} />
    </>
  );
}

export function Sheet({ title, onClose, children }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <span className="card-title">{title}</span>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
