// Quick sort overlay (Ken, 27 Oct 2026, batch 3, UI locked option A). Opens from the "Quick sort" button on
// Activity's To sort list. One To sort row at a time, newest first: tap a category and it moves on.
// Phone: full screen. Desktop: a centered card over dimmed Activity. x, Escape or the back gesture closes it.
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCents } from '../lib/money.js';
import { longDay } from '../lib/dates.js';
import { sortQueue, nextIndex, quickChips, rememberKeyword } from '../lib/quicksort.js';
import { quickSortCategory, quickSortAtm, undoQuickSort } from '../lib/store.js';
import { displayName } from './TxnRow.jsx';

export default function QuickSort({ txns, usage, onClose, onOpen }) {
  const [queue] = useState(() => sortQueue(txns));
  const [idx, setIdx] = useState(0);
  const [history, setHistory] = useState([]);
  const [remember, setRemember] = useState(true);
  const [showMore, setShowMore] = useState(false);
  const [sorted, setSorted] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const card = useRef(null);

  const byUid = useMemo(() => new Map(txns.map((t) => [t.uid, t])), [txns]);
  const at = nextIndex(queue, byUid, idx);
  const t = at >= 0 ? byUid.get(queue[at]) : null;
  const total = queue.length;
  const keyword = t ? rememberKeyword(t) : '';
  const canRemember = !!keyword;
  const chips = useMemo(() => (t ? quickChips(t.amountCents, usage) : null), [t, usage]);

  // The back gesture closes the overlay (like the detail pages); Escape too.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    window.history.pushState({ moni: 'quicksort' }, '');
    const onPop = () => closeRef.current();
    const onKey = (e) => { if (e.key === 'Escape') window.history.back(); };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('popstate', onPop); window.removeEventListener('keydown', onKey); };
  }, []);
  const close = () => window.history.back();
  useEffect(() => { card.current?.focus({ preventScroll: true }); }, []);

  async function run(fn, label, kind) {
    if (busy || !t) return;
    setBusy(true);
    try {
      const { n, undo } = await fn();
      setHistory((h) => [...h, { at, undo, kind, n }]);
      if (kind === 'skip') setSkipped((k) => k + 1); else setSorted((k) => k + 1 + n);
      setMsg(`${label}${n ? `. ${n} more like it also sorted.` : '.'}`);
      setIdx(at + 1);
      setShowMore(false);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }
  const pick = (c) => run(
    () => quickSortCategory(t.uid, c.id, { remember: remember && canRemember, keyword }),
    `Sorted ${displayName(t)} as ${c.name}`, 'sort',
  );
  const answer = (yes) => run(
    () => quickSortAtm(t.uid, yes, { remember: remember && canRemember, keyword }),
    yes ? 'Filed as an ATM withdrawal' : 'Kept in To sort', yes ? 'sort' : 'skip',
  );
  const skip = () => {
    if (!t) return;
    setHistory((h) => [...h, { at, kind: 'skip', n: 0 }]);
    setSkipped((s) => s + 1);
    setMsg('Skipped. It stays in To sort.');
    setIdx(at + 1);
    setShowMore(false);
  };
  async function undo() {
    const last = history[history.length - 1];
    if (!last || busy) return;
    setBusy(true);
    try {
      if (last.undo) await undoQuickSort(last.undo);
      if (last.kind === 'skip') setSkipped((k) => Math.max(0, k - 1)); else setSorted((k) => Math.max(0, k - 1 - last.n));
      setHistory((h) => h.slice(0, -1));
      setIdx(last.at);
      setMsg('Undone.');
      setShowMore(false);
    } finally {
      setBusy(false);
    }
  }

  const shown = Math.min(at >= 0 ? at + 1 : total, total);
  const out = t ? t.amountCents < 0 : true;
  return (
    <div className="qs-overlay" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="qs-card" role="dialog" aria-modal="true" aria-label="Quick sort" tabIndex={-1} ref={card}>
        <div className="qs-head">
          <span className="card-title plain">Quick sort</span>
          <span className="qs-count" aria-live="polite">{t ? `${shown} of ${total}` : 'Done'}</span>
          <button type="button" className="icon-btn" aria-label="Close quick sort" onClick={close}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div className="qs-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={t ? at : total}>
          <i style={{ width: `${total ? Math.round(((t ? at : total) / total) * 100) : 100}%` }} />
        </div>

        {t ? (
          <>
            <div className="qs-date">{longDay(t.date)}</div>
            <div className="qs-name">{displayName(t)}</div>
            <div className={`qs-amount${t.amountCents > 0 ? ' text-in' : ' text-out'}`}>{formatCents(t.amountCents, { sign: true })}</div>

            {t.atmAsk ? (
              <div className="atm-ask">
                <span className="cash-q">Was this a cash withdrawal?</span>
                <div className="atm-opts">
                  <button type="button" className="btn primary" disabled={busy} onClick={() => answer(true)}>Yes, ATM cash</button>
                  <button type="button" className="btn ghost" disabled={busy} onClick={() => answer(false)}>No, sort it myself</button>
                </div>
              </div>
            ) : (
              <>
                <div className="qs-label">{out ? 'Spending' : 'Money in'} · most used first</div>
                <div className="qs-chips">
                  {chips.top.map((c) => (
                    <button type="button" key={c.id} className="qs-chip" disabled={busy} onClick={() => pick(c)}>{c.name}</button>
                  ))}
                  {!showMore && chips.more.length > 0 && (
                    <button type="button" className="qs-chip qs-more" onClick={() => setShowMore(true)}>More…</button>
                  )}
                  {showMore && chips.more.map((c) => (
                    <button type="button" key={c.id} className="qs-chip" disabled={busy} onClick={() => pick(c)}>{c.name}</button>
                  ))}
                </div>
              </>
            )}

            <div className="cash-row qs-remember">
              <span className="cash-row-text">
                <span>Remember for similar rows</span>
                <span className="small">{canRemember ? `Rows with “${keyword}”` : 'Not for this one: the bank text is too general or it is a payment to a person.'}</span>
              </span>
              <button type="button" role="switch" aria-checked={remember && canRemember} aria-label="Remember for similar rows" className="cash-sw"
                disabled={!canRemember} onClick={() => setRemember(!remember)} />
            </div>

            <div className="qs-actions">
              <button type="button" className="btn ghost small-btn" onClick={skip} disabled={busy}>Skip</button>
              <button type="button" className="btn ghost small-btn" onClick={undo} disabled={busy || history.length === 0}>Undo</button>
              <button type="button" className="link qs-details" onClick={() => onOpen(t.uid)}>Open details</button>
            </div>
          </>
        ) : (
          <div className="qs-done">
            <div className="qs-name">{sorted + skipped === 0 && total === 0 ? 'Nothing to sort' : 'All sorted'}</div>
            <p className="small">{sorted} sorted{skipped ? `, ${skipped} skipped (still in To sort)` : ''}.</p>
            <div className="qs-actions">
              <button type="button" className="btn primary small-btn" onClick={close}>Close</button>
              <button type="button" className="btn ghost small-btn" onClick={undo} disabled={busy || history.length === 0}>Undo last</button>
            </div>
          </div>
        )}
        <div className="qs-msg" role="status">{msg}</div>
      </div>
    </div>
  );
}
