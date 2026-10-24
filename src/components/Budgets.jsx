// Budgets (M3, Ken 24 Oct 2026, layout C "needs attention first", rent option D).
// Summary card, then Over budget / Spending faster than the month / On track.
// One amount per category, same every month; a change applies from the current month on.
import { useMemo, useState } from 'react';
import { formatCents, parseCents } from '../lib/money.js';
import { monthKey, monthLabel } from '../lib/dates.js';
import { categoryName } from '../lib/categories.js';
import {
  budgetOverview, budgetableCategories, budgetsForMonth, parseBudgetList, rentStatusText, RENT_ID,
} from '../lib/budgets.js';
import { setBudget, setBudgets } from '../lib/store.js';
import { Bar, MonthSwitch, Segmented, Sheet } from './ui.jsx';
import { CategoryIcon, Icon } from './icons.jsx';

const RENT_KEY = 'moni.budgets.rent';
const loadRent = () => { try { return localStorage.getItem(RENT_KEY) === 'with'; } catch { return false; } };
const saveRent = (v) => { try { localStorage.setItem(RENT_KEY, v ? 'with' : 'without'); } catch { /* per-viewer convenience only */ } };

function Row({ r, pace, onOpen }) {
  const over = r.spent > r.limitCents;
  const inner = (
    <>
      <span className={`bud-icon${over ? ' over' : ''}`}><CategoryIcon id={r.id} size={20} /></span>
      <span className="bud-body">
        <span className="bud-line">
          <span className="bud-name">{r.name}</span>
          <span className="bud-amt"><strong className={over ? 'text-over' : ''}>{formatCents(r.spent)}</strong> of {formatCents(r.limitCents)}</span>
        </span>
        <Bar ratio={r.ratio} status={over ? 'over' : 'ok'} pace={pace}
          label={`${r.name}: ${formatCents(r.spent)} of ${formatCents(r.limitCents)}`} />
      </span>
    </>
  );
  return r.fixed
    ? <div className="bud-row fixed">{inner}</div>
    : <button type="button" className="bud-row" onClick={() => onOpen(r)} aria-label={`${r.name}, ${formatCents(r.spent)} of ${formatCents(r.limitCents)}. Edit budget`}>{inner}</button>;
}

function Group({ title, tone, rows, pace, onOpen, note }) {
  if (!rows.length) return null;
  return (
    <section className="card bud-group" aria-label={title}>
      <div className="card-head">
        <span className={`card-title plain bud-title ${tone}`}>{title}</span>
        <span className="small">{rows.length}</span>
      </div>
      {note && <div className="small bud-note">{note}</div>}
      <div className="bud-list">{rows.map((r) => <Row key={r.id} r={r} pace={pace} onOpen={onOpen} />)}</div>
    </section>
  );
}

function Summary({ o, month }) {
  const over = o.left < 0;
  const head = o.isCurrent ? (over ? 'over budget' : 'left to spend') : (over ? 'over budget' : 'left');
  const bits = [`Spent ${formatCents(o.spent)} of ${formatCents(o.total)}`];
  if (o.daysLeft != null) bits.push(o.daysLeft === 0 ? 'Last day' : `${o.daysLeft} ${o.daysLeft === 1 ? 'day' : 'days'} left`);
  return (
    <section className="card bud-summary" aria-label={`Budget summary for ${monthLabel(month)}`}>
      <div className="bud-big"><span className={over ? 'text-over' : ''}>{formatCents(Math.abs(o.left))}</span> <span className="bud-big-label">{head}</span></div>
      <Bar thick ratio={o.total ? o.spent / o.total : 0} status={over ? 'over' : 'ok'} pace={o.isCurrent ? o.pace : undefined}
        label={`${formatCents(o.spent)} spent of ${formatCents(o.total)}`} />
      <div className="small">{bits.join(' · ')}{o.overCount > 0 && <> {'· '}<span className="text-over">{o.overCount} over</span></>}</div>
    </section>
  );
}

function FixedBills({ rent, isCurrent, rentAmountShown }) {
  if (!rent.shown) return null;
  const st = rentStatusText(rent, isCurrent);
  const cents = rent.status === 'paid' ? rent.paidCents : rent.usual;
  return (
    <section className="card bud-fixed" aria-label="Fixed bills">
      <div className="card-head"><span className="card-title plain">Fixed bills</span></div>
      <div className="bud-fixed-row">
        <span className="bud-icon"><CategoryIcon id={RENT_ID} size={20} /></span>
        <span className="bud-fixed-name">{categoryName(RENT_ID)}</span>
        <span className={`bud-fixed-status ${st.tone}`}>{st.text}</span>
        <strong>{formatCents(cents)}</strong>
      </div>
      {!rentAmountShown && <div className="small">Rent is not part of the total above. Switch to “With rent” to include it.</div>}
    </section>
  );
}

// Add a budget, or edit / remove one. Applies from the current month on.
function BudgetSheet({ edit, free, plans, current, onClose, onToast }) {
  const [categoryId, setCategoryId] = useState(edit?.id ?? free[0]?.id ?? '');
  const startCents = edit ? (budgetsForMonth(plans, current).get(edit.id) ?? edit.limitCents) : 0;
  const [text, setText] = useState(edit ? (startCents / 100).toFixed(2).replace(/\.00$/, '') : '');
  const [past, setPast] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (cents) => {
    setBusy(true);
    try {
      await setBudget(categoryId, cents, current, past);
      onToast(cents > 0 ? `${categoryName(categoryId)} budget: ${formatCents(cents)} a month` : `${categoryName(categoryId)} budget removed`);
      onClose();
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  const save = () => {
    let cents;
    try { cents = parseCents(text); } catch { setErr('Type an amount, like 50 or 49.90'); return; }
    if (cents <= 0) { setErr('The amount must be above $0 (use Remove to delete a budget)'); return; }
    run(cents);
  };

  return (
    <Sheet title={edit ? `${edit.name} budget` : 'Add a budget'} onClose={onClose}>
      <div className="sheet-body">
        {!edit && (
          free.length ? (
            <label className="field"><span className="label">Category</span>
              <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {free.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          ) : <div className="small">Every category you can budget already has one.</div>
        )}
        {(edit || free.length > 0) && (
          <>
            <label className="field"><span className="label">Amount per month</span>
              <input className="input amount-input" inputMode="decimal" placeholder="$0" value={text} autoFocus
                onChange={(e) => { setText(e.target.value); setErr(''); }} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
            </label>
            <label className="check"><input type="checkbox" checked={past} onChange={(e) => setPast(e.target.checked)} />
              <span>Also change past months</span></label>
            <div className="small">Starts in {monthLabel(current)}{past ? ' and goes back to the beginning.' : '; earlier months keep their old amount.'}</div>
            {err && <div className="text-over small" role="alert">{err}</div>}
            <div className="btn-row">
              <button type="button" className="btn primary" disabled={busy} onClick={save}>Save</button>
              {edit && <button type="button" className="btn danger" disabled={busy} onClick={() => run(0)}>Remove budget</button>}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

// Paste a list: one "Category amount" per line. Amounts are typed here, never stored in the code.
function PasteSheet({ current, onClose, onToast }) {
  const [text, setText] = useState('');
  const [past, setPast] = useState(false);
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => parseBudgetList(text), [text]);
  const total = parsed.ok.reduce((s, o) => s + o.cents, 0);
  const save = async () => {
    setBusy(true);
    await setBudgets(parsed.ok, current, past);
    onToast(`Saved ${parsed.ok.length} ${parsed.ok.length === 1 ? 'budget' : 'budgets'}`);
    onClose();
  };
  return (
    <Sheet title="Paste a list" onClose={onClose}>
      <div className="sheet-body">
        <label className="field"><span className="label">One category and amount per line</span>
          <textarea className="input bud-paste" rows={8} value={text} autoFocus placeholder={'Groceries 300\nEating out & takeaway 100'}
            onChange={(e) => setText(e.target.value)} />
        </label>
        {parsed.ok.length > 0 && (
          <div className="bud-preview" aria-label="What will be saved">
            {parsed.ok.map((o) => <div key={o.categoryId} className="bud-prev-row"><span>{o.name}</span><strong>{formatCents(o.cents)}</strong></div>)}
            <div className="bud-prev-row total"><span>Total a month</span><strong>{formatCents(total)}</strong></div>
          </div>
        )}
        {parsed.bad.length > 0 && (
          <div className="bud-bad" role="alert">
            {parsed.bad.map((b, i) => <div key={i} className="small"><span className="text-over">{b.reason}:</span> {b.line}</div>)}
          </div>
        )}
        <label className="check"><input type="checkbox" checked={past} onChange={(e) => setPast(e.target.checked)} />
          <span>Also change past months</span></label>
        <div className="small">Categories that already have a budget get the new amount from {monthLabel(current)} on.</div>
        <button type="button" className="btn primary" disabled={busy || parsed.ok.length === 0} onClick={save}>
          {parsed.ok.length ? `Save ${parsed.ok.length} ${parsed.ok.length === 1 ? 'budget' : 'budgets'}` : 'Save'}
        </button>
      </div>
    </Sheet>
  );
}

export default function Budgets({ txns, plans, today, month, setMonth, firstMonth, onToast }) {
  const current = monthKey(today);
  const [withRent, setWithRent] = useState(loadRent);
  const [sheet, setSheet] = useState(null);   // { type: 'add' | 'edit' | 'paste', row? }
  const o = useMemo(() => budgetOverview(txns, plans, month, today, { withRent }), [txns, plans, month, today, withRent]);
  const free = useMemo(() => {
    const have = budgetsForMonth(plans, current);
    return budgetableCategories().filter((c) => !have.has(c.id));
  }, [plans, current]);
  const pace = o.isCurrent ? o.pace : undefined;
  const none = plans.length === 0;

  return (
    <main className="screen budgets">
      <header className="header">
        <div className="title">Budgets</div>
        <MonthSwitch month={month} setMonth={setMonth} current={current} first={firstMonth} />
      </header>

      <div className="bud-controls">
        <Segmented label="Rent" value={withRent ? 'with' : 'without'} onChange={(v) => { setWithRent(v === 'with'); saveRent(v === 'with'); }}
          options={[['without', 'Without rent'], ['with', 'With rent']]} />
        <div className="btn-row">
          <button type="button" className="btn small-btn" onClick={() => setSheet({ type: 'add' })}><Icon name="tag" size={16} /> Add budget</button>
          <button type="button" className="btn small-btn" onClick={() => setSheet({ type: 'paste' })}><Icon name="list" size={16} /> Paste a list</button>
        </div>
      </div>

      {!o.has ? (
        <section className="card bud-empty">
          <div className="empty small-empty">
            {none ? 'No budgets yet. Add one, or paste your list.' : `No budgets were set for ${monthLabel(month)}.`}
          </div>
        </section>
      ) : (
        <div className="bud-grid">
          <div className="col">
            <Summary o={o} month={month} />
            <FixedBills rent={o.rent} isCurrent={o.isCurrent} rentAmountShown={withRent} />
          </div>
          <div className="col">
            <Group title="Over budget" tone="over" rows={o.over} pace={pace} onOpen={(r) => setSheet({ type: 'edit', row: r })} />
            <Group title="Spending faster than the month" tone="faster" rows={o.faster} pace={pace}
              note="Used more of the budget than the month has gone." onOpen={(r) => setSheet({ type: 'edit', row: r })} />
            <Group title="On track" tone="ok" rows={o.onTrack} pace={pace} onOpen={(r) => setSheet({ type: 'edit', row: r })} />
          </div>
        </div>
      )}

      {sheet?.type === 'add' && <BudgetSheet free={free} plans={plans} current={current} onClose={() => setSheet(null)} onToast={onToast} />}
      {sheet?.type === 'edit' && <BudgetSheet edit={sheet.row} free={free} plans={plans} current={current} onClose={() => setSheet(null)} onToast={onToast} />}
      {sheet?.type === 'paste' && <PasteSheet current={current} onClose={() => setSheet(null)} onToast={onToast} />}
    </main>
  );
}
