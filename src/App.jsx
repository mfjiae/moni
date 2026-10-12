import { useEffect, useMemo, useState } from 'react';
import { formatCents } from './lib/money.js';
import { monthKey, monthLabel, monthPace, shortDay } from './lib/dates.js';
import { categoryById } from './lib/categories.js';
import { summarizeMonth, budgetRows, leftToSpend, budgetStatus } from './lib/summary.js';
import { SAMPLE_TODAY, SAMPLE_BUDGETS, SAMPLE_TXNS } from './lib/sample.js';
import { requestPersistentStorage } from './lib/db.js';

const pct = (x) => `${(Math.min(Math.max(x, 0), 1) * 100).toFixed(1)}%`;

function PaceBar({ ratio, status = 'ok', pace, thick = false }) {
  return (
    <div className={`bar${thick ? ' thick' : ''}`} role="img"
      aria-label={`${Math.round(ratio * 100)}% used, ${Math.round(pace * 100)}% of the month gone`}>
      <div className={`fill ${status}`} style={{ width: pct(ratio) }} />
      <div className="pace" style={{ left: pct(pace) }} />
    </div>
  );
}

function Home({ today, txns, budgets, onNavigate }) {
  const key = monthKey(today);
  const pace = monthPace(today);
  const [, , dayStr] = today.split('-');
  const summary = useMemo(() => summarizeMonth(txns, key), [txns, key]);
  const rows = useMemo(() => budgetRows(summary, budgets), [summary, budgets]);
  const totals = leftToSpend(rows);
  const topRows = [...rows].sort((a, b) => b.ratio - a.ratio).slice(0, 4);
  const recent = [...txns].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const daysInMonth = Math.round(Number(dayStr) / pace);

  return (
    <main className="screen">
      <header className="header">
        <div>
          <div className="month">{monthLabel(key)}</div>
          <div className="title">moni</div>
        </div>
      </header>

      <div className="banner">Sample data. Importing your NetBank CSV comes in the next update.</div>

      <section className="card" aria-label="Left to spend">
        <span className="label">Left to spend this month</span>
        <div className="hero-amount">
          <span className={`big${totals.left < 0 ? ' text-over' : ''}`}>{formatCents(totals.left)}</span>
          <span className="label">of {formatCents(totals.total)}</span>
        </div>
        <PaceBar thick ratio={totals.total ? totals.spent / totals.total : 0}
          status={budgetStatus(totals.total ? totals.spent / totals.total : 0)} pace={pace} />
        <div className="row label">
          <span>{formatCents(totals.spent)} spent</span>
          <span>Day {Number(dayStr)} of {daysInMonth}</span>
        </div>
      </section>

      <section className="card" aria-label="Cash flow">
        <div className="card-head">
          <span className="card-title">Cash flow</span>
          <button className="link" onClick={() => onNavigate('cashflow')}>Details</button>
        </div>
        <div className="tiles">
          <div className="tile"><span className="small">Money in</span><span className="value text-good">{formatCents(summary.income)}</span></div>
          <div className="tile"><span className="small">Money out</span><span className="value">{formatCents(summary.spent)}</span></div>
        </div>
        <div className="row label">
          <span>Net <span style={{ color: 'var(--text)', fontWeight: 500 }}>{formatCents(summary.net, { sign: true })}</span></span>
          <span>Saved {formatCents(summary.savedNet)}</span>
        </div>
      </section>

      <section className="card" aria-label="Budgets">
        <div className="card-head">
          <span className="card-title">Budgets</span>
          <button className="link" onClick={() => onNavigate('budgets')}>All budgets</button>
        </div>
        {topRows.map((r) => {
          const status = budgetStatus(r.ratio);
          return (
            <div className="budget" key={r.categoryId}>
              <div className="row">
                <span className="name">{r.name}</span>
                <span className={`label ${status === 'over' ? 'text-over' : status === 'near' ? 'text-near' : ''}`}>
                  {r.left < 0 ? `${formatCents(-r.left)} over` : `${formatCents(r.left)} left`}
                </span>
              </div>
              <PaceBar ratio={r.ratio} status={status} pace={pace} />
              <span className="small">{formatCents(r.spent)} of {formatCents(r.limitCents)}</span>
            </div>
          );
        })}
        <div className="legend small"><span className="tick" />Where you should be by today</div>
      </section>

      <section className="card list" aria-label="Recent transactions">
        <div className="card-head">
          <span className="card-title">Recent</span>
          <button className="link" onClick={() => onNavigate('activity')}>See all</button>
        </div>
        {recent.map((t, i) => (
          <div className="txn" key={i}>
            <div>
              <span className="merchant">{t.description}</span>
              <span className="small">{categoryById[t.categoryId]?.name ?? 'To review'} · {shortDay(t.date, today)}</span>
            </div>
            <span className={`amount${t.amountCents > 0 ? ' text-good' : ''}`}>{formatCents(t.amountCents, { sign: true })}</span>
          </div>
        ))}
      </section>
    </main>
  );
}

function Placeholder({ title, milestone }) {
  return (
    <main className="screen">
      <header className="header"><div className="title">{title}</div></header>
      <div className="empty">Coming in {milestone}.</div>
    </main>
  );
}

const Icon = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  budgets: <path d="M4 7h16M4 12h10M4 17h6" />,
  cashflow: <path d="M6 20V10M12 20V4M18 20v-7" />,
  activity: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
};

function NavItem({ id, label, tab, setTab }) {
  return (
    <button className={`nav-item${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}
      aria-current={tab === id ? 'page' : undefined}>
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{Icon[id]}</svg>
      <span>{label}</span>
    </button>
  );
}

export default function App() {
  const [tab, setTab] = useState('home');
  useEffect(() => { requestPersistentStorage(); }, []);

  return (
    <div className="app">
      {tab === 'home' && <Home today={SAMPLE_TODAY} txns={SAMPLE_TXNS} budgets={SAMPLE_BUDGETS} onNavigate={setTab} />}
      {tab === 'budgets' && <Placeholder title="Budgets" milestone="M3" />}
      {tab === 'cashflow' && <Placeholder title="Cash flow" milestone="M4" />}
      {tab === 'activity' && <Placeholder title="Activity" milestone="M2" />}
      {tab === 'add' && <Placeholder title="Add transaction" milestone="M2" />}

      <nav className="nav" aria-label="Main">
        <div className="nav-inner">
          <NavItem id="home" label="Home" tab={tab} setTab={setTab} />
          <NavItem id="budgets" label="Budgets" tab={tab} setTab={setTab} />
          <button className="add-btn" aria-label="Add transaction" onClick={() => setTab('add')}>
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <NavItem id="cashflow" label="Cash flow" tab={tab} setTab={setTab} />
          <NavItem id="activity" label="Activity" tab={tab} setTab={setTab} />
        </div>
      </nav>
    </div>
  );
}
