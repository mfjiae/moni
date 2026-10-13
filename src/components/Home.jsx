import { useMemo } from 'react';
import { formatCents } from '../lib/money.js';
import { monthKey, monthLabel, monthName, daysInMonth, longDay, weekdayMonFirst, ordinal } from '../lib/dates.js';
import { kindForCategory } from '../lib/categories.js';
import { summarizeMonth, categoryRows, spentByDay, monthCompare, upcomingRent } from '../lib/summary.js';
import { currentBalance } from '../lib/importer.js';
import { Bar, ImportButton, MonthDropdown } from './ui.jsx';
import { Icon, CategoryIcon } from './icons.jsx';

export function SettingsButton({ onClick }) {
  return (
    <button type="button" className="icon-btn mobile-only" aria-label="Settings" onClick={onClick}>
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
    </button>
  );
}


function Box({ kind, icon, label, value, note, onClick }) {
  return (
    <button type="button" className={`box ${kind}`} onClick={onClick}>
      <span className="box-top">
        <span className="box-icon"><Icon name={icon} size={20} /></span>
        <span className="box-label">{label}</span>
      </span>
      <span className="box-value">{value}</span>
      {note && <span className="box-note">{note}</span>}
    </button>
  );
}

// This month's spending against the month before: a progress bar, one plain sentence, and a small graph.
function PaceCard({ month, isCurrent, compare, spent }) {
  const prevName = compare ? monthName(compare.prev) : '';
  const title = isCurrent ? 'Spent so far' : `Spent in ${monthName(month)}`;
  return (
    <section className="card" aria-label="Spending pace">
      <div className="card-head"><span className="card-title head-out">{title}</span></div>
      <div className="pace-main">
        <span className="pace-amount text-out">{formatCents(spent)}</span>
      </div>
      {compare ? (
        <>
          <span className="label">
            {Math.round(compare.share * 100)}% of {prevName}&rsquo;s {formatCents(compare.prevTotal)}
          </span>
          <Bar thick ratio={compare.share} status={compare.share > 1 ? 'over' : 'out'}
            label={`${Math.round(compare.share * 100)}% of ${prevName}'s total`} />
          <span className={`vs ${compare.delta > 0 ? 'text-out' : compare.delta < 0 ? 'text-in' : 'label'}`}>
            {compare.delta === 0
              ? `Same as ${prevName}${isCurrent ? ` by the ${ordinal(compare.day)}` : ''}`
              : `${formatCents(Math.abs(compare.delta))} ${compare.delta > 0 ? 'more' : 'less'} than ${prevName}${isCurrent ? ` by the ${ordinal(compare.day)}` : ''}`}
          </span>
          <PaceChart compare={compare} month={month} prevName={prevName} />
        </>
      ) : (
        <span className="small">Nothing earlier to compare with yet.</span>
      )}
    </section>
  );
}

// Running total of spending: this month (solid) against last month (grey).
function PaceChart({ compare, month, prevName }) {
  const W = 300, H = 104, PX = 6, PY = 8;
  const [y, m] = month.split('-').map(Number);
  const dim = daysInMonth(y, m);
  const xmax = Math.max(dim, compare.prevCum.length);
  const ymax = Math.max(compare.prevCum[compare.prevCum.length - 1] ?? 0, ...compare.cum, 1);
  const X = (i) => PX + (i / Math.max(xmax - 1, 1)) * (W - PX * 2);
  const Y = (c) => H - PY - (Math.max(c, 0) / ymax) * (H - PY * 2);
  const line = (arr) => arr.map((c, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(c).toFixed(1)}`).join('');
  const last = compare.cum.length - 1;
  return (
    <div className="pace-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Spending so far this month compared with ${prevName}`}>
        <line x1={PX} x2={W - PX} y1={H - PY} y2={H - PY} stroke="var(--border)" strokeWidth="1" />
        <path d={line(compare.prevCum)} fill="none" stroke="var(--muted)" strokeOpacity="0.7" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={line(compare.cum)} fill="none" stroke="var(--out)" strokeWidth="2.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {last >= 0 && <circle cx={X(last)} cy={Y(compare.cum[last])} r="4.5" fill="var(--bg)" stroke="var(--out)" strokeWidth="2.5" />}
      </svg>
      <div className="legend">
        <span><i className="dot" style={{ background: 'var(--out)' }} />This month</span>
        <span><i className="dot" style={{ background: 'var(--muted)' }} />{prevName}</span>
      </div>
    </div>
  );
}

// Biggest spending categories, with a share of the month's spending and a bar.
function WhereItWent({ rows, onDetail }) {
  const max = rows.length ? rows[0].cents : 1;
  return (
    <section className="card" aria-label="Where it went">
      <div className="card-head">
        <span className="card-title head-out">Where it went</span>
        <button type="button" className="link" onClick={() => onDetail('spending')}>All spending</button>
      </div>
      {rows.length === 0 && <div className="empty small-empty">No spending yet this month.</div>}
      {rows.map((r) => (
        <button type="button" className="where plain-btn" key={r.id} onClick={() => onDetail('spending', { category: r.id })}>
          <span className="where-icon"><CategoryIcon id={r.id} size={20} /></span>
          <span className="where-body">
            <span className="row">
              <span className="name">{r.name}</span>
              <span><span className="strong">{formatCents(r.cents)}</span><span className="pct">{Math.round(r.share * 100)}%</span></span>
            </span>
            <Bar thick ratio={r.cents / max} status="out" label={`${r.name}: ${formatCents(r.cents)}`} />
          </span>
        </button>
      ))}
    </section>
  );
}

// Spending per day as small bars, plus a compact calendar shaded by how much you spent that day.
function DayByDay({ month, today, byDay }) {
  const { days } = byDay;
  const dim = days.length;
  const isCurrent = monthKey(today) === month;
  const todayNum = isCurrent ? Number(today.slice(8)) : dim;
  const max = Math.max(...days, 1);
  const busiestIdx = days.some((c) => c > 0) ? days.indexOf(Math.max(...days)) : -1;
  const lead = weekdayMonFirst(`${month}-01`);
  const level = (c) => (c <= 0 ? 0 : c / max < 0.25 ? 1 : c / max < 0.5 ? 2 : c / max < 0.75 ? 3 : 4);
  const tick = (d) => d === 1 || d % 7 === 1 || d === dim;
  return (
    <section className="card" aria-label="Day by day">
      <div className="card-head"><span className="card-title head-out">Day by day</span></div>
      <div className="daybars" role="img"
        aria-label={`Spending for each day of ${monthLabel(month)}${busiestIdx >= 0 ? `. Busiest day: the ${ordinal(busiestIdx + 1)}, ${formatCents(days[busiestIdx])}` : ''}`}>
        {days.map((c, i) => {
          const d = i + 1;
          const future = d > todayNum;
          return (
            <span key={d} className={`daybar${future ? ' future' : ''}${i === busiestIdx ? ' top' : ''}`} title={`${d} ${monthName(month)}: ${formatCents(c)}`}>
              <i style={{ height: `${future || c <= 0 ? 0 : Math.max((c / max) * 100, 4)}%` }} />
            </span>
          );
        })}
      </div>
      <div className="dayaxis" aria-hidden="true">
        {days.map((_, i) => <span key={i}>{tick(i + 1) ? i + 1 : ''}</span>)}
      </div>

      <div className="cal-row">
        <div className="cal" role="group" aria-label={`Calendar of ${monthLabel(month)} shaded by spending`}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => <span key={i} className="cal-wd">{w}</span>)}
          {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
          {days.map((c, i) => {
            const d = i + 1;
            const future = d > todayNum;
            return (
              <span key={d} className={`cal-day l${future ? 0 : level(c)}${future ? ' future' : ''}${isCurrent && d === todayNum ? ' today' : ''}`}
                title={`${d} ${monthName(month)}: ${future ? 'not yet' : formatCents(c)}`}>{d}</span>
            );
          })}
        </div>
        <div className="cal-side">
          {busiestIdx >= 0 && (
            <span className="small">Busiest day<br /><span className="strong">{ordinal(busiestIdx + 1)} · {formatCents(days[busiestIdx])}</span></span>
          )}
          <span className="heat-legend" aria-hidden="true">
            <span className="small">Less</span>
            {[1, 2, 3, 4].map((l) => <i key={l} className={`cal-day l${l}`} />)}
            <span className="small">More</span>
          </span>
        </div>
      </div>
    </section>
  );
}

function RentBanner({ rent, onClick }) {
  const when = rent.days === 0 ? 'is due today' : rent.days === 1 ? 'is due tomorrow' : `is due in ${rent.days} days`;
  return (
    <button type="button" className="banner action warn" onClick={onClick}>
      <span className="warn-text">
        <Icon name="alert" size={20} />
        <span><strong>Rent</strong> {when} <span className="small">({longDay(rent.date)}) · about {formatCents(rent.cents)}</span></span>
      </span>
    </button>
  );
}

export default function Home({ txns, today, month, setMonth, firstMonth, balance, sync, onNavigate, onDetail, onToast }) {
  const current = monthKey(today);
  const summary = useMemo(() => summarizeMonth(txns, month), [txns, month]);
  const reviewCount = useMemo(() => txns.filter((t) => t.kind === 'review').length, [txns]);
  const bal = useMemo(() => currentBalance(balance, txns), [balance, txns]);
  const byDay = useMemo(() => spentByDay(txns, month), [txns, month]);
  const compare = useMemo(() => monthCompare(txns, month, today), [txns, month, today]);
  const rent = useMemo(() => (month === current ? upcomingRent(txns, today) : null), [txns, today, month, current]);

  // Home keeps investing out of spending (it has its own box)
  const whereRows = useMemo(() => {
    const totals = {};
    for (const [id, c] of Object.entries(summary.byCategory)) if (c > 0 && kindForCategory(id) === 'spend') totals[id] = c;
    return categoryRows(totals).rows.slice(0, 6);
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

  const saved = summary.savedNet;

  return (
    <main className="screen">
      <header className="header">
        <MonthDropdown month={month} setMonth={setMonth} current={current} first={firstMonth} />
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
      {rent && <RentBanner rent={rent} onClick={() => onDetail('spending', { category: 'housing' })} />}

      <div className="home-grid">
        <div className="col">
          {bal != null && (
            <button type="button" className="balance-card" onClick={() => onDetail('account')} aria-label={`Balance ${formatCents(bal)}. Open account`}>
              <span className="balance-label">Smart Access</span>
              <span className="balance-value">{formatCents(bal)}</span>
              <span className="balance-note">Bank as of {longDay(balance.asOf)}{bal !== balance.cents ? ' + manual entries' : ''}</span>
            </button>
          )}

          <div className="quick">
            {reviewCount > 0 && (
              <button type="button" className="chip-box sort" onClick={() => onNavigate('activity', 'review')}>
                <Icon name="inbox" size={18} /><span><strong>{reviewCount}</strong> to sort</span>
              </button>
            )}
            <button type="button" className="chip-box find" onClick={() => onNavigate('activity', 'all')}>
              <Icon name="search" size={18} /><span>Search transactions</span>
            </button>
          </div>

          <div className="boxes" role="group" aria-label={month === current ? 'This month' : monthLabel(month)}>
            <Box kind="in" icon="arrow-in" label="In" value={formatCents(summary.income)} onClick={() => onDetail('income')} />
            <Box kind="out" icon="arrow-out" label="Spent" value={formatCents(summary.spent)} onClick={() => onDetail('spending')} />
            <Box kind="save" icon="piggy" label={saved >= 0 ? 'Saved' : 'From savings'} value={formatCents(Math.abs(saved))}
              note={saved < 0 ? 'Took out more than you put in' : null} onClick={() => onDetail('saved')} />
            <Box kind="invest" icon="trend" label="Invested" value={formatCents(summary.invested)} onClick={() => onDetail('invested')} />
          </div>
        </div>

        <div className="col">
          <PaceCard month={month} isCurrent={month === current} compare={compare} spent={summary.spent} />
          <WhereItWent rows={whereRows} onDetail={onDetail} />
        </div>

        <div className="col third">
          <DayByDay month={month} today={today} byDay={byDay} />
        </div>
      </div>
    </main>
  );
}
