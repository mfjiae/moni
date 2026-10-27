// Detail pages opened from Home's boxes and balance (CommBank-style, simple version for M2.5;
// the full Cash flow pages come in M4).
import { useEffect, useMemo, useState } from 'react';
import { formatCents } from '../lib/money.js';
import { monthKey, monthLabel, monthName, longDay, ordinal, addDays, shiftMonth } from '../lib/dates.js';
import { categoryName, allCategories } from '../lib/categories.js';
import { summarizeMonth, categoryRows, balanceHistory, compareMonths, monthCompare, spentByDay, pctChange } from '../lib/summary.js';
import { currentBalance } from '../lib/importer.js';
import { accountOf, isMain, transferOther, getAccount, accountTxns, accountsWithData, pairTransfers, MAIN } from '../lib/accounts.js';
import { Bar, MonthSwitch, Chevron, Segmented, Sheet, TypedSwitch } from './ui.jsx';
import { CategoryIcon } from './icons.jsx';
import TxnList from './TxnList.jsx';
import { InvestmentsPage, TuitionPage } from './InvestPages.jsx';
import { CashFlowPage, WherePage } from './FlowPages.jsx';
import { MiniBars } from './charts.jsx';
import { PaceChart, DayByDay } from './SpendCharts.jsx';
import { isCash } from '../lib/cash.js';

const byNewest = (a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? 0) - (a.createdAt ?? 0);

function Back({ onBack, label }) {
  return (
    <button type="button" className="btn ghost back" onClick={onBack}>
      <Chevron dir="left" /> {label}
    </button>
  );
}

// Category breakdown with % of total. Tap a category to filter the list below; tap again to clear.
function Breakdown({ title, head, rows, total, color, selected, onSelect, colorFor }) {
  const max = rows.length ? Math.max(...rows.map((r) => r.cents), 1) : 1;
  return (
    <section className="card" aria-label={title}>
      <div className="card-head">
        <span className={`card-title ${head}`}>{title}</span>
        {selected && <button type="button" className="link" onClick={() => onSelect(null)}>Show all</button>}
      </div>
      {rows.length === 0 && <div className="empty small-empty">Nothing this month.</div>}
      {rows.map((r) => (
        <button type="button" key={r.id} aria-pressed={selected === r.id}
          className={`cat-row${selected === r.id ? ' selected' : ''}${selected && selected !== r.id ? ' dim' : ''}`}
          onClick={() => onSelect(selected === r.id ? null : r.id)}>
          <div className="row">
            <span><span className="name">{r.name}</span><span className="pct">{total > 0 ? `${Math.round(r.share * 100)}%` : ''}</span></span>
            <span className="label">{formatCents(r.cents)}</span>
          </div>
          <Bar ratio={r.cents / max} status={colorFor ? colorFor(r.id) : color} label={`${r.name}: ${formatCents(r.cents)}`} />
        </button>
      ))}
    </section>
  );
}

function Hero({ label, cents, cls, children }) {
  return (
    <section className="card detail-head">
      <span className="label">{label}</span>
      <span className={`hero-amount`}><span className={`big ${cls}`}>{formatCents(cents)}</span></span>
      {children}
    </section>
  );
}

// One plain line: "12% more than September (by the 13th)". pick(summary) gives the number to compare;
// better = 'down' (spending) or 'up' (income, saving).
function VsLine({ txns, month, today, pick, better = null }) {
  const c = useMemo(() => compareMonths(txns, month, today), [txns, month, today]);
  const prevName = monthName(c.prev);
  if (!c.hasPrev) return <span className="small">Nothing in {prevName} to compare with yet.</span>;
  const now = pick(c.now);
  const prev = pick(c.prevThrough);
  const by = c.isCurrent ? ` (by the ${ordinal(c.day)})` : '';
  const delta = now - prev;
  const good = better && delta !== 0 && (better === 'down' ? delta < 0 : delta > 0);
  const tone = delta === 0 || !better ? 'label' : good ? 'text-in' : 'text-out';
  if (delta === 0) return <span className="vs label">Same as {prevName}{by}</span>;
  const pct = pctChange(now, prev);
  const amount = formatCents(Math.abs(delta));
  return (
    <span className={`vs ${tone}`}>
      {pct != null && prev > 0 ? `${Math.round(Math.abs(pct) * 100)}%` : amount} {delta > 0 ? 'more' : 'less'} than {prevName}{by}
    </span>
  );
}

const Dot = ({ color }) => <span className="dot" style={{ background: `var(--${color})` }} />;

// Spending's category filter (S-B, Ken 25 Oct 2026): pure, tested. monthList = the month's spending and
// investing rows. Returns chips (categories in the month, biggest first, with counts), the shown list and
// its totals (count, net out: refunds reduce it). typedOnly (UI bundle 2, Ken 26 Oct 2026): only entries you
// typed in by hand (pending or settled manual); the chips keep counting the whole month. cashOnly (Paid with cash,
// Ken 26 Oct 2026): only cash purchases (cash.js); cash entries are typed too, so Typed only still includes them.
export function spendFilter(monthList, sel, typedOnly = false, cashOnly = false) {
  const by = new Map();
  for (const t of monthList) {
    const c = by.get(t.categoryId) ?? { id: t.categoryId, count: 0, cents: 0 };
    c.count++; c.cents += -t.amountCents;
    by.set(t.categoryId, c);
  }
  const chips = [...by.values()].sort((a, b) => b.cents - a.cents || b.count - a.count).map((c) => ({ ...c, name: categoryName(c.id) }));
  const picked = sel.length ? monthList.filter((t) => sel.includes(t.categoryId)) : monthList;
  const list = picked.filter((t) => (!typedOnly || t.source === 'manual') && (!cashOnly || isCash(t)));
  return { chips, list, count: list.length, out: list.reduce((a, t) => a - t.amountCents, 0) };
}

// Desktop shows "Top 6 + more" (Ken, 26 Oct 2026): All, the six biggest, then "+N more" which opens the rest in place.
// A picked category always stays visible. On a phone nothing changes: one scrolling row with every chip (the hiding is desktop-only CSS).
const TOP_CHIPS = 6;
function SpendChips({ chips, total, sel, setSel }) {
  const [open, setOpen] = useState(false);
  const toggle = (id) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  const isExtra = (c, i) => i >= TOP_CHIPS && !sel.includes(c.id);
  const hidden = chips.filter(isExtra).length;
  const canExpand = chips.length > TOP_CHIPS && (open || hidden > 0);
  return (
    <div className="cat-chips-wrap">
      <div className={`cat-chips${open ? ' show-all' : ''}`} role="group" aria-label="Filter by category">
        <button type="button" className={`cat-chip${sel.length ? '' : ' on'}`} aria-pressed={!sel.length} onClick={() => setSel([])}>
          All <span className="n">{total}</span>
        </button>
        {chips.map((c, i) => (
          <button type="button" key={c.id} className={`cat-chip${sel.includes(c.id) ? ' on' : ''}${isExtra(c, i) ? ' extra' : ''}`} aria-pressed={sel.includes(c.id)} onClick={() => toggle(c.id)}>
            {c.name} <span className="n">{c.count}</span>{sel.includes(c.id) && <span aria-hidden="true"> ✓</span>}
          </button>
        ))}
        {canExpand && (
          <button type="button" className="cat-chip cat-more" aria-expanded={open} onClick={() => setOpen((x) => !x)}>
            {open ? 'Show less' : `+${hidden} more`}
          </button>
        )}
      </div>
    </div>
  );
}

// "More filters": every spending category (plus Investing) with this month's count; zero ones dimmed.
function SpendFilterSheet({ chips, sel, setSel, count, onClose }) {
  const counts = new Map(chips.map((c) => [c.id, c.count]));
  const cats = allCategories()
    .filter((c) => (c.type === 'spend' && !c.hidden) || c.id === 'investing' || counts.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, count: counts.get(c.id) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const toggle = (id) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  return (
    <Sheet title="Category" onClose={onClose}>
      <div className="sheet-body">
        {sel.length > 0 && <button type="button" className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setSel([])}>Clear</button>}
        <div className="fcats">
          {cats.map((c) => (
            <label key={c.id} className={`fcat${c.count ? '' : ' zero'}`}>
              <input type="checkbox" checked={sel.includes(c.id)} onChange={() => toggle(c.id)} />
              <CategoryIcon id={c.id} size={16} />
              <span className="fcat-name">{c.name}</span>
              <span className="fcat-n">{c.count}</span>
            </label>
          ))}
        </div>
        <button type="button" className="btn primary" onClick={onClose}>Show {count} {count === 1 ? 'result' : 'results'}</button>
      </div>
    </Sheet>
  );
}

function SpendingPage({ txns, month, today, onOpen, onDetail, initialCategory }) {
  const [noTuition, setNoTuition] = useState('all');
  const [sel, setSel] = useState(initialCategory ? [initialCategory] : []);
  const [typedOnly, setTypedOnly] = useState(false);
  const [cashOnly, setCashOnly] = useState(false);
  const [sheet, setSheet] = useState(false);
  const s = useMemo(() => summarizeMonth(txns, month), [txns, month]);
  const exclude = useMemo(() => (noTuition === 'without' ? ['tuition'] : []), [noTuition]);
  const { total } = categoryRows(s.byCategory, { exclude });
  const tuition = s.byCategory.tuition ?? 0;
  const compare = useMemo(() => monthCompare(txns, month, today, exclude), [txns, month, today, exclude]);
  const byDay = useMemo(() => spentByDay(txns, month, exclude), [txns, month, exclude]);
  const monthList = useMemo(() => txns
    .filter((t) => monthKey(t.date) === month && (t.kind === 'spend' || t.kind === 'investing'))
    .filter((t) => !exclude.includes(t.categoryId))
    .sort(byNewest), [txns, month, exclude]);
  const f = useMemo(() => spendFilter(monthList, sel, typedOnly, cashOnly), [monthList, sel, typedOnly, cashOnly]);
  const prevName = compare ? monthName(compare.prev) : '';
  const hasTuition = useMemo(() => txns.some((t) => t.categoryId === 'tuition' && t.kind === 'spend'), [txns]);
  const title = sel.length === 1 ? categoryName(sel[0]) : 'Transactions';
  // Opened for one category (Home's Where it went): on a phone the list sits far down, so jump to it.
  useEffect(() => {
    if (!initialCategory || typeof window === 'undefined' || window.innerWidth >= 900) return;
    const id = requestAnimationFrame(() => document.querySelector('.detail-grid .txn-box')?.scrollIntoView({ block: 'start' }));
    return () => cancelAnimationFrame(id);
  }, [initialCategory]);

  return (
    <div className="detail-grid">
      <div className="col">
        <Segmented label="Tuition" value={noTuition} onChange={(v) => { setNoTuition(v); if (v === 'without') setSel((x) => x.filter((id) => id !== 'tuition')); }}
          options={[['all', 'Everything'], ['without', 'Without tuition']]} />
        <Hero label={`Everything that left in ${monthLabel(month)}`} cents={total} cls="text-out">
          <VsLine txns={txns} month={month} today={today} better="down"
            pick={(x) => x.outgoings - (exclude.length ? x.byCategory.tuition ?? 0 : 0)} />
          <div className="sub-amounts">
            <span><Dot color="out" />Spending {formatCents(s.spent - (exclude.length ? tuition : 0))}</span>
            <span><Dot color="invest" />Investing {formatCents(s.invested)}</span>
            {tuition !== 0 && !exclude.length && <span>incl. tuition {formatCents(tuition)}</span>}
          </div>
        </Hero>
        <section className="card" aria-label="Spending this month against last month">
          <div className="card-head"><span className="card-title head-out">This month vs {compare ? prevName : 'last month'}</span></div>
          {compare
            ? <PaceChart compare={compare} month={month} prevName={prevName} />
            : <span className="small">Nothing earlier to compare with yet.</span>}
        </section>
        <button type="button" className="card link-card" onClick={() => onDetail('where')}>
          <span className="card-title head-out">Where it went</span>
          <span className="link-text">By category <Chevron /></span>
        </button>
        <DayByDay key={month} txns={txns} month={month} today={today} byDay={byDay} exclude={exclude} />
        {hasTuition && (
          <button type="button" className="card link-card" onClick={() => onDetail('tuition')}>
            <span className="card-title head-out">Tuition</span>
            <span className="link-text">By semester <Chevron /></span>
          </button>
        )}
      </div>
      <TxnList title={title} list={f.list} today={today} onOpen={onOpen}
        empty={cashOnly ? 'No cash entries this month.' : typedOnly ? 'No typed entries. Everything is matched to the bank.' : sel.length ? 'Nothing in these categories this month.' : 'No spending this month.'}
        headSide={monthList.length > 0 && <button type="button" className="link" onClick={() => setSheet(true)}>More filters</button>}
        toolbar={monthList.length > 0 && (
          <>
            <SpendChips chips={f.chips} total={monthList.length} sel={sel} setSel={setSel} />
            <div className="spend-totals">
              <span>{f.count} {f.count === 1 ? 'payment' : 'payments'}
                {sel.length > 0 && <> · <button type="button" className="link" onClick={() => setSel([])}>Clear</button></>}</span>
              <span className="spend-totals-right">
                <span>{formatCents(Math.abs(f.out))} {f.out >= 0 ? 'out' : 'back'}</span>
                <TypedSwitch on={typedOnly} onChange={setTypedOnly} />
                <TypedSwitch on={cashOnly} onChange={setCashOnly} label="Cash only" />
              </span>
            </div>
          </>
        )} />
      {sheet && <SpendFilterSheet chips={f.chips} sel={sel} setSel={setSel} count={f.count} onClose={() => setSheet(false)} />}
    </div>
  );
}

// The last 6 months of one number, ending at the month being looked at.
const miniPoints = (txns, month, pick, n = 6) => Array.from({ length: n }, (_, i) => {
  const key = shiftMonth(month, i - (n - 1));
  return { key, cents: pick(summarizeMonth(txns, key)) };
});

function MiniCard({ txns, month, pick, color, title = 'Last 6 months', head }) {
  const points = useMemo(() => miniPoints(txns, month, pick), [txns, month, pick]);
  return (
    <section className="card" aria-label={title}>
      <div className="card-head"><span className={`card-title ${head}`}>{title}</span></div>
      <MiniBars points={points} color={color} selectedKey={month} />
    </section>
  );
}

function RowsCard({ title, head, rows }) {
  return (
    <section className="card" aria-label={title}>
      <div className="card-head"><span className={`card-title ${head}`}>{title}</span></div>
      {rows.map(([label, value]) => (
        <div className="row stat-row" key={label}><span className="label">{label}</span><span className="strong">{value}</span></div>
      ))}
    </section>
  );
}

function IncomePage({ txns, month, today, onOpen }) {
  const [view, setView] = useState('all');
  const [sel, setSel] = useState(null);
  const s = useMemo(() => summarizeMonth(txns, month), [txns, month]);
  const totals = view === 'job' ? { 'job-income': s.incomeByCategory['job-income'] ?? 0 } : s.incomeByCategory;
  const { total, rows } = categoryRows(totals);
  const list = txns
    .filter((t) => monthKey(t.date) === month && t.kind === 'income')
    .filter((t) => (view !== 'job' || t.categoryId === 'job-income') && (!sel || t.categoryId === sel))
    .sort(byNewest);

  return (
    <div className="detail-grid">
      <div className="col">
        <Segmented label="Income view" value={view} onChange={(v) => { setView(v); setSel(null); }}
          options={[['all', 'All income'], ['job', 'Job income only']]} />
        <Hero label={view === 'job' ? `Job income in ${monthLabel(month)}` : `Money in, ${monthLabel(month)}`} cents={total} cls="text-in">
          <VsLine txns={txns} month={month} today={today} better="up"
            pick={(x) => (view === 'job' ? x.incomeByCategory['job-income'] ?? 0 : x.income)} />
          {view === 'all' && (s.incomeByCategory.family ?? 0) !== 0 && (
            <div className="sub-amounts">
              <span>Job {formatCents(s.incomeByCategory['job-income'] ?? 0)}</span>
              <span>Family support {formatCents(s.incomeByCategory.family ?? 0)}</span>
            </div>
          )}
        </Hero>
        <MiniCard txns={txns} month={month} color="in" head="head-in"
          pick={(x) => (view === 'job' ? x.incomeByCategory['job-income'] ?? 0 : x.income)} />
        <Breakdown title="By category" head="head-in" rows={rows} total={total} color="in" selected={sel} onSelect={setSel} />
      </div>
      <TxnList title={sel ? categoryName(sel) : 'Transactions'} list={list} today={today} onOpen={onOpen}
        empty={view === 'job' ? 'No job income this month.' : 'No money in this month.'} />
    </div>
  );
}

function SavedPage({ txns, month, today, onOpen }) {
  const list = txns.filter((t) => monthKey(t.date) === month && t.kind === 'saving').sort(byNewest);
  const put = list.filter((t) => t.amountCents < 0).reduce((a, t) => a - t.amountCents, 0);
  const took = list.filter((t) => t.amountCents > 0).reduce((a, t) => a + t.amountCents, 0);
  const net = put - took;
  // Net put into each savings account this month (the saver named in the transfer).
  const byAccount = useMemo(() => {
    const m = new Map();
    for (const t of list) {
      const id = isMain(accountOf(t)) ? transferOther(t.description) : accountOf(t);
      if (!id || isMain(id)) continue;
      m.set(id, (m.get(id) ?? 0) - t.amountCents);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [list]);
  return (
    <div className="detail-grid">
      <div className="col">
        <Hero label={net >= 0 ? `Saved in ${monthLabel(month)}` : `Taken from savings in ${monthLabel(month)}`} cents={Math.abs(net)} cls="text-save">
          <VsLine txns={txns} month={month} today={today} better="up" pick={(x) => x.savedNet} />
        </Hero>
        <MiniCard txns={txns} month={month} color="save" head="head-save" pick={(x) => x.savedNet} />
        <RowsCard title="Breakdown" head="head-save" rows={[['Put in', formatCents(put)], ['Took out', formatCents(took)], ['Net', formatCents(net, { sign: true })]]} />
        {byAccount.length > 0 && (
          <RowsCard title="By account" head="head-save" rows={byAccount.map(([id, c]) => [getAccount(id).long, formatCents(c, { sign: true })])} />
        )}
        <p className="hint">Transfers between your own accounts, counted once each (from the Smart Access side when both CSVs are in). They're never income or spending. Savings interest shows under Money in.</p>
      </div>
      <TxnList title="Transfers" list={list} today={today} onOpen={onOpen} empty="No savings transfers this month." />
    </div>
  );
}

// ---------- Account page: balance over time + every transaction ----------

const dayNum = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
const shortMonth = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', { month: 'short', year: '2-digit', timeZone: 'UTC' });

function BalanceChart({ points }) {
  const [hover, setHover] = useState(null);
  const W = 600, H = 190, PAD = 8, TOP = 34;
  if (points.length < 2) return <div className="empty small-empty">Not enough history for a chart yet.</div>;
  const x0 = dayNum(points[0].date), x1 = dayNum(points[points.length - 1].date);
  const vals = points.map((p) => p.cents);
  const lo = Math.min(0, ...vals), hi = Math.max(...vals);
  const X = (d) => PAD + ((dayNum(d) - x0) / Math.max(x1 - x0, 1)) * (W - PAD * 2);
  const Y = (c) => TOP + (1 - (c - lo) / Math.max(hi - lo, 1)) * (H - TOP - PAD);
  // Step line: the balance holds until the next day with a change
  let d = `M${X(points[0].date)},${Y(points[0].cents)}`;
  for (let i = 1; i < points.length; i++) d += `H${X(points[i].date)}V${Y(points[i].cents)}`;
  const area = `${d}V${Y(lo)}H${X(points[0].date)}Z`;
  const shown = hover ?? points[points.length - 1];

  function onMove(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const fx = ((e.clientX - r.left) / r.width) * W;
    const day = x0 + ((fx - PAD) / (W - PAD * 2)) * (x1 - x0);
    let best = points[0];
    for (const p of points) if (dayNum(p.date) <= day) best = p;
    setHover(best);
  }

  return (
    <div className="chart" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
      <div className="readout"><span>{longDay(shown.date)}</span><strong>{formatCents(shown.cents)}</strong></div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Balance from ${longDay(points[0].date)} to ${longDay(points[points.length - 1].date)}, highest ${formatCents(hi)}`}>
        <defs>
          <linearGradient id="balfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--balance)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--balance)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {lo < 0 && <line x1={PAD} x2={W - PAD} y1={Y(0)} y2={Y(0)} stroke="var(--over)" strokeDasharray="4 4" strokeWidth="1" />}
        <path d={area} fill="url(#balfill)" />
        <path d={d} fill="none" stroke="var(--balance)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <circle cx={X(shown.date)} cy={Y(shown.cents)} r="5" fill="var(--bg)" stroke="var(--balance)" strokeWidth="2.5" />
      </svg>
      <div className="axis"><span>{shortMonth(points[0].date)}</span><span>High {formatCents(hi)}</span><span>{shortMonth(points[points.length - 1].date)}</span></div>
    </div>
  );
}

// One page for every account (M2.6, option A): chips on top switch account and never move. Each account
// shows its own statement: balance, balance chart and every row (a saver's matched transfers included).
function AccountPage({ est, allTxns, balance, saverBalances, today, onOpen, initialAccount }) {
  const accounts = useMemo(() => accountsWithData(allTxns), [allTxns]);
  const [acct, setAcct] = useState(initialAccount ?? MAIN);
  const main = isMain(acct);
  const info = getAccount(acct);
  const txns = useMemo(() => accountTxns(allTxns, acct), [allTxns, acct]);
  const bankBal = main ? balance : saverBalances?.[acct] ?? null;
  const matched = useMemo(() => (main ? null : pairTransfers(allTxns)), [allTxns, main]);
  const metaFor = matched ? (t) => (matched.has(t.uid) ? 'matched' : transferOther(t.description) ? 'counted here' : undefined) : undefined;
  return (
    <>
      {accounts.length > 1 && (
        <div className="acct-chips" role="group" aria-label="Account">
          {accounts.map((a) => (
            <button key={a.id} type="button" className="acct-chip" aria-pressed={a.id === acct} onClick={() => setAcct(a.id)}>{a.name}</button>
          ))}
        </div>
      )}
      <AccountBody key={acct} txns={txns} bankBal={bankBal} est={main ? est?.main : est?.savers?.[acct]} main={main} info={info} today={today} onOpen={onOpen} metaFor={metaFor} />
    </>
  );
}

function AccountBody({ txns, bankBal: balance, est, main, info, today, onOpen, metaFor }) {
  const [range, setRange] = useState('1y');
  const bal = est ? est.cents : main ? currentBalance(balance, txns) : balance?.cents ?? null;
  const since = est
    ? [est.typed && `${est.typed} typed`, est.other && `${est.other} from the other account's CSV`].filter(Boolean).join(', ')
    : 'manual entries';
  const history = useMemo(() => balanceHistory(txns), [txns]);
  const cutoff = useMemo(() => {
    if (range === 'all' || !history.length) return '';
    const last = history[history.length - 1].date;
    if (range === '1w') return addDays(last, -7);
    const [y, m, d] = last.split('-').map(Number);
    const back = range === '1m' ? 1 : range === '3m' ? 3 : range === '6m' ? 6 : 12;
    const dt = new Date(Date.UTC(y, m - 1 - back, d));
    return dt.toISOString().slice(0, 10);
  }, [range, history]);
  const points = useMemo(() => {
    const inside = history.filter((p) => p.date >= cutoff);
    // Start the line on the first day of the range at the balance held coming in
    const before = history.filter((p) => p.date < cutoff).pop();
    return before && inside.length && inside[0].date > cutoff ? [{ date: cutoff, cents: before.cents }, ...inside] : inside;
  }, [history, cutoff]);
  const list = useMemo(() => [...txns].sort(byNewest), [txns]);

  return (
    <div className="detail-grid">
      <div className="col">
        <Hero label={`${info.long} balance`} cents={bal ?? 0} cls={main ? '' : 'text-save'}>
          {balance && (
            <div className="sub-amounts">
              <span>Bank {formatCents(balance.cents)} on {longDay(balance.asOf)}</span>
              {bal !== balance.cents && <span>Since then {formatCents(bal - balance.cents, { sign: true })} ({since})</span>}
            </div>
          )}
        </Hero>
        <section className="card" aria-label="Balance over time">
          <div className="card-head">
            <span className="card-title head-balance">Balance over time</span>
          </div>
          <BalanceChart points={points} />
          <div className="segmented" role="tablist" aria-label="Range">
            {[['1w', '1W'], ['1m', '1M'], ['3m', '3M'], ['6m', '6M'], ['1y', '1Y'], ['all', 'All']].map(([v, t]) => (
              <button key={v} type="button" role="tab" aria-selected={range === v} className={range === v ? 'on' : ''} onClick={() => setRange(v)}>{t}</button>
            ))}
          </div>
          <p className="hint">From the bank's running balance in your CSV imports. Pending transactions aren't in the export, so the bank app can be slightly ahead.</p>
          {!main && <p className="hint">"Matched" transfers are already counted from the Smart Access side, so they count once. "Counted here" ones have no Smart Access twin yet.</p>}
        </section>
      </div>
      <TxnList title="All transactions" list={list} today={today} onOpen={onOpen} empty="No transactions yet. Import this account's CSV."
        metaFor={metaFor} showAccount={false} />
    </div>
  );
}

const TITLES = { spending: 'Spending', income: 'Money in', saved: 'Saved', invested: 'Investments', tuition: 'Tuition', account: 'Accounts', cashflow: 'Cash flow', where: 'Where it went' };

export default function Detail({ page, txns, allTxns, today, month, setMonth, firstMonth, balance, saverBalances, est, onBack, onOpen, onDetail, etfs = [], rootLabel = 'Home' }) {
  const current = monthKey(today);
  const props = { txns, month, today, onOpen };
  return (
    <main className="screen">
      <header className="detail-top">
        <Back onBack={onBack} label={page.from ? TITLES[page.from.name] : rootLabel} />
        <div className="header">
          <div className="title">{TITLES[page.name]}</div>
          {!['account', 'invested', 'tuition'].includes(page.name) && (
            <MonthSwitch month={month} setMonth={setMonth} current={current} first={firstMonth} />
          )}
        </div>
      </header>
      {page.name === 'spending' && <SpendingPage key={page.category ?? 'all'} {...props} onDetail={onDetail} initialCategory={page.category} />}
      {page.name === 'income' && <IncomePage {...props} />}
      {page.name === 'saved' && <SavedPage {...props} />}
      {page.name === 'invested' && <InvestmentsPage txns={txns} today={today} onOpen={onOpen} etfs={etfs} />}
      {page.name === 'tuition' && <TuitionPage txns={txns} today={today} onOpen={onOpen} />}
      {page.name === 'cashflow' && <CashFlowPage {...props} onDetail={onDetail} />}
      {page.name === 'where' && <WherePage {...props} onDetail={onDetail} />}
      {page.name === 'account' && (
        <AccountPage allTxns={allTxns ?? txns} balance={balance} saverBalances={saverBalances} est={est} today={today} onOpen={onOpen} initialAccount={page.account} />
      )}
    </main>
  );
}
