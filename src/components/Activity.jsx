// Activity: every transaction, grouped by day, with search and filters (M2.5b step 4, Ken 24 Oct 2026).
// Desktop: filters always open on the left, list on the right. Phone: search box + a Filters button that
// opens the same filters in a sheet. The totals line shows how many match, money in and money out (S2).
import { useEffect, useMemo, useState } from 'react';
import { resortReview } from '../lib/store.js';
import { longDay, relativeDay } from '../lib/dates.js';
import { formatCents } from '../lib/money.js';
import { groupByDay } from '../lib/daygroups.js';
import {
  EMPTY_FILTER, RANGES, TYPES, filterTxns, totals, categoryCounts, activeChips, removeChip, dollarsToCents,
} from '../lib/activity.js';
import { ImportButton, TypedSwitch } from './ui.jsx';
import { CategoryIcon } from './icons.jsx';
import TxnRow from './TxnRow.jsx';

const PAGE = 30;
const CATS_SHOWN = 8;

function FilterPanel({ f, set, minText, maxText, setMinText, setMaxText, cats, reviewCount, withSearch }) {
  const [allCats, setAllCats] = useState(false);
  const toggle = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const shownCats = allCats ? cats : cats.filter((c, i) => i < CATS_SHOWN || f.cats.includes(c.id));
  return (
    <div className="filters">
      {withSearch && (
        <input className="input search" type="search" placeholder="Search merchant, amount or category"
          aria-label="Search transactions" value={f.q} onChange={(e) => set({ ...f, q: e.target.value })} />
      )}

      <div className="fgroup">
        <label className="fhead" htmlFor={`range-${withSearch ? 'd' : 'p'}`}>Date range</label>
        <select id={`range-${withSearch ? 'd' : 'p'}`} className="input fselect" value={f.range}
          onChange={(e) => set({ ...f, range: e.target.value })}>
          {RANGES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        {f.range === 'custom' && (
          <div className="frow2">
            <label>From<input className="input" type="date" value={f.from} max={f.to || undefined}
              onChange={(e) => set({ ...f, from: e.target.value })} /></label>
            <label>To<input className="input" type="date" value={f.to} min={f.from || undefined}
              onChange={(e) => set({ ...f, to: e.target.value })} /></label>
          </div>
        )}
      </div>

      <div className="fgroup">
        <div className="fhead">Type{f.types.length > 0 && <button type="button" onClick={() => set({ ...f, types: [] })}>Clear</button>}</div>
        <div className="fchips">
          {TYPES.map(([k, label, c]) => (
            <button type="button" key={k} className="fchip" aria-pressed={f.types.includes(k)}
              onClick={() => set({ ...f, types: toggle(f.types, k) })}>
              <i className="dot" style={{ background: `var(--${c})` }} />{label}
            </button>
          ))}
        </div>
        <label className="fcheck">
          <input type="checkbox" checked={f.savings || f.types.includes('saving')} disabled={f.types.length > 0 || f.toSort}
            onChange={(e) => set({ ...f, savings: e.target.checked })} />
          <span>Show transfers to and from savings</span>
        </label>
      </div>

      <div className="fgroup">
        <div className="fhead">Category{f.cats.length > 0 && <button type="button" onClick={() => set({ ...f, cats: [] })}>Clear</button>}</div>
        {cats.length === 0 ? <span className="small">No categories yet.</span> : (
          <div className="fcats">
            {shownCats.map((c) => (
              <label key={c.id} className={`fcat${c.count ? '' : ' zero'}`}>
                <input type="checkbox" checked={f.cats.includes(c.id)} onChange={() => set({ ...f, cats: toggle(f.cats, c.id) })} />
                <CategoryIcon id={c.id} size={16} />
                <span className="fcat-name">{c.name}</span>
                <span className="fcat-n">{c.count}</span>
              </label>
            ))}
            {cats.length > CATS_SHOWN && (
              <button type="button" className="flink" onClick={() => setAllCats((v) => !v)}>
                {allCats ? 'Show fewer' : `Show all ${cats.length} categories`}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="fgroup">
        <div className="fhead">Status</div>
        <label className="fcheck sort">
          <input type="checkbox" checked={f.toSort} onChange={(e) => set({ ...f, toSort: e.target.checked })} />
          <span>To sort only</span>
          {reviewCount > 0 && <span className="fbadge">{reviewCount}</span>}
        </label>
        <div className="fswitch-row">
          <span>Typed entries only</span>
          <TypedSwitch on={!!f.typed} onChange={(v) => set({ ...f, typed: v })} label="" />
        </div>
      </div>

      <div className="fgroup">
        <div className="fhead">Amount</div>
        <div className="frow2">
          <label>Min $<input className="input" inputMode="decimal" placeholder="0" value={minText}
            onChange={(e) => setMinText(e.target.value)} /></label>
          <label>Max $<input className="input" inputMode="decimal" placeholder="Any" value={maxText}
            onChange={(e) => setMaxText(e.target.value)} /></label>
        </div>
      </div>
    </div>
  );
}

// preset / presetKey: Home's "N to sort" pill opens Activity with "To sort only" on; the Activity shortcut
// opens it with no filters. A plain tap on the Activity tab keeps whatever filters were on.
export default function Activity({ txns, today, preset, presetKey, onOpen, onToast }) {
  const [base, setBase] = useState(() => (preset === 'review' ? { ...EMPTY_FILTER, toSort: true } : EMPTY_FILTER));
  const [minText, setMinText] = useState('');
  const [maxText, setMaxText] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [sheet, setSheet] = useState(false);
  const [sorting, setSorting] = useState(false);

  useEffect(() => {
    if (presetKey == null) return;
    setBase(preset === 'review' ? { ...EMPTY_FILTER, toSort: true } : EMPTY_FILTER);
    setMinText(''); setMaxText('');
  }, [preset, presetKey]);

  const f = useMemo(() => ({ ...base, min: dollarsToCents(minText), max: dollarsToCents(maxText) }), [base, minText, maxText]);
  const sig = JSON.stringify(f);
  useEffect(() => { setLimit(PAGE); }, [sig]);

  const set = (next) => setBase({ ...next, min: null, max: null });
  const list = useMemo(() => filterTxns(txns, f, today), [txns, f, today]);
  const sum = useMemo(() => totals(list), [list]);
  const cats = useMemo(() => categoryCounts(txns, f, today), [txns, f, today]);
  const chips = activeChips(f);
  const { groups, shown } = useMemo(() => groupByDay(list, limit), [list, limit]);
  const reviewCount = useMemo(() => txns.filter((t) => t.kind === 'review').length, [txns]);
  const left = list.length - shown;
  const next = left > 0 ? groupByDay(list.slice(shown), PAGE).shown : 0;

  const clearAll = () => { setBase(EMPTY_FILTER); setMinText(''); setMaxText(''); };
  const drop = (key) => {
    if (key === 'amount') { setMinText(''); setMaxText(''); return; }
    set(removeChip(f, key));
  };
  async function resort() {
    setSorting(true);
    try {
      const n = await resortReview();
      onToast(n ? `Sorted ${n} with the latest rules` : 'Nothing new to sort. The rest need you.');
    } finally {
      setSorting(false);
    }
  }

  const panelProps = { f, set, minText, maxText, setMinText, setMaxText, cats, reviewCount };
  const filterCount = chips.filter((c) => c.key !== 'q').length;

  return (
    <main className="screen activity">
      <header className="header">
        <div className="title">Activity</div>
        <ImportButton className="btn small-btn" onDone={onToast} />
      </header>

      <div className="mobile-only act-top">
        <input className="input search" type="search" placeholder="Search merchant, amount or category"
          aria-label="Search transactions" value={f.q} onChange={(e) => set({ ...f, q: e.target.value })} />
        <button type="button" className="btn small-btn fbtn" onClick={() => setSheet(true)} aria-haspopup="dialog">
          Filters{filterCount > 0 && <span className="fcount">{filterCount}</span>}
        </button>
      </div>

      <div className="act-grid">
        <aside className="card fpanel desktop-only" aria-label="Filters">
          <FilterPanel {...panelProps} withSearch />
        </aside>

        <section className="act-list" aria-label="Transactions">
          <div className="fapplied">
            {chips.length === 0
              ? <span className="small">No filters. Showing everything except savings transfers.</span>
              : (
                <>
                  {chips.map((c) => (
                    <span key={c.key} className="achip">{c.label}
                      <button type="button" aria-label={`Remove ${c.label}`} onClick={() => drop(c.key)}>
                        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                      </button>
                    </span>
                  ))}
                  <button type="button" className="flink" onClick={clearAll}>Clear all</button>
                </>
              )}
          </div>

          <div className="act-sum" aria-live="polite">
            <div className="act-count">
              <strong>{sum.count}</strong>
              <span className="small">{sum.count === 1 ? 'transaction' : 'transactions'}</span>
            </div>
            <div className="act-io">
              <span><span className="small">In</span><strong className="text-in">{formatCents(sum.inCents)}</strong></span>
              <span><span className="small">Out</span><strong>{formatCents(sum.outCents)}</strong></span>
            </div>
          </div>

          {f.toSort && reviewCount > 0 && (
            <div className="row resort-row">
              <span className="small">Rules only run when you import. Changed or added rules? Re-sort.</span>
              <button type="button" className="btn small-btn" disabled={sorting} onClick={resort}>{sorting ? 'Sorting…' : 'Re-sort with latest rules'}</button>
            </div>
          )}

          {groups.length === 0 && (
            <div className="empty">
              {!txns.length ? 'No transactions yet. Import a NetBank CSV to start.'
                : f.toSort && !chips.some((c) => c.key !== 'toSort') ? 'Nothing to sort. Everything has a category.'
                  : f.typed && !chips.some((c) => c.key !== 'typed') ? 'No typed entries. Everything is matched to the bank.'
                  : (
                    <>No transactions match these filters.<br />
                      <button type="button" className="flink" onClick={clearAll}>Clear all filters</button></>
                  )}
            </div>
          )}

          {groups.map((g) => (
            <section className="card list" key={g.date} aria-label={longDay(g.date)}>
              <div className="day-head">
                <span className="day-date">{longDay(g.date)}{relativeDay(g.date, today) && <span className="day-rel">{relativeDay(g.date, today)}</span>}</span>
                <span className="day-total">{formatCents(g.netCents, { sign: true })}</span>
              </div>
              {g.items.map((t) => <TxnRow key={t.uid} t={t} onOpen={onOpen} />)}
            </section>
          ))}

          {left > 0 && (
            <button type="button" className="btn more-btn" onClick={() => setLimit((n) => n + PAGE)}>
              Show {next} more · {left} left
            </button>
          )}
        </section>
      </div>

      {sheet && (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) setSheet(false); }}>
          <div className="sheet fsheet" role="dialog" aria-label="Filters">
            <div className="sheet-head">
              <strong>Filters</strong>
              <button type="button" className="btn ghost small-btn" onClick={() => setSheet(false)}>Done</button>
            </div>
            <FilterPanel {...panelProps} withSearch={false} />
            <div className="fsheet-foot">
              <button type="button" className="btn small-btn" onClick={clearAll}>Clear all</button>
              <button type="button" className="btn primary" onClick={() => setSheet(false)}>
                Show {sum.count} {sum.count === 1 ? 'result' : 'results'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
