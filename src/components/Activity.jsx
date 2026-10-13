import { useMemo, useState } from 'react';
import { categoryName } from '../lib/categories.js';
import { resortReview } from '../lib/store.js';
import { longDay, shortDay } from '../lib/dates.js';
import { ImportButton } from './ui.jsx';
import TxnRow from './TxnRow.jsx';

export default function Activity({ txns, today, filter, setFilter, onOpen, onToast }) {
  const [q, setQ] = useState('');
  const [showSavings, setShowSavings] = useState(false);
  const [sorting, setSorting] = useState(false);

  async function resort() {
    setSorting(true);
    try {
      const n = await resortReview();
      onToast(n ? `Sorted ${n} with the latest rules` : 'Nothing new to sort. The rest need you.');
    } finally {
      setSorting(false);
    }
  }
  const reviewCount = txns.filter((t) => t.kind === 'review').length;

  const groups = useMemo(() => {
    const qq = q.trim().toUpperCase();
    const list = txns
      .filter((t) => (filter === 'review' ? t.kind === 'review' : true))
      .filter((t) => showSavings || t.kind !== 'saving')
      .filter((t) => !qq ||
        t.description.toUpperCase().includes(qq) ||
        (t.note ?? '').toUpperCase().includes(qq) ||
        (t.categoryId ? categoryName(t.categoryId) : '').toUpperCase().includes(qq))
      .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? 0) - (a.createdAt ?? 0));
    const out = [];
    for (const t of list) {
      const last = out[out.length - 1];
      if (last && last.date === t.date) last.items.push(t);
      else out.push({ date: t.date, items: [t] });
    }
    return out;
  }, [txns, filter, q, showSavings]);

  const dayLabel = (iso) => {
    const s = shortDay(iso, today);
    return s === 'Today' || s === 'Yesterday' ? `${s}, ${longDay(iso)}` : longDay(iso);
  };

  return (
    <main className="screen">
      <header className="header">
        <div className="title">Activity</div>
        <ImportButton className="btn small-btn" onDone={onToast} />
      </header>

      <input className="input search" type="search" placeholder="Search merchant, note or category"
        aria-label="Search transactions" value={q} onChange={(e) => setQ(e.target.value)} />

      <div className="segmented" role="tablist" aria-label="Filter">
        <button type="button" role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All</button>
        <button type="button" role="tab" aria-selected={filter === 'review'} className={filter === 'review' ? 'on' : ''} onClick={() => setFilter('review')}>
          To review{reviewCount ? ` (${reviewCount})` : ''}
        </button>
      </div>

      {filter === 'review' && reviewCount > 0 && (
        <div className="row">
          <span className="small">Rules only run when you import. Changed or added rules? Re-sort.</span>
          <button type="button" className="btn small-btn" disabled={sorting} onClick={resort}>{sorting ? 'Sorting…' : 'Re-sort with latest rules'}</button>
        </div>
      )}

      {filter === 'all' && (
        <label className="toggle-row">
          <input type="checkbox" checked={showSavings} onChange={(e) => setShowSavings(e.target.checked)} />
          <span>Show transfers to and from savings</span>
        </label>
      )}

      {groups.length === 0 && (
        <div className="empty">
          {filter === 'review' ? 'Nothing to review. Everything has a category.' : txns.length ? 'No matches.' : 'No transactions yet. Import a NetBank CSV to start.'}
        </div>
      )}

      {groups.map((g) => (
        <section className="card list" key={g.date} aria-label={longDay(g.date)}>
          <div className="day-head small">{dayLabel(g.date)}</div>
          {g.items.map((t) => <TxnRow key={t.uid} t={t} onOpen={onOpen} />)}
        </section>
      ))}

    </main>
  );
}
