// M5 Bills (Ken, 26 Oct 2026, "UI locked": page C timeline, H1 rent pill opens it, T2 tuition link).
// Logic in ../lib/bills.js. Prototype: "moni M5 Bills prototypes" canvas (C-phone, C-desktop, Flows).
import { useMemo, useState } from 'react';
import { Sheet, CategorySelect } from './ui.jsx';
import { formatCents, parseCents } from '../lib/money.js';
import { longDay, daysBetween, monthShort, monthKey } from '../lib/dates.js';
import { billsView, detectBills, EVERY, stepDate } from '../lib/bills.js';
import { billDisplayName } from '../lib/names.js';
import { saveBill, deleteBill, confirmBill, dismissBill } from '../lib/store.js';

// Shortest rhythm first (Ken, 26 Oct 2026): All, (Weekly when there is one), Fortnightly, Monthly, Half-yearly.
const FILTERS = [['all', 'All'], ['fortnightly', 'Fortnightly'], ['monthly', 'Monthly'], ['halfyearly', 'Half-yearly']];
const monthYear = (iso) => `${monthShort(monthKey(iso))} ${iso.slice(0, 4)}`;
// $1.9k / $45, like the prototype's per-month bars.
const kDollars = (c) => (c >= 100000 ? `$${(c / 100000).toFixed(1)}k` : `$${Math.round(c / 100)}`);
const shortDate = (iso) => `${Number(iso.slice(8))} ${monthShort(monthKey(iso))}`;

function whenText(item, today) {
  if (item.status === 'paid') return `${longDay(item.paidDate ?? item.due)} · paid`;
  if (item.status === 'late') return `${longDay(item.due)} · no payment seen yet`;
  const d = daysBetween(today, item.due);
  return `${longDay(item.due)} · ${d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`}`;
}

// "Later" rows show the exact date and distance like the rows above them (Ken, 26 Oct 2026).
// Tuition stays month-only: its date follows the semester start, so a day would be a guess.
const isTuitionBill = (bill) => bill.key === 'cat:tuition' || bill.categoryId === 'tuition';
function laterText(item, today) {
  return isTuitionBill(item.bill) ? `${monthYear(item.due)} · later` : whenText(item, today);
}

function TimelineRow({ item, today, onEdit, onDetail, last }) {
  const { bill, status } = item;
  const dot = status === 'paid' ? 'paid' : status === 'late' ? 'late' : status === 'later' ? 'later' : 'due';
  const soon = status === 'due' && daysBetween(today, item.due) <= 3;
  return (
    <div className="tl">
      <span className="tl-rail" aria-hidden="true"><i className={`tl-dot ${dot}${soon ? ' soon' : ''}`} />{!last && <b />}</span>
      <div className="tl-body">
        <button type="button" className="tl-main" onClick={() => onEdit(bill)} aria-label={`${billDisplayName(bill)}, ${formatCents(item.cents)}, ${status === 'later' ? laterText(item, today) : whenText(item, today)}. Edit bill`}>
          <span className={`small tl-when${soon ? ' soon' : ''}${status === 'late' ? ' text-review' : ''}`}>
            {status === 'later' ? laterText(item, today) : whenText(item, today)}
          </span>
          <span className="tl-line">
            <span className="tl-name">{billDisplayName(bill)}</span>
            {status !== 'paid' && <span className="bill-chip">{EVERY[bill.every].label}</span>}
            <span className={`tl-amt${status === 'paid' ? ' muted' : ''}`}>{formatCents(item.cents)}</span>
          </span>
        </button>
        {bill.key === 'cat:tuition' && <button type="button" className="link tl-link" onClick={() => onDetail('tuition')}>View semester history ›</button>}
      </div>
    </div>
  );
}

function MonthBars({ months, today }) {
  const max = Math.max(1, ...months.map((m) => m.paid + m.toPay));
  const cur = monthKey(today);
  return (
    <section className="card" aria-label="Bills per month">
      <div className="card-head"><span className="card-title plain">Per month</span><span className="small">paid vs planned</span></div>
      <div className="bill-months">
        {months.map((m) => (
          <div className="row bill-month" key={m.key}>
            <span className={`small bm-label${m.key === cur ? ' cur' : ''}`}>{monthShort(m.key)}</span>
            <span className="bm-track" role="img" aria-label={`${monthShort(m.key)}: paid ${formatCents(m.paid)}${m.toPay ? `, still to pay ${formatCents(m.toPay)}` : ''}`}>
              <span className="bm-paid" style={{ width: `${(m.paid / max) * 100}%` }} />
              {m.toPay > 0 && <span className="bm-due" style={{ width: `${Math.max((m.toPay / max) * 100, 1.5)}%` }} />}
            </span>
            <span className="bm-amt">{kDollars(m.paid + m.toPay)}</span>
          </div>
        ))}
      </div>
      <span className="small">Blue = paid, orange = still to pay this month.</span>
    </section>
  );
}

function FoundCard({ found, onConfirm, onToast }) {
  const s = found[0];
  return (
    <section className="card found-card" aria-label="Found by moni">
      <div className="card-head"><span className="card-title plain text-review">Looks like a bill</span><span className="found-chip">{found.length} found</span></div>
      <span className="found-text">{billDisplayName(s)} · {formatCents(s.cents)} {EVERY[s.every].label.toLowerCase()}. Seen {s.seen.length} times in a row.</span>
      <div className="btn-row">
        <button type="button" className="btn primary" onClick={() => onConfirm(s)}>Add as bill</button>
        <button type="button" className="btn" onClick={async () => { await dismissBill(s.key); onToast(`moni won't suggest ${billDisplayName(s)} again`); }}>Not a bill</button>
      </div>
    </section>
  );
}

export default function Bills({ txns, bills, today, usage, onDetail, onToast }) {
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);     // a bill record, or {} for a new one
  const [confirming, setConfirming] = useState(null);
  const v = useMemo(() => billsView(bills, txns, today, filter), [bills, txns, today, filter]);
  const found = useMemo(() => detectBills(txns, bills, today), [txns, bills, today]);
  const hasWeekly = bills.some((b) => b.every === 'weekly' && !b.dismissed);
  // Same test as the Tuition card on Spending: show the way in only when there is tuition.
  const hasTuition = useMemo(() => txns.some((t) => t.categoryId === 'tuition' && t.kind === 'spend'), [txns]);
  const filters = hasWeekly ? [...FILTERS.slice(0, 1), ['weekly', 'Weekly'], ...FILTERS.slice(1)] : FILTERS;

  const past = v.timeline.filter((x) => x.due < today || (x.status === 'paid' && x.due <= today));
  const ahead = v.timeline.filter((x) => !past.includes(x));
  const rows = [...ahead, ...v.later.map((x) => ({ ...x, status: 'later' }))];

  return (
    <main className="screen bills">
      <header className="header">
        <div className="title">Bills</div>
        <div className="bills-actions">
          {hasTuition && <button type="button" className="btn small-btn add-bill tuition-pill" onClick={() => onDetail('tuition')}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9l10-5 10 5-10 5-10-5z" /><path d="M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5" /><path d="M22 9v6" /></svg>Tuition ›</button>}
          <button type="button" className="btn small-btn add-bill" onClick={() => setEditing({})}>+ Add bill</button>
        </div>
      </header>
      <div className="fchips bill-filters" role="group" aria-label="How often">
        {filters.map(([id, label]) => (
          <button key={id} type="button" className={`bill-fc${filter === id ? ' on' : ''}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      <div className="bills-grid">
        <section className="card" aria-label="Next 30 days">
          <div className="card-head"><span className="card-title plain">Next 30 days</span><span className="small">{formatCents(v.dueCents)} due</span></div>
          <span className="small tl-today">Today · {longDay(today)}</span>
          {v.count === 0 ? (
            <div className="empty small-empty">No bills yet. Add one, or add one moni found.</div>
          ) : (
            <div className="timeline">
              {past.map((x) => <TimelineRow key={`${x.bill.uid}${x.due}`} item={x} today={today} onEdit={setEditing} onDetail={onDetail} />)}
              {rows.map((x, i) => <TimelineRow key={`${x.bill.uid}${x.due}`} item={x} today={today} onEdit={setEditing} onDetail={onDetail} last={i === rows.length - 1} />)}
            </div>
          )}
        </section>
        <div className="col">
          <MonthBars months={v.months} today={today} />
          {found.length > 0 && <FoundCard found={found} onConfirm={setConfirming} onToast={onToast} />}
        </div>
      </div>
      {editing && <BillSheet bill={editing} today={today} usage={usage} onToast={onToast} onClose={() => setEditing(null)} />}
      {confirming && <ConfirmSheet s={confirming} onToast={onToast} onClose={() => setConfirming(null)} />}
    </main>
  );
}

// The next due date on or after today (what the edit sheet shows).
function nextDue(bill, today) {
  if (!bill.anchor) return today;
  let n = 0;
  if (bill.anchor < today) { while (stepDate(bill.anchor, bill.every, n) < today) n++; }
  return stepDate(bill.anchor, bill.every, n);
}

function EveryChips({ value, onChange, ids }) {
  return (
    <div className="every-chips" role="group" aria-label="How often">
      {ids.map((id) => (
        <button key={id} type="button" className={`every-chip${value === id ? ' on' : ''}`} aria-pressed={value === id} onClick={() => onChange(id)}>{EVERY[id].label}</button>
      ))}
    </div>
  );
}

// Add a bill by hand, or change / delete one (prototype Flows, left).
export function BillSheet({ bill, today, usage, onToast, onClose }) {
  const isNew = !bill.uid;
  const [name, setName] = useState(bill.name ?? '');
  const [amount, setAmount] = useState(bill.cents ? (bill.cents / 100).toFixed(2) : '');
  const [every, setEvery] = useState(bill.every ?? 'monthly');
  const [due, setDue] = useState(() => nextDue(bill, today));
  const [categoryId, setCategoryId] = useState(bill.categoryId ?? null);
  const [error, setError] = useState('');
  const [sure, setSure] = useState(false);

  async function save() {
    let cents = null;
    try { cents = parseCents(amount); } catch { cents = null; }
    if (!name.trim()) return setError('Give the bill a name');
    if (!(cents > 0)) return setError('Type the amount, like 26.80');
    if (!due) return setError('Pick the next due date');
    if (!categoryId) return setError('Pick a category');
    await saveBill({ ...(isNew ? {} : bill), name: name.trim(), cents, every, anchor: due, categoryId, since: isNew ? due : bill.since });
    onToast(isNew ? `${name.trim()} added` : 'Saved');
    onClose();
  }
  async function remove() {
    if (!sure) { setSure(true); return; }
    await deleteBill(bill.uid);
    onToast(`${bill.name} removed from bills`);
    onClose();
  }

  return (
    <Sheet title={isNew ? 'Add a bill' : 'Edit bill'} onClose={onClose} handle>
      <div className="sheet-body">
        <label className="field"><span className="small">Name</span>
          <input className="input" value={name} placeholder="e.g. Phone" onChange={(e) => { setName(e.target.value); setError(''); }} /></label>
        <label className="field"><span className="small">Amount</span>
          <input className="input" inputMode="decimal" value={amount} placeholder="$0.00" onChange={(e) => { setAmount(e.target.value); setError(''); }} /></label>
        <div className="field"><span className="small">How often</span><EveryChips value={every} onChange={setEvery} ids={['weekly', 'fortnightly', 'monthly', 'halfyearly']} /></div>
        <label className="field"><span className="small">Next due date</span>
          <input className="input" type="date" value={due} onChange={(e) => { setDue(e.target.value); setError(''); }} /></label>
        <div className="field"><span className="small">Pick a category (so it counts in Spending)</span>
          <CategorySelect value={categoryId} onChange={(id) => { setCategoryId(id); setError(''); }} amountCents={-1} usage={usage} onToast={onToast} /></div>
        {error && <span className="small text-over" role="alert">{error}</span>}
        <div className="btn-row sheet-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" onClick={save}>Save bill</button>
        </div>
        {!isNew && <button type="button" className="btn danger" onClick={remove}>{sure ? `Tap again to remove ${bill.name}` : 'Remove bill'}</button>}
      </div>
    </Sheet>
  );
}

// "Looks like a bill": check moni's guess before it counts (prototype Flows, right).
export function ConfirmSheet({ s, onToast, onClose }) {
  const [every, setEvery] = useState(s.every);
  const ids = ['fortnightly', 'monthly', 'halfyearly'];
  if (s.every === 'weekly') ids.unshift('weekly');
  async function add() {
    await confirmBill(s, every);
    onToast(`${billDisplayName(s)} added as a ${EVERY[every].label.toLowerCase()} bill`);
    onClose();
  }
  async function no() {
    await dismissBill(s.key);
    onToast(`moni won't suggest ${billDisplayName(s)} again`);
    onClose();
  }
  return (
    <Sheet title="Looks like a bill" onClose={onClose} handle>
      <div className="sheet-body">
        <span className="confirm-lead">moni saw the same payment {s.seen.length} times, about {s.every === 'halfyearly' ? 'six months' : s.every === 'monthly' ? 'a month' : s.every === 'fortnightly' ? 'two weeks' : 'a week'} apart. Check it before it counts as a bill.</span>
        <div className="confirm-box">
          <div className="row"><strong>{billDisplayName(s)}</strong><strong>{formatCents(s.cents)}</strong></div>
          <span className="small">Seen: {s.seen.map(shortDate).join(' · ')}</span>
          <span className="small">Guess: {EVERY[s.every].label.toLowerCase()}, next about {shortDate(s.next)}</span>
        </div>
        <div className="field"><span className="small">How often (change if moni guessed wrong)</span><EveryChips value={every} onChange={setEvery} ids={ids} /></div>
        <button type="button" className="btn primary" onClick={add}>Add as {EVERY[every].label.toLowerCase()} bill</button>
        <button type="button" className="btn" onClick={no}>Not a bill (don't ask again)</button>
      </div>
    </Sheet>
  );
}
