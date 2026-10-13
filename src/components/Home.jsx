import { useMemo } from 'react';
import { formatCents } from '../lib/money.js';
import { monthKey, monthLabel, monthPace, shortDay, daysInMonth, longDay } from '../lib/dates.js';
import { categoryName, kindForCategory } from '../lib/categories.js';
import { summarizeMonth } from '../lib/summary.js';
import { currentBalance } from '../lib/importer.js';
import { Bar, ImportButton, MonthSwitch, Chevron, useWide } from './ui.jsx';
import TxnRow from './TxnRow.jsx';

export function SettingsButton({ onClick }) {
  return (
    <button type="button" className="icon-btn mobile-only" aria-label="Settings" onClick={onClick}>
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
    </button>
  );
}

function Box({ kind, label, value, note, onClick }) {
  return (
    <button type="button" className={`box ${kind}`} onClick={onClick}>
      <span className="box-label">{label}<Chevron size={15} /></span>
      <span className="box-value">{value}</span>
      {note && <span className="box-note">{note}</span>}
    </button>
  );
}

export default function Home({ txns, today, month, setMonth, firstMonth, balance, sync, onNavigate, onDetail, onOpen, onToast }) {
  const wide = useWide();
  const current = monthKey(today);
  const summary = useMemo(() => summarizeMonth(txns, month), [txns, month]);
  const reviewCount = useMemo(() => txns.filter((t) => t.kind === 'review').length, [txns]);
  const bal = useMemo(() => currentBalance(balance, txns), [balance, txns]);

  const isCurrent = month === current;
  const pace = isCurrent ? monthPace(today) : null;
  const [y, m] = month.split('-').map(Number);
  const dim = daysInMonth(y, m);
  const monthName = monthLabel(month).split(' ')[0];

  // Home keeps investing out of spending (it has its own box)
  const top = Object.entries(summary.byCategory)
    .filter(([id, c]) => c > 0 && kindForCategory(id) === 'spend')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const topMax = top.length ? top[0][1] : 1;
  const flowMax = Math.max(summary.income, summary.spent, 1);

  const recent = useMemo(() => txns
    .filter((t) => monthKey(t.date) === month && t.kind !== 'saving' && t.kind !== 'internal')
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, wide ? 10 : 5), [txns, month, wide]);

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

  const saved = summary.savedNet;

  return (
    <main className="screen">
      <header className="header">
        <div>
          <MonthSwitch month={month} setMonth={setMonth} current={current} first={firstMonth} />
          <div className="title home-title">moni</div>
        </div>
        <div className="header-right">
          <SettingsButton onClick={() => onNavigate('settings')} />
        </div>
      </header>

      {sync?.lastError && (
        <button type="button" className="banner action" onClick={() => onNavigate('settings')}>
          <span className="text-over">Sync stopped: {sync.lastError.message}</span>
          <span className="link-text">Fix</span>
        </button>
      )}
      {!sync?.token && (
        <button type="button" className="banner action" onClick={() => onNavigate('settings')}>
          <span>Only saved on this device. Turn on sync to see it everywhere.</span>
          <span className="link-text">Set up</span>
        </button>
      )}

      <div className="home-grid">
        <div className="col">
          {bal != null && (
            <button type="button" className="balance-card" onClick={() => onDetail('account')} aria-label={`Balance ${formatCents(bal)}. Open account`}>
              <span>
                <span className="small">Smart Access balance</span>
                <span className="balance-value">{formatCents(bal)}</span>
                <span className="small">Bank as of {longDay(balance.asOf)}{bal !== balance.cents ? ' + manual entries' : ''}</span>
              </span>
              <Chevron size={22} />
            </button>
          )}

          {reviewCount > 0 && (
            <button type="button" className="banner action" onClick={() => onNavigate('activity', 'review')}>
              <span><strong>{reviewCount}</strong> {reviewCount === 1 ? 'transaction needs' : 'transactions need'} a category</span>
              <span className="link-text">Review</span>
            </button>
          )}

          <section className="card" aria-label="Cash flow">
            <div className="card-head">
              <span className="card-title">Cash flow · {isCurrent ? 'this month' : monthName}</span>
              <button type="button" className="link" onClick={() => onNavigate('cashflow')}>Details</button>
            </div>
            <div className="flow">
              <button type="button" className="flow-row plain-btn" onClick={() => onDetail('income')}>
                <span className="label">Money in</span>
                <Bar thick ratio={summary.income / flowMax} status="in" label={`Money in ${formatCents(summary.income)}`} />
                <span className="amt text-in">{formatCents(summary.income)}</span>
              </button>
              <button type="button" className="flow-row plain-btn" onClick={() => onDetail('spending')}>
                <span className="label">Spent</span>
                <Bar thick ratio={summary.spent / flowMax} status="out" label={`Spent ${formatCents(summary.spent)}`} />
                <span className="amt text-out">{formatCents(summary.spent)}</span>
              </button>
            </div>
            <div className="row label">
              <span>Net <span className="strong">{formatCents(summary.net, { sign: true })}</span></span>
              {isCurrent && <span>Day {Number(today.slice(8))} of {dim}</span>}
            </div>
          </section>

          <div className="boxes" role="group" aria-label="This month">
            <Box kind="in" label="In" value={formatCents(summary.income)} onClick={() => onDetail('income')} />
            <Box kind="out" label="Spent" value={formatCents(summary.spent)} onClick={() => onDetail('spending')} />
            <Box kind="save" label={saved >= 0 ? 'Saved' : 'From savings'} value={formatCents(Math.abs(saved))}
              note={saved < 0 ? 'Took out more than you put in' : null} onClick={() => onDetail('saved')} />
            <Box kind="invest" label="Invested" value={formatCents(summary.invested)} onClick={() => onDetail('invested')} />
          </div>

          {top.length > 0 && (
            <section className="card" aria-label="Top spending">
              <div className="card-head">
                <span className="card-title head-out">Top spending</span>
                <button type="button" className="link" onClick={() => onDetail('spending')}>All spending</button>
              </div>
              {top.map(([id, cents]) => (
                <button type="button" className="budget plain-btn" key={id}
                  onClick={() => onDetail('spending', { category: id })}>
                  <div className="row">
                    <span className="name">{categoryName(id)}</span>
                    <span className="label">{formatCents(cents)}</span>
                  </div>
                  <Bar ratio={cents / topMax} status="out" label={`${categoryName(id)}: ${formatCents(cents)}`} />
                </button>
              ))}
              {pace != null && pace < 1 && <span className="small">{Math.round(pace * 100)}% of the month gone</span>}
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
