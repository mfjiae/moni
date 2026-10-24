import { useMemo } from 'react';
import { formatCents } from '../lib/money.js';
import { monthKey, monthName, longDay, ordinal, daysInMonth } from '../lib/dates.js';
import { kindForCategory } from '../lib/categories.js';
import { summarizeMonth, categoryRows, monthCompare, upcomingRent } from '../lib/summary.js';
import { currentBalance } from '../lib/importer.js';
import { SAVERS } from '../lib/accounts.js';
import { Bar, ImportButton, MonthDropdown } from './ui.jsx';
import { cashFlowCaption } from '../lib/budgets.js';
import { Icon } from './icons.jsx';
import { Donut, donutRows } from './charts.jsx';

export function SettingsButton({ onClick }) {
  return (
    <button type="button" className="icon-btn mobile-only" aria-label="Settings" onClick={onClick}>
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
    </button>
  );
}



// The five shortcuts, together in one card (compact pass B, Ken 14 Oct 2026).
function Shortcuts({ onNavigate, onDetail }) {
  const items = [
    ['Spending', 'wallet', 'out', () => onDetail('spending')],
    ['Income', 'banknote', 'in', () => onDetail('income')],
    ['Saved', 'piggy', 'save', () => onDetail('saved')],
    ['Invested', 'linechart', 'invest', () => onDetail('invested')],
    ['Activity', 'list', 'accent', () => onNavigate('activity', 'all')],
  ];
  return (
    <nav className="card hc sc-card" aria-label="Shortcuts">
      <div className="shortcuts">
        {items.map(([label, icon, c, go]) => (
          <button type="button" key={label} className="sc" style={{ '--c': `var(--${c})` }} onClick={go}>
            <span className="sc-btn"><Icon name={icon} size={22} /></span>
            <span className="sc-label">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

// Spent so far: income on the title row, big number, thin bar with a white line for today, then how it
// compares with last month by the same day.
function SpentSoFar({ month, current, today, spent, income, compare, onClick }) {
  const prevName = compare ? monthName(compare.prev) : '';
  const isCurrent = month === current;
  const [y, m] = month.split('-').map(Number);
  const pace = isCurrent ? Number(today.slice(8)) / daysInMonth(y, m) : null;
  const by = compare && compare.isCurrent ? ` by the ${ordinal(compare.day)}` : '';
  const share = compare ? `${Math.round(compare.share * 100)}% of ${prevName}\u2019s ${formatCents(compare.prevTotal)}` : '';
  return (
    <button type="button" className="card hc tint tint-out spent-card" onClick={onClick} aria-label={`${isCurrent ? 'Spent so far' : 'Spent'} ${formatCents(spent)}. Open spending`}>
      <span className="hc-title"><span>{isCurrent ? 'Spent so far' : `Spent in ${monthName(month)}`}</span><span className="hc-side">{formatCents(income)} in</span></span>
      <span className="hc-big text-out">{formatCents(spent)}</span>
      {compare ? (
        <>
          <Bar ratio={compare.share} pace={pace} status={compare.share > 1 ? 'over' : 'out'}
            label={`${Math.round(compare.share * 100)}% of ${prevName}'s total`} />
          {pace != null && (
            <span className="pace-label" aria-hidden="true">
              <span style={{ left: `${pace * 100}%`, transform: `translateX(-${pace * 100}%)` }}>{Math.round(pace * 100)}% of month</span>
            </span>
          )}
          <span className="hc-cap">{share}</span>
          <span className={`vs ${compare.delta > 0 ? 'text-out' : compare.delta < 0 ? 'text-in' : ''}`}>
            {compare.delta === 0
              ? `Same as ${prevName}${by}`
              : `${formatCents(Math.abs(compare.delta))} ${compare.delta > 0 ? 'more' : 'less'} than ${prevName}${by}`}
          </span>
        </>
      ) : (
        <span className="hc-cap">Nothing earlier to compare with yet.</span>
      )}
    </button>
  );
}

// Monthly cash flow: what came in against what was spent, as two thin bars.
function CashFlowCard({ month, summary, onClick }) {
  const { income, spent } = summary;
  const max = Math.max(income, spent, 1);
  const cap = cashFlowCaption(income, spent);
  return (
    <button type="button" className="card hc tint tint-in flow-card" onClick={onClick} aria-label="Monthly cash flow. Open cash flow">
      <span className="hc-title"><span>Monthly cash flow</span><span className="hc-side">{monthName(month)}</span></span>
      <span className="flow-rows">
        <span>In</span><Bar ratio={income / max} status="in" label={`In ${formatCents(income)}`} /><strong className="text-in">{formatCents(income)}</strong>
        <span>Spent</span><Bar ratio={spent / max} status="out" label={`Spent ${formatCents(spent)}`} /><strong className="text-out">{formatCents(spent)}</strong>
      </span>
      <span className="hc-cap">
        {cap.kind === 'pct' && `Spent ${cap.percent}% of what came in`}
        {cap.kind === 'over' && <span className="text-out">Spent {formatCents(cap.overCents)} more than came in</span>}
        {cap.kind === 'none' && 'No money in yet this month'}
      </span>
    </button>
  );
}

// Where it went: small donut with the list right beside it (name, amount, percent).
function WhereCard({ rows, total, onOpen }) {
  return (
    <section className="card hc where-card" aria-label="Where it went">
      <div className="hc-title">
        <span>Where it went</span>
        <button type="button" className="link hc-link" onClick={onOpen}>See all</button>
      </div>
      {rows.length === 0
        ? <div className="empty small-empty">No spending yet this month.</div>
        : <Donut rows={rows} total={total} size={null} amounts className="donut-home" />}
    </section>
  );
}

// Small alarm pill in the top right for a bill coming up. Just a warning: it doesn't open anything.
function RentPill({ rent }) {
  const when = rent.days === 0 ? 'today' : rent.days === 1 ? 'tomorrow' : `in ${rent.days} days`;
  return (
    <span className="rent-pill" role="status" title={`${longDay(rent.date)} \u00b7 about ${formatCents(rent.cents)}`}>
      <Icon name="alarm" size={16} />Rent due {when}
    </span>
  );
}

// Balance card (M2.6, option B): Smart Access and Savings side by side once a saver has money in it.
// Savings = every saver with a balance above $0 (an emptied one, like xx2103, drops out). Each half opens
// its account page.
function BalanceCard({ bal, balance, saverBalances, onDetail }) {
  const savers = SAVERS.map((a) => ({ ...a, b: saverBalances?.[a.id] })).filter((a) => a.b && a.b.cents > 0);
  const main = (
    <button type="button" className="bal-half" onClick={() => onDetail('account', { account: 'xx6193' })}
      aria-label={`Smart Access balance ${formatCents(bal)}. Open account`}>
      <span className="balance-label">Smart Access</span>
      <span className="balance-value">{formatCents(bal)}</span>
      <span className="balance-note">{savers.length ? 'as of ' : 'Bank as of '}{longDay(balance.asOf)}{bal !== balance.cents ? ' + manual entries' : ''}</span>
    </button>
  );
  if (!savers.length) return <div className="balance-card">{main}</div>;
  const total = savers.reduce((a, s) => a + s.b.cents, 0);
  const newest = savers.reduce((a, s) => (s.b.asOf > a ? s.b.asOf : a), savers[0].b.asOf);
  return (
    <div className="balance-card split">
      {main}
      <i className="bal-rule" aria-hidden="true" />
      <button type="button" className="bal-half save" onClick={() => onDetail('account', { account: savers[0].id })}
        aria-label={`Savings balance ${formatCents(total)}. Open savings account`}>
        <span className="balance-label">Savings</span>
        <span className="balance-value">{formatCents(total)}</span>
        <span className="balance-note">{savers.map((s) => s.id).join(' + ')} · {longDay(newest)}</span>
      </button>
    </div>
  );
}

export default function Home({ txns, today, month, setMonth, firstMonth, balance, saverBalances, sync, onNavigate, onDetail, onToast }) {
  const current = monthKey(today);
  const summary = useMemo(() => summarizeMonth(txns, month), [txns, month]);
  const reviewCount = useMemo(() => txns.filter((t) => t.kind === 'review').length, [txns]);
  const bal = useMemo(() => currentBalance(balance, txns), [balance, txns]);
  const compare = useMemo(() => monthCompare(txns, month, today), [txns, month, today]);
  const rent = useMemo(() => (month === current ? upcomingRent(txns, today) : null), [txns, today, month, current]);

  // Spending categories only (investing has its own page)
  const where = useMemo(() => {
    const totals = {};
    for (const [id, c] of Object.entries(summary.byCategory)) if (c > 0 && kindForCategory(id) === 'spend') totals[id] = c;
    const { total, rows } = categoryRows(totals);
    return { total, rows: donutRows(rows) };
  }, [summary]);

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
    <main className="screen home">
      <header className="header home-head">
        <MonthDropdown month={month} setMonth={setMonth} current={current} first={firstMonth} />
        {rent && <RentPill rent={rent} />}
        {reviewCount > 0 && (
          <button type="button" className="sort-pill" onClick={() => onNavigate('activity', 'review')}
            aria-label={`${reviewCount} transactions to sort`}>
            <Icon name="inbox" size={18} /><span><strong>{reviewCount}</strong><span className="sort-text"> to sort</span></span>
          </button>
        )}
        <div className="head-gear"><SettingsButton onClick={() => onNavigate('settings')} /></div>
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
          {bal != null && <BalanceCard bal={bal} balance={balance} saverBalances={saverBalances} onDetail={onDetail} />}
          <Shortcuts onNavigate={onNavigate} onDetail={onDetail} />
          <SpentSoFar month={month} current={current} today={today} spent={summary.spent} income={summary.income} compare={compare}
            onClick={() => onDetail('spending')} />
        </div>

        <div className="col">
          <CashFlowCard month={month} summary={summary} onClick={() => onDetail('cashflow')} />
          <WhereCard rows={where.rows} total={where.total} onOpen={() => onDetail('where')} />
        </div>
      </div>
    </main>
  );
}
