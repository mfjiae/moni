import { useMemo } from 'react';
import { formatCents } from '../lib/money.js';
import { monthKey, monthLabel, monthPace, shiftMonth, shortDay, daysInMonth } from '../lib/dates.js';
import { categoryById } from '../lib/categories.js';
import { summarizeMonth } from '../lib/summary.js';
import { currentBalance } from '../lib/importer.js';
import { Bar, ImportButton } from './ui.jsx';
import TxnRow from './TxnRow.jsx';

function MonthSwitch({ month, setMonth, current }) {
  return (
    <div className="month-switch">
      <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
      </button>
      <span className="month">{monthLabel(month)}</span>
      <button type="button" className="icon-btn" aria-label="Next month" disabled={month >= current}
        onClick={() => setMonth(shiftMonth(month, 1))}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
      </button>
    </div>
  );
}

export default function Home({ txns, today, month, setMonth, balance, onNavigate, onOpen, onToast }) {
  const current = monthKey(today);
  const summary = useMemo(() => summarizeMonth(txns, month), [txns, month]);
  const reviewCount = useMemo(() => txns.filter((t) => t.kind === 'review').length, [txns]);
  const bal = useMemo(() => currentBalance(balance, txns), [balance, txns]);

  const isCurrent = month === current;
  const pace = isCurrent ? monthPace(today) : month < current ? 1 : 0;
  const [y, m] = month.split('-').map(Number);
  const dim = daysInMonth(y, m);

  const top = Object.entries(summary.byCategory)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const topMax = top.length ? top[0][1] : 1;

  const recent = useMemo(() => txns
    .filter((t) => monthKey(t.date) === month && t.kind !== 'saving' && t.kind !== 'internal')
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
    .slice(0, 5), [txns, month]);

  if (!txns.length) {
    return (
      <main className="screen">
        <header className="header"><div className="title">moni</div></header>
        <section className="card welcome">
          <span className="card-title">Start with your bank history</span>
          <p className="label">Export a CSV from NetBank for your everyday account, then import it here. Everything stays on this device.</p>
          <ImportButton className="btn primary" onDone={onToast} />
          <button type="button" className="btn ghost" onClick={() => onNavigate('add')}>Or add a transaction by hand</button>
        </section>
      </main>
    );
  }

  return (
    <main className="screen">
      <header className="header">
        <div>
          <MonthSwitch month={month} setMonth={setMonth} current={current} />
          <div className="title">moni</div>
        </div>
        {bal != null && (
          <div className="balance">
            <span className="small">Balance</span>
            <span className="balance-value">{formatCents(bal)}</span>
          </div>
        )}
      </header>

      {reviewCount > 0 && (
        <button type="button" className="banner action" onClick={() => onNavigate('activity', 'review')}>
          <span><strong>{reviewCount}</strong> {reviewCount === 1 ? 'transaction needs' : 'transactions need'} a category</span>
          <span className="link-text">Review</span>
        </button>
      )}

      <section className="card" aria-label="Spent this month">
        <span className="label">Spent {isCurrent ? 'this month' : `in ${monthLabel(month).split(' ')[0]}`}</span>
        <div className="hero-amount">
          <span className="big">{formatCents(summary.spent)}</span>
        </div>
        {isCurrent && (
          <div className="row label">
            <span>Day {Number(today.slice(8))} of {dim}</span>
            <span>Budgets arrive in the next update</span>
          </div>
        )}
      </section>

      <section className="card" aria-label="Cash flow">
        <div className="card-head">
          <span className="card-title">Cash flow</span>
          <button type="button" className="link" onClick={() => onNavigate('cashflow')}>Details</button>
        </div>
        <div className="tiles">
          <div className="tile"><span className="small">Money in</span><span className="value text-good">{formatCents(summary.income)}</span></div>
          <div className="tile"><span className="small">Money out</span><span className="value">{formatCents(summary.spent)}</span></div>
        </div>
        <div className="row label">
          <span>Net <span className="strong">{formatCents(summary.net, { sign: true })}</span></span>
          <span>{summary.savedNet >= 0 ? 'Saved' : 'Took from savings'} {formatCents(Math.abs(summary.savedNet))}</span>
        </div>
      </section>

      {top.length > 0 && (
        <section className="card" aria-label="Top spending">
          <div className="card-head">
            <span className="card-title">Top spending</span>
            <button type="button" className="link" onClick={() => onNavigate('budgets')}>Budgets</button>
          </div>
          {top.map(([id, cents]) => (
            <div className="budget" key={id}>
              <div className="row">
                <span className="name">{categoryById[id]?.name ?? id}</span>
                <span className="label">{formatCents(cents)}</span>
              </div>
              <Bar ratio={cents / topMax} label={`${categoryById[id]?.name}: ${formatCents(cents)}`} />
            </div>
          ))}
          {pace > 0 && pace < 1 && <span className="small">{Math.round(pace * 100)}% of the month gone</span>}
        </section>
      )}

      <section className="card list" aria-label="Recent transactions">
        <div className="card-head">
          <span className="card-title">Recent</span>
          <button type="button" className="link" onClick={() => onNavigate('activity', 'all')}>See all</button>
        </div>
        {recent.length
          ? recent.map((t) => <TxnRow key={t.id} t={t} meta={shortDay(t.date, today)} onOpen={onOpen} />)
          : <div className="empty small-empty">Nothing in {monthLabel(month)} yet.</div>}
      </section>
    </main>
  );
}
