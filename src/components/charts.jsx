// Charts for Home and the Cash flow / Where it went pages. All money in cents.
import { useEffect, useRef, useState } from 'react';
import { formatCents } from '../lib/money.js';
import { monthShort } from '../lib/dates.js';

// Donut colors: the vivid palette without yellow; the last one is the "other" gray.
export const DONUT_COLORS = ['#FF7452', '#3DAEFF', '#BF7BFF', '#2EF2D4', '#FF8CC6', '#2BFF88', '#FFCB9A', '#B8B1A8'];
const DIM = '#4A4541';

// Biggest `max` categories for the donut; anything smaller is added up into "Everything else".
export function donutRows(rows, max = 8) {
  if (rows.length <= max) return rows;
  const rest = rows.slice(max - 1);
  const cents = rest.reduce((a, r) => a + r.cents, 0);
  return [...rows.slice(0, max - 1), { id: '__rest', name: 'Everything else', cents }];
}

// Donut with a legend. Hover (or tap) a slice or a legend row: that slice stays lit, the rest go gray,
// and the centre shows only that category's name and amount.
export function Donut({ rows, total, centerLabel = 'Spent', size = 190 }) {
  const [sel, setSel] = useState(null);
  const [hover, setHover] = useState(null);
  const on = hover ?? sel;
  const r = 70, sw = 26, C = 2 * Math.PI * r;
  const lens = rows.map((row) => (total > 0 ? (row.cents / total) * C : 0));
  const slices = rows.map((row, i) => ({ row, i, len: lens[i], start: lens.slice(0, i).reduce((a, x) => a + x, 0) }));
  const picked = on != null ? rows.find((x) => x.id === on) : null;
  const toggle = (id) => setSel((p) => (p === id ? null : id));

  return (
    <div className="donut-wrap">
      <div className="donut" style={{ width: size, height: size }}>
        <svg viewBox="0 0 200 200" width={size} height={size} role="img"
          aria-label={`Spending by category, total ${formatCents(total)}`}>
          <g transform="rotate(-90 100 100)">
            <circle cx="100" cy="100" r={r} fill="none" stroke="var(--track)" strokeWidth={sw} opacity="0.5" />
            {slices.map(({ row, i, len, start: st }) => (
              <circle key={row.id} cx="100" cy="100" r={r} fill="none" strokeWidth={on === row.id ? sw + 4 : sw}
                stroke={on == null || on === row.id ? DONUT_COLORS[i % DONUT_COLORS.length] : DIM}
                strokeDasharray={`${Math.max(len - 2, 0.5)} ${C - Math.max(len - 2, 0.5)}`} strokeDashoffset={-st}
                style={{ cursor: 'pointer', transition: 'stroke 120ms' }}
                onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(row.id)}
                onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
                onClick={() => toggle(row.id)} />
            ))}
          </g>
        </svg>
        <div className="donut-centre" aria-live="polite">
          {picked ? (
            <>
              <span className="donut-name">{picked.name}</span>
              <span className="donut-amount">{formatCents(picked.cents)}</span>
            </>
          ) : (
            <>
              <span className="donut-name">{centerLabel}</span>
              <span className="donut-amount">{formatCents(total)}</span>
            </>
          )}
        </div>
      </div>
      <ul className="donut-legend">
        {rows.map((row, i) => (
          <li key={row.id}>
            <button type="button" className={`leg${on === row.id ? ' lit' : ''}${on != null && on !== row.id ? ' dim' : ''}`}
              aria-pressed={sel === row.id} onClick={() => toggle(row.id)}
              onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(row.id)}
              onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}>
              <i className="dot" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
              <span className="leg-name">{row.name}</span>
              <span className="leg-pct">{total > 0 ? `${Math.round((row.cents / total) * 100)}%` : ''}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const FLOW = [
  ['income', 'In', 'in'],
  ['spent', 'Spent', 'out'],
  ['saved', 'Saved', 'save'],
  ['invested', 'Invested', 'invest'],
];

// Cash flow bars: one group of four bars per month (In, Spent, Saved, Invested). Scrolls sideways when
// there are many months. Tap a group to read its numbers.
export function FlowBars({ series, selectedKey, onSelect }) {
  const scroll = useRef(null);
  const max = Math.max(1, ...series.flatMap((g) => FLOW.map(([k]) => Math.max(g[k], 0))));
  const one = series.length === 1;
  const shown = series.find((g) => g.key === selectedKey) ?? series[series.length - 1];

  useEffect(() => {
    const el = scroll.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [series.length]);

  return (
    <div className="flow">
      <div className="flow-read" aria-live="polite">
        {FLOW.map(([k, label, c]) => (
          <span key={k} className="flow-item"><i className="dot" style={{ background: `var(--${c})` }} />
            <span className="small">{label}</span>
            <strong className={`text-${c}`}>{formatCents(shown[k], k === 'saved' ? { sign: true } : undefined)}</strong>
          </span>
        ))}
      </div>
      <div className="flow-scroll" ref={scroll}>
        <div className={`flow-bars${one ? ' one' : ''}`} style={one ? undefined : { minWidth: series.length * 68 }}>
          {series.map((g) => (
            <button type="button" key={g.key} className={`flow-group${g.key === shown.key ? ' on' : ''}`}
              aria-pressed={g.key === shown.key} onClick={() => onSelect(g.key)}
              aria-label={`${monthShort(g.key)}: in ${formatCents(g.income)}, spent ${formatCents(g.spent)}, saved ${formatCents(g.saved)}, invested ${formatCents(g.invested)}`}>
              <span className="flow-cols">
                {FLOW.map(([k, , c]) => (
                  <i key={k} className="flow-col" style={{ height: `${Math.max((Math.max(g[k], 0) / max) * 100, g[k] > 0 ? 2 : 0)}%`, background: `var(--${c})` }} />
                ))}
              </span>
              <span className="flow-label">{monthShort(g.key)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Six small bars for one number over the last months; the picked month is bright.
export function MiniBars({ points, color, selectedKey }) {
  const max = Math.max(1, ...points.map((p) => Math.max(p.cents, 0)));
  return (
    <div className="mini" role="img" aria-label={points.map((p) => `${monthShort(p.key)} ${formatCents(p.cents)}`).join(', ')}>
      {points.map((p) => (
        <span key={p.key} className={`mini-col${p.key === selectedKey ? ' on' : ''}`} title={`${monthShort(p.key)}: ${formatCents(p.cents)}`}>
          <span className="mini-val">{p.key === selectedKey ? formatCents(p.cents) : ''}</span>
          <i style={{ height: `${Math.max((Math.max(p.cents, 0) / max) * 100, p.cents > 0 ? 3 : 0)}%`, background: `var(--${color})` }} />
          <span className="mini-label">{monthShort(p.key)}</span>
        </span>
      ))}
    </div>
  );
}
