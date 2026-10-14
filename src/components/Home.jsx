import { useMemo } from 'react';
import { formatCents } from '../lib/money.js';
import { monthKey, monthName, longDay, ordinal, daysInMonth } from '../lib/dates.js';
import { kindForCategory } from '../lib/categories.js';
import { summarizeMonth, categoryRows, monthCompare, upcomingRent } from '../lib/summary.js';
import { currentBalance } from '../lib/importer.js';
import { Bar, ImportButton, MonthDropdown } from './ui.jsx';
import { Icon } from './icons.jsx';
import { Donut, donutRows } from './charts.jsx';

export function SettingsButton({ onClick }) {
  return (
    <button type="button" className="icon-btn mobile-only" aria-label="Settings" onClick={onClick}>
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
    </button>
  );
}



// Round shortcut buttons, each in its own color.
function Shortcuts({ onNavigate, onDetail }) {
  const items = [
    ['Spending', 'arrow-out', 'out', () => onDetail('spending')],
    ['Income', 'arrow-in', 'in', () => onDetail('income')],
    ['Saved', 'piggy', 'save', () => onDetail('saved')],
    ['Invested', 'trend', 'invest', () => onDetail('invested')],
    ['Activity', 'list', 'accent', () => onNavigate('activity', 'all')],
  ];
  return (
    <nav className="shortcuts" aria-label="Shortcuts">
      {items.map(([label, icon, c, go]) => (
        <button type="button" key={label} className="sc" style={{ '--c': `var(--${c === 'accent' ? 'accent' : c})` }} onClick={go}>
          <span className="sc-btn"><Icon name={icon} size={24} /></span>
          <span className="sc-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}

// Spent so far: big number, how it compares with last month, and a bar with a marker for today.
function SpentSoFar({ month, current, today, spent, compare, onClick }) {
  const prevName = compare ? monthName(compare.prev) : '';
  const isCurrent = month === current;
  const [y, m] = month.split('-').map(Number);
  const pace = isCurrent ? Number(today.slice(8)) / daysInMonth(y, m) : null;
  const by = compare && compare.isCurrent ? ` by the ${ordinal(compare.day)}` : '';
  return (
    <button type="button" className="card tint tint-out spent-card" onClick={onClick} aria-label={`${isCurrent ? 'Spent so far' : 'Spent'} ${formatCents(spent)}. Open spending`}>
      <span className="tint-title">{isCurrent ? 'Spent so far' : `Spent in ${monthName(month)}`}</span>
      <span className="tint-amount text-out">{formatCents(spent)}</span>
      {compare ? (
        <>
          <Bar thick ratio={compare.share} pace={pace} status={compare.share > 1 ? 'over' : 'out'}
            label={`${Math.round(compare.share * 100)}% of ${prevName}'s total`} />
          <span className="row tint-sub">
            <span>{Math.round(compare.share * 100)}% of {prevName}&rsquo;s {formatCents(compare.prevTotal)}</span>
            {pace != null && <span className="today-key"><i />Today</span>}
          </span>
          <span className={`vs ${compare.delta > 0 ? 'text-out' : compare.delta < 0 ? 'text-in' : ''}`}>
            {compare.delta === 0
              ? `Same as ${prevName}${by}`
              : `${formatCents(Math.abs(compare.delta))} ${compare.delta > 0 ? 'more' : 'less'} than ${prevName}${by}`}
          </span>
        </>
      ) : (
        <span className="tint-sub">Nothing earlier to compare with yet.</span>
      )}
    </button>
  );
}

// Monthly cash flow: what came in against what was spent, as two bars.
function CashFlowCard({ summary, onClick }) {
  const { income, spent } = summary;
  const max = Math.max(income, spent, 1);
  return (
    <button type="button" className="card tint tint-in flow-card" onClick={onClick} aria-label="Monthly cash flow. Open cash flow">
      <span className="tint-title">Monthly cash flow</span>
      <span className="flow-line">
        <span className="row"><span>In</span><strong className="text-in">{formatCents(income)}</strong></span>
        <Bar thick ratio={income / max} status="in" label={`In ${formatCents(income)}`} />
      </span>
      <span className="flow-line">
        <span className="row"><span>Spent</span><strong className="text-out">{formatCents(spent)}</strong></span>
        <Bar thick ratio={spent / max} status="out" label={`Spent ${formatCents(spent)}`} />
      </span>
      <span className="tint-sub">{income > 0 ? `Spent ${Math.round((spent / income) * 100)}% of what came in` : 'No money in yet'}</span>
    </button>
  );
}

function WhereCard({ rows, total, onOpen }) {
  return (
    <section className="card where-card" aria-label="Where it went">
      <div className="card-head">
        <span className="card-title head-out">Where it went</span>
        <button type="button" className="link" onClick={onOpen}>See all</button>
      </div>
      {rows.length === 0
        ? <div className="empty small-empty">No spending yet this month.</div>
        : <Donut rows={rows} total={total} />}
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

export default function Home({ txns, today, month, setMonth, firstMonth, balance, sync, onNavigate, onDetail, onToast }) {
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
    <main className="screen">
      <header className="header">
        <MonthDropdown month={month} setMonth={setMonth} current={current} first={firstMonth} />
        <div className="header-right">
          {rent && <RentPill rent={rent} />}
          {reviewCount > 0 && (
            <button type="button" className="sort-pill" onClick={() => onNavigate('activity', 'review')}
              aria-label={`${reviewCount} transactions to sort`}>
              <Icon name="inbox" size={18} /><span><strong>{reviewCount}</strong> to sort</span>
            </button>
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
              <span className="balance-label">Smart Access</span>
              <span className="balance-value">{formatCents(bal)}</span>
              <span className="balance-note">Bank as of {longDay(balance.asOf)}{bal !== balance.cents ? ' + manual entries' : ''}</span>
            </button>
          )}
          <Shortcuts onNavigate={onNavigate} onDetail={onDetail} />
          <SpentSoFar month={month} current={current} today={today} spent={summary.spent} compare={compare}
            onClick={() => onDetail('spending')} />
        </div>

        <div className="col">
          <CashFlowCard summary={summary} onClick={() => onDetail('cashflow')} />
          <WhereCard rows={where.rows} total={where.total} onOpen={() => onDetail('where')} />
        </div>
      </div>
    </main>
  );
}
