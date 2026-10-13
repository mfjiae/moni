// Detail pages opened from Home's boxes and balance (CommBank-style, simple version for M2.5;
// the full Cash flow pages come in M4).
import { useMemo, useState } from 'react';
import { formatCents } from '../lib/money.js';
import { monthKey, monthLabel, longDay, shortDay } from '../lib/dates.js';
import { categoryName } from '../lib/categories.js';
import { summarizeMonth, categoryRows, balanceHistory } from '../lib/summary.js';
import { currentBalance } from '../lib/importer.js';
import { Bar, MonthSwitch, Chevron } from './ui.jsx';
import TxnRow from './TxnRow.jsx';

const byNewest = (a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? 0) - (a.createdAt ?? 0);

function Back({ onBack }) {
  return (
    <button type="button" className="btn ghost back" onClick={onBack}>
      <Chevron dir="left" /> Home
    </button>
  );
}

function Segmented({ value, onChange, options, label }) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="tab" aria-selected={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}

function TxnList({ title, list, today, onOpen, empty }) {
  const [limit, setLimit] = useState(40);
  return (
    <section className="card list" aria-label={title}>
      <div className="card-head"><span className="card-title">{title}</span><span className="small">{list.length}</span></div>
      {list.length
        ? list.slice(0, limit).map((t) => <TxnRow key={t.uid} t={t} meta={shortDay(t.date, today)} onOpen={onOpen} />)
        : <div className="empty small-empty">{empty}</div>}
      {list.length > limit && (
        <button type="button" className="btn ghost more" onClick={() => setLimit(limit + 60)}>Show more ({list.length - limit} left)</button>
      )}
    </section>
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

const Dot = ({ color }) => <span className="dot" style={{ background: `var(--${color})` }} />;

function SpendingPage({ txns, month, today, onOpen, initialCategory }) {
  const [noTuition, setNoTuition] = useState('all');
  const [sel, setSel] = useState(initialCategory ?? null);
  const s = useMemo(() => summarizeMonth(txns, month), [txns, month]);
  const exclude = noTuition === 'without' ? ['tuition'] : [];
  const { total, rows } = categoryRows(s.byCategory, { exclude });
  const tuition = s.byCategory.tuition ?? 0;
  const list = txns
    .filter((t) => monthKey(t.date) === month && (t.kind === 'spend' || t.kind === 'investing'))
    .filter((t) => !exclude.includes(t.categoryId) && (!sel || t.categoryId === sel))
    .sort(byNewest);

  return (
    <div className="detail-grid">
      <div className="col">
        <Hero label={`Everything that left in ${monthLabel(month)}`} cents={total} cls="text-out">
          <div className="sub-amounts">
            <span><Dot color="out" />Spending {formatCents(s.spent - (exclude.length ? tuition : 0))}</span>
            <span><Dot color="invest" />Investing {formatCents(s.invested)}</span>
            {tuition !== 0 && !exclude.length && <span>incl. tuition {formatCents(tuition)}</span>}
          </div>
        </Hero>
        <Segmented label="Tuition" value={noTuition} onChange={(v) => { setNoTuition(v); if (v === 'without' && sel === 'tuition') setSel(null); }}
          options={[['all', 'Everything'], ['without', 'Without tuition']]} />
        <Breakdown title="By category" head="head-out" rows={rows} total={total} selected={sel} onSelect={setSel}
          colorFor={(id) => (id === 'investing' ? 'invest' : 'out')} />
      </div>
      <TxnList title={sel ? categoryName(sel) : 'Transactions'} list={list} today={today} onOpen={onOpen}
        empty="No spending this month." />
    </div>
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
        <Hero label={view === 'job' ? `Job income in ${monthLabel(month)}` : `Money in, ${monthLabel(month)}`} cents={total} cls="text-in">
          {view === 'all' && (s.incomeByCategory.family ?? 0) !== 0 && (
            <div className="sub-amounts">
              <span>Job {formatCents(s.incomeByCategory['job-income'] ?? 0)}</span>
              <span>Family support {formatCents(s.incomeByCategory.family ?? 0)}</span>
            </div>
          )}
        </Hero>
        <Segmented label="Income view" value={view} onChange={(v) => { setView(v); setSel(null); }}
          options={[['all', 'All income'], ['job', 'Job income only']]} />
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
  return (
    <div className="detail-grid">
      <div className="col">
        <Hero label={net >= 0 ? `Saved in ${monthLabel(month)}` : `Taken from savings in ${monthLabel(month)}`} cents={Math.abs(net)} cls="text-save">
          <div className="sub-amounts">
            <span><Dot color="save" />Put in {formatCents(put)}</span>
            <span>Took out {formatCents(took)}</span>
          </div>
        </Hero>
        <p className="hint">Transfers between your own accounts. They're never counted as income or spending. A box per savings account comes with M2.6.</p>
      </div>
      <TxnList title="Transfers" list={list} today={today} onOpen={onOpen} empty="No savings transfers this month." />
    </div>
  );
}

function InvestedPage({ txns, month, today, onOpen }) {
  const list = txns.filter((t) => monthKey(t.date) === month && t.kind === 'investing').sort(byNewest);
  const total = list.reduce((a, t) => a - t.amountCents, 0);
  const allTime = txns.filter((t) => t.kind === 'investing').reduce((a, t) => a - t.amountCents, 0);
  return (
    <div className="detail-grid">
      <div className="col">
        <Hero label={`Invested in ${monthLabel(month)}`} cents={total} cls="text-invest">
          <div className="sub-amounts"><span><Dot color="invest" />All time {formatCents(allTime)}</span></div>
        </Hero>
        <p className="hint">Betashares and CommSec contributions. The contributions-over-time chart comes with M4.</p>
      </div>
      <TxnList title="Contributions" list={list} today={today} onOpen={onOpen} empty="Nothing invested this month." />
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
            <stop offset="0%" stopColor="var(--in)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--in)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {lo < 0 && <line x1={PAD} x2={W - PAD} y1={Y(0)} y2={Y(0)} stroke="var(--over)" strokeDasharray="4 4" strokeWidth="1" />}
        <path d={area} fill="url(#balfill)" />
        <path d={d} fill="none" stroke="var(--in)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <circle cx={X(shown.date)} cy={Y(shown.cents)} r="5" fill="var(--bg)" stroke="var(--in)" strokeWidth="2.5" />
      </svg>
      <div className="axis"><span>{shortMonth(points[0].date)}</span><span>High {formatCents(hi)}</span><span>{shortMonth(points[points.length - 1].date)}</span></div>
    </div>
  );
}

function AccountPage({ txns, balance, today, onOpen }) {
  const [range, setRange] = useState('1y');
  const bal = currentBalance(balance, txns);
  const history = useMemo(() => balanceHistory(txns), [txns]);
  const cutoff = useMemo(() => {
    if (range === 'all' || !history.length) return '';
    const last = history[history.length - 1].date;
    const [y, m, d] = last.split('-').map(Number);
    const back = range === '3m' ? 3 : 12;
    const dt = new Date(Date.UTC(y, m - 1 - back, d));
    return dt.toISOString().slice(0, 10);
  }, [range, history]);
  const points = history.filter((p) => p.date >= cutoff);
  const list = useMemo(() => [...txns].sort(byNewest), [txns]);

  return (
    <div className="detail-grid">
      <div className="col">
        <Hero label="Smart Access balance" cents={bal ?? 0} cls="">
          {balance && (
            <div className="sub-amounts">
              <span>Bank {formatCents(balance.cents)} on {longDay(balance.asOf)}</span>
              {bal !== balance.cents && <span>Manual entries since {formatCents(bal - balance.cents, { sign: true })}</span>}
            </div>
          )}
        </Hero>
        <section className="card" aria-label="Balance over time">
          <div className="card-head">
            <span className="card-title head-in">Balance over time</span>
          </div>
          <BalanceChart points={points} />
          <div className="segmented" role="tablist" aria-label="Range">
            {[['3m', '3 months'], ['1y', '1 year'], ['all', 'All']].map(([v, t]) => (
              <button key={v} type="button" role="tab" aria-selected={range === v} className={range === v ? 'on' : ''} onClick={() => setRange(v)}>{t}</button>
            ))}
          </div>
          <p className="hint">From the bank's running balance in your CSV imports. Pending transactions aren't in the export, so the bank app can be slightly ahead.</p>
        </section>
      </div>
      <TxnList title="All transactions" list={list} today={today} onOpen={onOpen} empty="No transactions yet." />
    </div>
  );
}

const TITLES = { spending: 'Spending', income: 'Money in', saved: 'Saved', invested: 'Invested', account: 'Smart Access' };

export default function Detail({ page, txns, today, month, setMonth, firstMonth, balance, onBack, onOpen }) {
  const current = monthKey(today);
  const props = { txns, month, today, onOpen };
  return (
    <main className="screen">
      <header className="detail-top">
        <Back onBack={onBack} />
        <div className="header">
          <div className="title">{TITLES[page.name]}</div>
          {page.name !== 'account' && (
            <MonthSwitch month={month} setMonth={setMonth} current={current} first={firstMonth} />
          )}
        </div>
      </header>
      {page.name === 'spending' && <SpendingPage {...props} initialCategory={page.category} />}
      {page.name === 'income' && <IncomePage {...props} />}
      {page.name === 'saved' && <SavedPage {...props} />}
      {page.name === 'invested' && <InvestedPage {...props} />}
      {page.name === 'account' && <AccountPage txns={txns} balance={balance} today={today} onOpen={onOpen} />}
    </main>
  );
}
