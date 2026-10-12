import { useMemo } from 'react';
import { formatCents } from '../lib/money.js';
import { monthKey, monthLabel, monthPace, shiftMonth, shortDay, daysInMonth } from '../lib/dates.js';
import { categoryById } from '../lib/categories.js';
import { summarizeMonth } from '../lib/summary.js';
import { currentBalance } from '../lib/importer.js';
import { Bar, ImportButton, useWide } from './ui.jsx';
import TxnRow from './TxnRow.jsx';

function SettingsButton({ onClick }) {
  return (
    <button type="button" className="icon-btn mobile-only" aria-label="Settings" onClick={onClick}>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
    </button>
  );
}

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

export default function Home({ txns, today, month, setMonth, balance, sync, onNavigate, onOpen, onToast }) {
  const wide = useWide();
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
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, wide ? 12 : 5), [txns, month, wide]);

  if (!txns.length) {
    return (
      <main className="screen">
        <header className="header"><div className="title">moni</div><SettingsButton onClick={() => onNavigate('settings')} /></header>
        <section className="card welcome">
          <span className="card-title">Start with your bank history</span>
          <p className="label">Export a CSV from NetBank for your everyday account, then import it here. Everything stays on this device.</p>
          <ImportButton className="btn primary" onDone={onToast} />
          <button type="button" className="btn ghost" onClick={() => onNavigate('add')}>Or add a transaction by hand</button>
          <button type="button" className="btn ghost" onClick={() => onNavigate('settings')}>Already using moni elsewhere? Connect sync</button>
        </section>
      </main>
    );
  }

  return (
    <main className="screen">
      <header className="header">
        <div>
          <MonthSwitch month={month} setMonth={setMonth} current={current} />
          <div className="title home-title">moni</div>
        </div>
        <div className="header-right">
          {bal != null && (
            <div className="balance">
              <span className="small">Balance</span>
              <span className="balance-value">{formatCents(bal)}</span>
            </div>
          )}
          <SettingsButton onClick={() => onNavigate('settings')} />
        </div>
      </header>

      {sync?.lastError && (
        <button type="button" className="banner action" onClick={() => onNavigate('settings')}>
          <span className="text-over">Sync stopped: {sync.lastError.message}</span>
          <span className="link-text">Fix</span>
        </button>
      )}
      {!sync?.token && txns.length > 0 && (
        <button type="button" className="banner action" onClick={() => onNavigate('settings')}>
          <span>Only saved on this device. Turn on sync to see it everywhere.</span>
          <span className="link-text">Set up</span>
        </button>
      )}

      <div className="home-grid">
      <div className="col">
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

      </div>
      <div className="col">
      <section className="card list" aria-label="Recent transactions">
        <div className="card-head">
          <span className="card-title">Recent</span>
          <button type="button" className="link" onClick={() => onNavigate('activity', 'all')}>See all</button>
        </div>
        {recent.length
          ? recent.map((t) => <TxnRow key={t.uid} t={t} meta={shortDay(t.date, today)} onOpen={onOpen} />)
          : <div className="empty small-empty">Nothing in {monthLabel(month)} yet.</div>}
      </section>
      </div>
      </div>
    </main>
  );
}
