// M4 pages (Ken, 25 Oct 2026, "UI locked"): Investments (I-B layout with the I-C stacked chart) and
// Tuition (U2 bars + list, with the semester-on-semester chip and the same semester a year earlier).
import { useMemo, useState } from 'react';
import { formatCents } from '../lib/money.js';
import { monthKey, monthName, monthShort, monthLabel, longDay } from '../lib/dates.js';
import { investView, splitOf, RANGES, UNTAGGED } from '../lib/investing.js';
import { tuitionView } from '../lib/tuition.js';
import { Donut, StackedArea } from './charts.jsx';
import TxnList from './TxnList.jsx';
import TxnRow from './TxnRow.jsx';

// Shades of the invested purple, steady per ETF (order = biggest all-time first); gray = not tagged.
export const ETF_COLORS = ['#D6A8FF', '#9A5CFF', '#6A3BC4', '#F0DDFF', '#B57BFF', '#4F2A99'];
const UNTAGGED_COLOR = '#B8B1A8';
const RANGE_TEXT = { '1w': 'last 7 days', '1m': 'last month', '3m': 'last 3 months', '6m': 'last 6 months', '1y': 'last 12 months', all: 'all time' };

const byNewest = (a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? 0) - (a.createdAt ?? 0);
const pointLabel = (key, daily) => (daily ? `${Number(key.slice(8))} ${monthShort(key.slice(0, 7))}` : monthShort(key));

export function InvestmentsPage({ txns, today, onOpen, etfs }) {
  const [range, setRange] = useState('6m');
  const v = useMemo(() => investView(txns, range, today, etfs), [txns, range, today, etfs]);
  const colorOf = (id) => (id === UNTAGGED ? UNTAGGED_COLOR : ETF_COLORS[Math.max(etfs.indexOf(id), 0) % ETF_COLORS.length]);
  const nameOf = (id) => (id === UNTAGGED ? 'Not tagged' : id);
  const bands = v.bands.map((b) => ({ ...b, name: nameOf(b.id), color: colorOf(b.id) }));
  const donut = v.rows.filter((r) => r.cents > 0).map((r) => ({ id: r.id, name: nameOf(r.id), cents: r.cents }));
  const donutTotal = donut.reduce((a, r) => a + r.cents, 0);
  const list = useMemo(() => [...v.list].sort(byNewest), [v.list]);
  const tagsFor = (t) => {
    const s = splitOf(t);
    return s ? s.map((p) => ({ text: p.ticker })) : [{ text: 'Tag ETF', cls: 'none' }];
  };

  return (
    <div className="detail-grid">
      <div className="col">
        <div className="segmented" role="tablist" aria-label="Range">
          {RANGES.map(([k, t]) => (
            <button key={k} type="button" role="tab" aria-selected={range === k} className={range === k ? 'on' : ''} onClick={() => setRange(k)}>{t}</button>
          ))}
        </div>
        <section className="card detail-head" aria-label="Money put in">
          <div className="row"><span className="label">Put in, {RANGE_TEXT[range]}</span><span className="small">All time {formatCents(v.allTime)}</span></div>
          <span className="hero-amount"><span className="big text-invest">{formatCents(v.total)}</span></span>
          <StackedArea bands={bands} labels={v.keys.map((k) => pointLabel(k, v.daily))}
            ariaLabel={`Running total put in, ${RANGE_TEXT[range]}, by ETF: ${bands.map((b) => `${b.name} ${formatCents(b.values[b.values.length - 1])}`).join(', ')}`} />
          {bands.length > 0 && <span className="small">Hover or tap an ETF to light up only its band</span>}
        </section>
        <section className="card" aria-label="By ETF">
          <div className="card-head"><span className="card-title head-invest">By ETF</span><span className="small">{RANGE_TEXT[range]}</span></div>
          {donut.length
            ? <Donut rows={donut} total={donutTotal} centerLabel="Put in" size={132} amounts colors={donut.map((r) => colorOf(r.id))}
              ariaLabel={`Put in by ETF, total ${formatCents(donutTotal)}`} className="donut-etf" />
            : <div className="empty small-empty">Nothing put in during this time.</div>}
          {v.untagged > 0 && <span className="small text-review">{v.untagged} {v.untagged === 1 ? 'buy is' : 'buys are'} not tagged. Open {v.untagged === 1 ? 'it' : 'one'} below to pick the ETF.</span>}
        </section>
        <section className="card" aria-label="Each month">
          <div className="card-head"><span className="card-title head-invest">Each month</span></div>
          {v.months.map((m) => (
            <div className="row stat-row" key={m.key}>
              <span className="label">{monthKey(today) === m.key ? `${monthName(m.key)} so far` : monthLabel(m.key)}</span>
              <span className="strong">{formatCents(m.cents)}</span>
            </div>
          ))}
        </section>
        <p className="hint">What you put in, from your bank. moni can't see prices, so your portfolio's value and gains stay in the Betashares app.</p>
      </div>
      <TxnList title="Investing transactions" list={list} today={today} onOpen={onOpen} tagsFor={tagsFor}
        empty="Nothing invested during this time." />
    </div>
  );
}

const pctText = (p) => `${p > 0 ? '+' : ''}${p}%`;
const pctClass = (p) => (p > 0 ? 'up' : p < 0 ? 'down' : 'flat');
const dollars = (c) => `$${Math.round(c / 100).toLocaleString('en-AU')}`;

// One bar per semester, oldest left (the newest 8).
function SemesterBars({ semesters }) {
  const shown = [...semesters].reverse().slice(-8);
  const max = Math.max(1, ...shown.map((s) => s.cents));
  const W = 420, B = 128, T = 26, gap = 14;
  const w = Math.min(70, (W - gap * (shown.length + 1)) / shown.length);
  const left = (W - (w * shown.length + gap * (shown.length - 1))) / 2;
  return (
    <svg className="sem-bars" viewBox={`0 0 ${W} 172`} width="100%" role="img"
      aria-label={`Tuition per semester: ${shown.map((s) => `${s.name} ${formatCents(s.cents)}`).join(', ')}`}>
      <line x1="0" x2={W} y1={B} y2={B} stroke="var(--border)" />
      {shown.map((s, i) => {
        const x = left + i * (w + gap);
        const h = Math.max((Math.max(s.cents, 0) / max) * (B - T), 2);
        return (
          <g key={s.key}>
            <rect x={x} y={B - h} width={w} height={h} rx="6" fill="var(--out)" />
            <text x={x + w / 2} y={B - h - 8} textAnchor="middle" fill="var(--text)" fontSize="16" fontWeight="600">{dollars(s.cents)}</text>
            <text x={x + w / 2} y={B + 20} textAnchor="middle" fill="var(--muted)" fontSize="15">{s.key.endsWith('A') ? 'Autumn' : 'Spring'}</text>
            <text x={x + w / 2} y={B + 39} textAnchor="middle" fill="var(--muted)" fontSize="14">{s.key.slice(0, 4)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function TuitionPage({ txns, onOpen }) {
  const v = useMemo(() => tuitionView(txns), [txns]);
  return (
    <div className="detail-grid">
      <div className="col">
        <section className="card detail-head" aria-label="Tuition paid">
          <span className="label">Paid so far, all semesters</span>
          <span className="hero-amount"><span className="big text-out">{formatCents(v.total)}</span></span>
          {v.count > 0 && <SemesterBars semesters={v.semesters} />}
          {v.count > 0 && <span className="small">{v.count} {v.count === 1 ? 'semester' : 'semesters'} · average {formatCents(v.average)}</span>}
        </section>
        <p className="hint">Grouped by UTS semester: payments from January to June count as Autumn, July to December as Spring.
          The chip compares with the semester just before; the line under it names that one and adds the same semester a year earlier.</p>
      </div>
      <section className="card list txn-box" aria-label="Payments">
        <div className="card-head"><span className="card-title">Payments</span><span className="small">{v.semesters.reduce((a, s) => a + s.payments.length, 0)}</span></div>
        {v.count === 0 && <div className="empty small-empty">No tuition payments yet.</div>}
        {v.semesters.map((s) => {
          const sub = [s.vsPrev && `vs ${s.vsPrev.name}`, s.vsYear && `${pctText(s.vsYear.pct)} vs ${s.vsYear.name}`].filter(Boolean).join(' · ');
          return (
            <div key={s.key} role="group" aria-label={s.name} className="sem-group">
              <div className="day-head sem-head">
                <span className="day-date">{s.name}
                  {s.vsPrev && <span className={`sem-chip ${pctClass(s.vsPrev.pct)}`}>{pctText(s.vsPrev.pct)}</span>}</span>
                <span className="day-total text-out">{formatCents(s.cents)}</span>
              </div>
              {sub && <div className="sem-vs small">{sub}</div>}
              {s.payments.map((t) => <TxnRow key={t.uid} t={t} onOpen={onOpen} meta={longDay(t.date)} />)}
            </div>
          );
        })}
      </section>
    </div>
  );
}
