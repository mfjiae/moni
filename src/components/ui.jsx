// Small shared pieces.
import { useEffect, useMemo, useRef, useState } from 'react';
import { pickerGroups, getCategory, categoryName } from '../lib/categories.js';
import { importCsvText, addCategory } from '../lib/store.js';
import { monthLabel, shiftMonth, monthShort } from '../lib/dates.js';
import { Icon } from './icons.jsx';

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

const pct = (x) => `${(Math.min(Math.max(x, 0), 1) * 100).toFixed(1)}%`;

// status: ok | near | over (budgets) or a money color: in | out | save | invest
export function Bar({ ratio, status = 'ok', pace, thick = false, label }) {
  return (
    <div className={`bar${thick ? ' thick' : ''}`} role="img" aria-label={label}>
      <div className={`fill ${status}`} style={{ width: pct(ratio) }} />
      {pace != null && <div className="pace" style={{ left: pct(pace) }} />}
    </div>
  );
}

export const Chevron = ({ dir = 'right', size = 18 }) => (
  <svg aria-hidden="true" className="chev" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={dir === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
  </svg>
);

// Month picker: a year with a 12-month grid. Never before the first month with data, never after
// this month. "This month" lives in here so nothing on the page moves when you change month.
export function MonthPicker({ month, setMonth, current, first, onClose }) {
  const min = first && first < current ? first : current;
  const [year, setYear] = useState(Number(month.slice(0, 4)));
  const minYear = Number(min.slice(0, 4));
  const maxYear = Number(current.slice(0, 4));
  const pick = (key) => { setMonth(key); onClose(); };
  return (
    <Sheet title="Choose a month" onClose={onClose}>
      <div className="sheet-body">
        <div className="year-row">
          <button type="button" className="icon-btn" aria-label="Previous year" disabled={year <= minYear}
            onClick={() => setYear(year - 1)}><Chevron dir="left" /></button>
          <span className="year" aria-live="polite">{year}</span>
          <button type="button" className="icon-btn" aria-label="Next year" disabled={year >= maxYear}
            onClick={() => setYear(year + 1)}><Chevron /></button>
        </div>
        <div className="month-grid" role="group" aria-label={`Months of ${year}`}>
          {Array.from({ length: 12 }, (_, i) => {
            const key = `${year}-${String(i + 1).padStart(2, '0')}`;
            const off = key < min || key > current;
            return (
              <button type="button" key={key} disabled={off} aria-pressed={key === month}
                className={`month-cell${key === month ? ' on' : ''}${key === current ? ' now' : ''}`}
                onClick={() => pick(key)}>{monthShort(key)}</button>
            );
          })}
        </div>
        <button type="button" className="btn" onClick={() => pick(current)}>This month</button>
      </div>
    </Sheet>
  );
}

// Home: one pill with arrows either side of the month name. The arrows stay in fixed places
// (the name has a minimum width) and tapping the name opens the month picker.
export function MonthDropdown(props) {
  const { month, setMonth, current, first } = props;
  const min = first && first < current ? first : current;
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="month-pill">
        <button type="button" className="icon-btn" aria-label="Previous month" disabled={month <= min}
          onClick={() => setMonth(shiftMonth(month, -1))}><Chevron dir="left" /></button>
        <button type="button" className="month-drop" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
          <span className="month-drop-label">{monthLabel(month)}</span><Icon name="chev-down" size={18} />
        </button>
        <button type="button" className="icon-btn" aria-label="Next month" disabled={month >= current}
          onClick={() => setMonth(shiftMonth(month, 1))}><Chevron /></button>
      </div>
      {open && <MonthPicker {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

// Other pages: arrows stay in fixed places; tap the month name to jump to any month.
export function MonthSwitch({ month, setMonth, current, first }) {
  const min = first && first < current ? first : current;
  const [open, setOpen] = useState(false);
  return (
    <div className="month-wrap">
      <div className="month-switch">
        <button type="button" className="icon-btn" aria-label="Previous month" disabled={month <= min}
          onClick={() => setMonth(shiftMonth(month, -1))}><Chevron dir="left" /></button>
        <button type="button" className="month month-btn" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
          {monthLabel(month)}
        </button>
        <button type="button" className="icon-btn" aria-label="Next month" disabled={month >= current}
          onClick={() => setMonth(shiftMonth(month, 1))}><Chevron /></button>
      </div>
      {open && <MonthPicker month={month} setMonth={setMonth} current={current} first={first} onClose={() => setOpen(false)} />}
    </div>
  );
}

// Category dropdown: most-used first, then everything grouped, with search.
// Typing a name that doesn't exist offers to add it (synced to your other devices).
export function CategorySelect({ value, onChange, amountCents, usage = {}, onToast, startOpen = false }) {
  const [open, setOpen] = useState(startOpen);
  const [q, setQ] = useState('');
  const search = useRef(null);
  const { most, groups } = useMemo(() => pickerGroups(amountCents, usage), [amountCents, usage]);

  useEffect(() => { if (open) search.current?.focus({ preventScroll: true }); }, [open]);

  const qq = q.trim().toLowerCase();
  const match = (c) => !qq || c.name.toLowerCase().includes(qq);
  const shownGroups = groups.map((g) => ({ ...g, items: g.items.filter(match) })).filter((g) => g.items.length);
  const exact = groups.some((g) => g.items.some((c) => c.name.toLowerCase() === qq));

  const pick = (id) => { onChange(id); setOpen(false); setQ(''); };
  async function add(type) {
    try {
      const id = await addCategory(q, type);
      pick(id);
      onToast?.(`Added category ${q.trim()}`);
    } catch (e) {
      onToast?.(e.message);
    }
  }

  const current = value ? getCategory(value) : null;
  const option = (c, key = c.id) => (
    <button type="button" key={key} className={`cat-option${c.id === value ? ' selected' : ''}`} onClick={() => pick(c.id)}>
      <span>{c.name}</span>{c.id === value && <span aria-hidden="true">✓</span>}
    </button>
  );

  return (
    <div className="cat-select">
      <button type="button" className={`cat-button${current ? '' : ' empty-choice'}`} aria-expanded={open}
        onClick={() => setOpen(!open)}>
        <span>{current ? categoryName(value) : 'Pick a category'}</span>
        <Chevron dir="right" />
      </button>
      {open && (
        <div className="cat-panel" role="listbox" aria-label="Categories">
          <input ref={search} className="input" type="search" placeholder="Search or add a category" value={q}
            aria-label="Search categories" onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const first = shownGroups[0]?.items[0];
                if (first) pick(first.id);
              } else if (e.key === 'Escape') setOpen(false);
            }} />
          {!qq && most.length > 0 && (
            <>
              <div className="cat-group">Most used</div>
              {most.map((c) => option(c, `m-${c.id}`))}
            </>
          )}
          {shownGroups.map((g) => (
            <div key={g.type} style={{ display: 'contents' }}>
              <div className="cat-group">{g.label}</div>
              {g.items.map((c) => option(c))}
            </div>
          ))}
          {qq && !exact && (
            <div className="cat-add">
              <span className="small" style={{ width: '100%' }}>Add “{q.trim()}” as a new category:</span>
              <button type="button" className="btn small-btn" onClick={() => add('spend')}>Spending</button>
              <button type="button" className="btn small-btn" onClick={() => add('income')}>Income</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// How often each category is used, for "Most used".
export function useCategoryUsage(txns) {
  return useMemo(() => {
    const u = {};
    for (const t of txns ?? []) if (t.categoryId && t.kind !== 'review') u[t.categoryId] = (u[t.categoryId] ?? 0) + 1;
    return u;
  }, [txns]);
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
          <span className="card-title plain">{title}</span>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="tab" aria-selected={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}
