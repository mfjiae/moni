// Cash flow page (money in, spent, saved, invested) and Where it went page (spending by category).
import { useMemo, useState } from 'react';
import { formatCents } from '../lib/money.js';
import { monthName, shiftMonth } from '../lib/dates.js';
import { rangeCompare, monthSeries, pctChange, whereCompare } from '../lib/summary.js';
import { Bar, Segmented } from './ui.jsx';
import { Icon, CategoryIcon } from './icons.jsx';
import { Donut, FlowBars, donutRows } from './charts.jsx';

const FLOW_RANGES = [['1', 'M'], ['3', '3M'], ['6', '6M'], ['12', '1Y']];
const WHERE_RANGES = [['1', 'M'], ['3', '3M'], ['12', 'Y']];

function Box({ kind, icon, label, value, foot, onClick }) {
  return (
    <button type="button" className={`box ${kind}`} onClick={onClick}>
      <span className="box-top">
        <span className="box-icon"><Icon name={icon} size={20} /></span>
        <span className="box-label">{label}</span>
      </span>
      <span className="box-value">{value}</span>
      {foot && <span className="box-foot">{foot}</span>}
    </button>
  );
}

export function CashFlowPage({ txns, month, today, onDetail }) {
  const [range, setRange] = useState('1');
  const [picked, setPicked] = useState(null);
  const n = Number(range);
  const series = useMemo(() => monthSeries(txns, month, n), [txns, month, n]);
  // Boxes and the headline follow the range (24 Oct 2026: they used to show only the picked month).
  const cmp = useMemo(() => rangeCompare(txns, month, n, today), [txns, month, n, today]);
  const selected = series.some((g) => g.key === picked) ? picked : month;

  const prevName = n === 1 ? monthName(cmp.prevKey) : n === 12 ? 'the year before' : `the ${n} months before`;
  const footName = n === 1 ? monthName(cmp.prevKey) : n === 12 ? 'Year before' : `${n} months before`;
  const pct = pctChange(cmp.now.spent, cmp.prevThrough.spent);
  const by = cmp.isCurrent ? ' so far' : '';
  const foot = (text) => (cmp.hasPrev ? `${footName}: ${text}` : null);
  const saved = cmp.now.savedNet;
  const prevSaved = cmp.prevTotal.savedNet;

  return (
    <div className="detail-grid flow-grid">
      <div className="col">
        <section className="card flow-head" aria-label="Spending against last month">
          <span className="label">{n === 1 ? 'This month' : `Last ${n} months`}</span>
          {pct == null || !cmp.hasPrev ? (
            <span className="flow-headline">Nothing in {prevName} to compare with yet.</span>
          ) : Math.abs(pct) < 0.005 ? (
            <span className="flow-headline">Your spending{by} is the same as {prevName}</span>
          ) : (
            <span className="flow-headline">
              Your spending{by} is <strong className={pct > 0 ? 'text-out' : 'text-in'}>{Math.round(Math.abs(pct) * 100)}% {pct > 0 ? 'more' : 'less'}</strong> than {prevName}
            </span>
          )}
          <Segmented label="Range" value={range} onChange={setRange} options={FLOW_RANGES} />
          <FlowBars series={series} selectedKey={selected} onSelect={setPicked} />
        </section>
      </div>
      <div className="col">
        <div className="boxes" role="group" aria-label={n === 1 ? 'This month' : `Last ${n} months`}>
          <Box kind="in" icon="arrow-in" label="In" value={formatCents(cmp.now.income)}
            foot={foot(formatCents(cmp.prevTotal.income))} onClick={() => onDetail('income')} />
          <Box kind="out" icon="arrow-out" label="Spent" value={formatCents(cmp.now.spent)}
            foot={foot(formatCents(cmp.prevTotal.spent))} onClick={() => onDetail('spending')} />
          <Box kind="save" icon="piggy" label={saved >= 0 ? 'Saved' : 'From savings'} value={formatCents(Math.abs(saved))}
            foot={foot(`${formatCents(Math.abs(prevSaved))}${prevSaved < 0 ? ' from savings' : ' saved'}`)} onClick={() => onDetail('saved')} />
          <Box kind="invest" icon="trend" label="Invested" value={formatCents(cmp.now.invested)}
            foot={foot(formatCents(cmp.prevTotal.invested))} onClick={() => onDetail('invested')} />
        </div>
      </div>
    </div>
  );
}

// Up/down chip: spending UP is the spent color, spending DOWN is the income color.
function Chip({ change }) {
  if (change == null) return <span className="chg chg-new">New</span>;
  const p = Math.round(Math.abs(change) * 100);
  if (p === 0) return <span className="chg">0%</span>;
  return (
    <span className={`chg ${change > 0 ? 'chg-up' : 'chg-down'}`}>
      <Icon name={change > 0 ? 'arrow-up' : 'arrow-down'} size={13} />{p}%
    </span>
  );
}

export function WherePage({ txns, month, today, onDetail }) {
  const [range, setRange] = useState('1');
  const n = Number(range);
  const w = useMemo(() => whereCompare(txns, month, n, today), [txns, month, n, today]);
  const vs = n === 1 ? monthName(shiftMonth(month, -1)) : n === 3 ? 'the 3 months before' : 'the year before';
  const total = pctChange(w.total, w.prevTotal);
  const max = Math.max(1, ...w.rows.flatMap((r) => [r.cents, r.prev]));

  return (
    <div className="detail-grid where-grid">
      <div className="col">
        <section className="card" aria-label="Where it went">
          <Segmented label="Range" value={range} onChange={setRange} options={WHERE_RANGES} />
          {w.rows.length === 0
            ? <div className="empty small-empty">No spending in this period.</div>
            : <Donut rows={donutRows(w.rows)} total={w.total} />}
          <div className="where-vs">
            <span className="label">Compared with {vs}</span>
            <span className="row">
              <strong>{formatCents(w.total)}</strong>
              <span className="label">{w.prevTotal > 0 ? `${formatCents(w.prevTotal)} before` : 'Nothing before'}</span>
            </span>
            {total != null && <Chip change={total} />}
          </div>
        </section>
      </div>
      <div className="col">
        <section className="card" aria-label="By category">
          <div className="card-head"><span className="card-title head-out">By category</span></div>
          {w.rows.map((r) => (
            <button type="button" key={r.id} className="wrow" onClick={() => onDetail('spending', { category: r.id })}
              aria-label={`${r.name}: ${formatCents(r.cents)}. Open in Spending`}>
              <span className="where-icon"><CategoryIcon id={r.id} size={20} /></span>
              <span className="where-body">
                <span className="row">
                  <span className="name">{r.name}</span>
                  <span className="wrow-right"><span className="strong">{formatCents(r.cents)}</span><Chip change={r.change} /></span>
                </span>
                <span className="duo">
                  <Bar ratio={r.cents / max} status="out" label={`This period ${formatCents(r.cents)}`} />
                  <Bar ratio={r.prev / max} status="prev" label={`Before ${formatCents(r.prev)}`} />
                </span>
              </span>
            </button>
          ))}
          {w.rows.length > 0 && (
            <div className="legend"><span><i className="dot" style={{ background: 'var(--out)' }} />This period</span><span><i className="dot" style={{ background: 'var(--other)' }} />Before</span></div>
          )}
        </section>
      </div>
    </div>
  );
}
