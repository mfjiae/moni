// Spending charts shared by the Spending page: this month against last (line) and Day by day (bars + calendar).
import { useMemo, useState } from 'react';
import { formatCents } from '../lib/money.js';
import { monthKey, monthLabel, monthName, daysInMonth, longDay, weekdayMonFirst, ordinal } from '../lib/dates.js';
import { dayItems } from '../lib/summary.js';
import { Icon } from './icons.jsx';

// A round-up for the graph's top line: 3000, 2500, 1000 ... (in cents)
export function niceMax(cents) {
  const steps = [5000, 10000, 25000, 50000, 100000, 200000, 250000, 500000, 1000000, 2000000, 5000000];
  const step = steps.find((s) => cents / s <= 4) ?? 10000000;
  return { step, max: Math.max(Math.ceil(cents / step), 1) * step };
}
export const axisMoney = (c) => (c === 0 ? '$0' : c >= 100000 ? `$${c / 100000}k` : `$${c / 100}`);

// Running total of spending: this month (solid) against last month (grey). Hover or touch to read a day.
export function PaceChart({ compare, month, prevName }) {
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

// "$961" in a calendar cell; "$1.2k" from a thousand up
const cellMoney = (c) => (c >= 100000 ? `$${(c / 100000).toFixed(1)}k` : `$${Math.round(c / 100)}`);

// Spending per day as small bars, plus a calendar showing what you spent each day. Tap a day to see it.
export function DayByDay({ txns, month, today, byDay, exclude = [] }) {
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
  const items = useMemo(() => (selDate ? dayItems(txns, selDate, exclude) : []), [txns, selDate, exclude]);

  return (
    <section className="card day-card" aria-label="Day by day">
      <div className="card-head">
        <span className="card-title head-out">Day by day</span>
        {busiestIdx >= 0 && (
          <span className="busy-pill">
            <Icon name="flame" size={15} />Busiest<span className="bd-day"> day</span>: {longDay(`${month}-${String(busiestIdx + 1).padStart(2, '0')}`).split(' ')[0]} {ordinal(busiestIdx + 1)} &middot; {formatCents(days[busiestIdx])}
          </span>
        )}
      </div>
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

