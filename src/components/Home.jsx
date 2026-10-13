import { useMemo, useState } from 'react';
import { formatCents } from '../lib/money.js';
import { monthKey, monthLabel, monthName, daysInMonth, longDay, weekdayMonFirst, ordinal } from '../lib/dates.js';
import { kindForCategory } from '../lib/categories.js';
import { summarizeMonth, categoryRows, spentByDay, monthCompare, compareMonths, dayItems, upcomingRent } from '../lib/summary.js';
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


function Box({ kind, icon, label, value, foot, note, onClick }) {
  return (
    <button type="button" className={`box ${kind}`} onClick={onClick}>
      <span className="box-top">
        <span className="box-icon"><Icon name={icon} size={20} /></span>
        <span className="box-label">{label}</span>
      </span>
      <span className="box-value">{value}</span>
      {note && <span className="box-note">{note}</span>}
      {foot && <span className="box-foot">{foot}</span>}
    </button>
  );
}

// A round-up for the graph's top line: 3000, 2500, 1000 ... (in cents)
function niceMax(cents) {
  const steps = [5000, 10000, 25000, 50000, 100000, 200000, 250000, 500000, 1000000, 2000000, 5000000];
  const step = steps.find((s) => cents / s <= 4) ?? 10000000;
  return { step, max: Math.max(Math.ceil(cents / step), 1) * step };
}
const axisMoney = (c) => (c === 0 ? '$0' : c >= 100000 ? `$${c / 100000}k` : `$${c / 100}`);

// This month's spending against the month before: a progress bar, one plain sentence, and a big graph.
function PaceCard({ month, isCurrent, compare, spent }) {
  const prevName = compare ? monthName(compare.prev) : '';
  const title = isCurrent ? 'Spent so far' : `Spent in ${monthName(month)}`;
  const by = compare && isCurrent ? ` by the ${ordinal(compare.day)}` : '';
  return (
    <section className="card pace-card" aria-label="Spending pace">
      <div className="card-head"><span className="card-title head-out">{title}</span></div>
      <div className="pace-main">
        <span className="pace-amount text-out">{formatCents(spent)}</span>
        {compare && (
          <span className={`vs ${compare.delta > 0 ? 'text-out' : compare.delta < 0 ? 'text-in' : 'label'}`}>
            {compare.delta === 0
              ? `Same as ${prevName}${by}`
              : `${formatCents(Math.abs(compare.delta))} ${compare.delta > 0 ? 'more' : 'less'} than ${prevName}${by}`}
          </span>
        )}
      </div>
      {compare ? (
        <>
          <span className="label">{Math.round(compare.share * 100)}% of {prevName}&rsquo;s {formatCents(compare.prevTotal)}</span>
          <Bar thick ratio={compare.share} status={compare.share > 1 ? 'over' : 'out'}
            label={`${Math.round(compare.share * 100)}% of ${prevName}'s total`} />
          <PaceChart compare={compare} month={month} prevName={prevName} />
        </>
      ) : (
        <span className="small">Nothing earlier to compare with yet.</span>
      )}
    </section>
  );
}

// Running total of spending: this month (solid) against last month (grey). Hover or touch to read a day.
function PaceChart({ compare, month, prevName }) {
  const [hover, setHover] = useState(null);
  const W = 560, H = 250, L = 46, R = 14, T = 20, B = 26;
  const [y, m] = month.split('-').map(Number);
  const dim = daysInMonth(y, m);
  const xmax = Math.max(dim, compare.prevCum.length);
  const top = Math.max(compare.prevCum[compare.prevCum.length - 1] ?? 0, ...compare.cum, 1);
  const { step, max } = niceMax(top);
  const X = (d) => L + ((d - 1) / Math.max(xmax - 1, 1)) * (W - L - R);
  const Y = (c) => T + (1 - Math.max(c, 0) / max) * (H - T - B);
  const line = (arr) => arr.map((c, i) => `${i ? 'L' : 'M'}${X(i + 1).toFixed(1)},${Y(c).toFixed(1)}`).join('');
  const last = compare.cum.length;
  const ticks = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  const xticks = [1, 8, 15, 22, 29].filter((d) => d <= xmax);

  function onMove(e) {
    const r = e.currentTarget.ownerSVGElement.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.min(xmax, Math.max(1, Math.round(((px - L) / (W - L - R)) * (xmax - 1) + 1))));
  }
  const nowAt = hover != null && hover <= last ? compare.cum[hover - 1] : null;
  const prevAt = hover != null ? compare.prevCum[Math.min(hover, compare.prevCum.length) - 1] : null;

  return (
    <div className="pace-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Spending so far this month compared with ${prevName}`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="var(--track)" strokeWidth="1" />
            <text x={L - 8} y={Y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{axisMoney(v)}</text>
          </g>
        ))}
        {xticks.map((d) => <text key={d} x={X(d)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--muted)">{d}</text>)}
        <path d={`${line(compare.cum)}L${X(last)},${Y(0)}L${X(1)},${Y(0)}Z`} fill="var(--out)" fillOpacity="0.12" />
        <path d={line(compare.prevCum)} fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={line(compare.cum)} fill="none" stroke="var(--out)" strokeWidth="2.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {last > 0 && compare.isCurrent && (
          <>
            <circle cx={X(last)} cy={Y(compare.prevCum[Math.min(last, compare.prevCum.length) - 1])} r="4" fill="var(--bg)" stroke="var(--muted)" strokeWidth="2" />
            <circle cx={X(last)} cy={Y(compare.cum[last - 1])} r="5.5" fill="var(--bg)" stroke="var(--out)" strokeWidth="2.5" />
          </>
        )}
        {hover != null && <line x1={X(hover)} x2={X(hover)} y1={T} y2={H - B} stroke="var(--text)" strokeOpacity="0.5" />}
        <text x={L + 4} y="12" fontSize="12" fill="var(--text)">
          {hover != null ? `Day ${hover}  ·  This month ${nowAt != null ? formatCents(nowAt) : '–'}  ·  ${prevName} ${formatCents(prevAt ?? 0)}` : ''}
        </text>
        <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent"
          onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      <div className="legend">
        <span><i className="dot" style={{ background: 'var(--out)' }} />This month</span>
        <span><i className="dot" style={{ background: 'var(--muted)' }} />{prevName}</span>
      </div>
    </div>
  );
}

// Biggest spending categories, with a share of the month's spending and a bar. Fills the column.
function WhereItWent({ rows, onNavigate }) {
  const max = rows.length ? rows[0].cents : 1;
  return (
    <section className="card where-card" aria-label="Where it went">
      <div className="card-head">
        <span className="card-title head-out">Where it went</span>
        <button type="button" className="link" onClick={() => onNavigate('activity', 'all')}>All spending</button>
      </div>
      {rows.length === 0 && <div className="empty small-empty">No spending yet this month.</div>}
      <div className="where-list">
        {rows.map((r) => (
          <div className="where" key={r.id}>
            <span className="where-icon"><CategoryIcon id={r.id} size={20} /></span>
            <span className="where-body">
              <span className="row">
                <span className="name">{r.name}</span>
                <span><span className="strong">{formatCents(r.cents)}</span><span className="pct">{Math.round(r.share * 100)}%</span></span>
              </span>
              <Bar thick ratio={r.cents / max} status="out" label={`${r.name}: ${formatCents(r.cents)}`} />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// "$961" in a calendar cell; "$1.2k" from a thousand up
const cellMoney = (c) => (c >= 100000 ? `$${(c / 100000).toFixed(1)}k` : `$${Math.round(c / 100)}`);

// Spending per day as small bars, plus a calendar showing what you spent each day. Tap a day to see it.
function DayByDay({ txns, month, today, byDay }) {
  const { days } = byDay;
  const dim = days.length;
  const isCurrent = monthKey(today) === month;
  const todayNum = isCurrent ? Number(today.slice(8)) : dim;
  const max = Math.max(...days, 1);
  const busiestIdx = days.some((c) => c > 0) ? days.indexOf(Math.max(...days)) : -1;
  const lastSpend = days.reduce((a, c, i) => (c > 0 && i + 1 <= todayNum ? i + 1 : a), 0);
  const [sel, setSel] = useState(lastSpend || null);
  const lead = weekdayMonFirst(`${month}-01`);
  const level = (c) => { if (c <= 0) return 0; const r = Math.sqrt(c / max); return r < 0.2 ? 1 : r < 0.3 ? 2 : r < 0.45 ? 3 : 4; };
  const tick = (d) => d === 1 || d % 7 === 1 || d === dim;
  const selDate = sel ? `${month}-${String(sel).padStart(2, '0')}` : null;
  const items = useMemo(() => (selDate ? dayItems(txns, selDate) : []), [txns, selDate]);

  return (
    <section className="card day-card" aria-label="Day by day">
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
        <div className="cal-wrap">
          <div className="cal" role="group" aria-label={`Calendar of ${monthLabel(month)} with what you spent each day`}>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => <span key={i} className="cal-wd">{w}</span>)}
            {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
            {days.map((c, i) => {
              const d = i + 1;
              const future = d > todayNum;
              const cls = `cal-day l${future ? 0 : level(c)}${future ? ' future' : ''}${isCurrent && d === todayNum ? ' today' : ''}${d === sel ? ' picked' : ''}`;
              return (
                <button type="button" key={d} className={cls} disabled={future} aria-pressed={d === sel}
                  aria-label={`${d} ${monthName(month)}: ${formatCents(c)}`} onClick={() => setSel(d)}>
                  <span className="cal-n">{d}</span>
                  <span className="cal-amt">{future ? '' : c > 0 ? cellMoney(c) : '–'}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="cal-side">
          {busiestIdx >= 0 && (
            <div className="side-box">
              <span className="side-icon"><Icon name="flame" size={20} /></span>
              <span><span className="small">Busiest day</span><span className="side-big">{ordinal(busiestIdx + 1)} · {formatCents(days[busiestIdx])}</span></span>
            </div>
          )}
          <div className="side-box day-detail">
            {selDate ? (
              <>
                <span className="small">{longDay(selDate)}</span>
                <span className="side-amount">{formatCents(days[sel - 1])}</span>
                {items.length ? items.map((it) => (
                  <span className="row day-line" key={it.id}><span className="label">{it.name}</span><span>{formatCents(it.cents)}</span></span>
                )) : <span className="small">No spending</span>}
              </>
            ) : <span className="small">Tap a day to see what you spent.</span>}
          </div>
        </div>
      </div>
    </section>
  );
}

// Bigger warning for a bill coming up. Just a warning: it doesn't open anything.
function RentBanner({ rent }) {
  const when = rent.days === 0 ? 'is due today' : rent.days === 1 ? 'is due tomorrow' : `is due in ${rent.days} days`;
  return (
    <div className="rent-warn" role="status">
      <Icon name="alert" size={32} />
      <span className="rent-text">
        <span className="rent-big">Rent {when}</span>
        <span className="label">{longDay(rent.date)} · about {formatCents(rent.cents)}</span>
      </span>
    </div>
  );
}

export default function Home({ txns, today, month, setMonth, firstMonth, balance, sync, onNavigate, onDetail, onToast }) {
  const current = monthKey(today);
  const summary = useMemo(() => summarizeMonth(txns, month), [txns, month]);
  const reviewCount = useMemo(() => txns.filter((t) => t.kind === 'review').length, [txns]);
  const bal = useMemo(() => currentBalance(balance, txns), [balance, txns]);
  const byDay = useMemo(() => spentByDay(txns, month), [txns, month]);
  const compare = useMemo(() => monthCompare(txns, month, today), [txns, month, today]);
  const cmp = useMemo(() => compareMonths(txns, month, today), [txns, month, today]);
  const rent = useMemo(() => (month === current ? upcomingRent(txns, today) : null), [txns, today, month, current]);

  // Home keeps investing out of spending (it has its own box)
  const whereRows = useMemo(() => {
    const totals = {};
    for (const [id, c] of Object.entries(summary.byCategory)) if (c > 0 && kindForCategory(id) === 'spend') totals[id] = c;
    return categoryRows(totals).rows.slice(0, 8);
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
  const prevName = monthName(cmp.prev);
  const foot = (text) => (cmp.hasPrev ? `${prevName}: ${text}` : null);
  const prevSaved = cmp.prevTotal.savedNet;

  return (
    <main className="screen">
      <header className="header">
        <div className="header-left">
          {reviewCount > 0 && (
            <button type="button" className="sort-pill" onClick={() => onNavigate('activity', 'review')}
              aria-label={`${reviewCount} transactions to sort`}>
              <Icon name="inbox" size={18} /><span><strong>{reviewCount}</strong> to sort</span>
            </button>
          )}
          <MonthDropdown month={month} setMonth={setMonth} current={current} first={firstMonth} />
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
      {rent && <RentBanner rent={rent} />}

      <div className="home-grid">
        <div className="col">
          {bal != null && (
            <button type="button" className="balance-card" onClick={() => onDetail('account')} aria-label={`Balance ${formatCents(bal)}. Open account`}>
              <span className="balance-label">Smart Access</span>
              <span className="balance-value">{formatCents(bal)}</span>
              <span className="balance-note">Bank as of {longDay(balance.asOf)}{bal !== balance.cents ? ' + manual entries' : ''}</span>
            </button>
          )}
          <WhereItWent rows={whereRows} onNavigate={onNavigate} />
        </div>

        <div className="col">
          <div className="boxes" role="group" aria-label={month === current ? 'This month' : monthLabel(month)}>
            <Box kind="in" icon="arrow-in" label="In" value={formatCents(summary.income)}
              foot={foot(formatCents(cmp.prevTotal.income))} onClick={() => onDetail('income')} />
            <Box kind="out" icon="arrow-out" label="Spent" value={formatCents(summary.spent)}
              foot={foot(formatCents(cmp.prevTotal.spent))} onClick={() => onDetail('spending')} />
            <Box kind="save" icon="piggy" label={saved >= 0 ? 'Saved' : 'From savings'} value={formatCents(Math.abs(saved))}
              foot={foot(`${formatCents(Math.abs(prevSaved))}${prevSaved < 0 ? ' from savings' : ' saved'}`)} onClick={() => onDetail('saved')} />
            <Box kind="invest" icon="trend" label="Invested" value={formatCents(summary.invested)}
              foot={foot(formatCents(cmp.prevTotal.invested))} onClick={() => onDetail('invested')} />
          </div>
          <PaceCard month={month} isCurrent={month === current} compare={compare} spent={summary.spent} />
        </div>

        <div className="col third">
          <DayByDay key={month} txns={txns} month={month} today={today} byDay={byDay} />
        </div>
      </div>
    </main>
  );
}
