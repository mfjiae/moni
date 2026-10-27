// Savings goal card + setup sheet (Ken, 27 Oct 2026, batch 3, option A), on the Saved page.
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db.js';
import { formatCents, parseCents } from '../lib/money.js';
import { longDay } from '../lib/dates.js';
import { goalView } from '../lib/goals.js';
import { setGoal, clearGoal } from '../lib/store.js';
import { SAVERS } from '../lib/accounts.js';
import { Sheet } from './ui.jsx';

export function useGoal() {
  const g = useLiveQuery(() => db.meta.get('goal'), []);
  return g && !g.removed ? g : null;
}

function GoalSheet({ goal, today, onClose }) {
  const [name, setName] = useState(goal?.name ?? '');
  const [amount, setAmount] = useState(goal ? (goal.targetCents / 100).toFixed(2) : '');
  const [by, setBy] = useState(goal?.byDate ?? '');
  const [error, setError] = useState('');
  async function save() {
    let cents = null;
    try { cents = parseCents(amount); } catch { cents = null; }
    if (!cents || cents <= 0) { setError('Enter a target, like 5000.00'); return; }
    if (!by) { setError('Pick a date'); return; }
    if (by <= today) { setError('Pick a date after today'); return; }
    try {
      await setGoal({ name, targetCents: cents, byDate: by, startDate: goal?.startDate ?? today });
      onClose();
    } catch (e) { setError(e.message); }
  }
  async function remove() { await clearGoal(); onClose(); }
  return (
    <Sheet title={goal ? 'Edit savings goal' : 'Set a savings goal'} onClose={onClose}>
      <div className="sheet-body">
        <label className="field">
          <span className="small">Name</span>
          <input className="input" value={name} placeholder="e.g. Holiday" aria-label="Goal name" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span className="small">Target (AUD)</span>
          <input className="input amount-input" inputMode="decimal" value={amount} aria-label="Target amount" onChange={(e) => { setAmount(e.target.value); setError(''); }} />
        </label>
        <label className="field">
          <span className="small">Save it by</span>
          <input className="input" type="date" value={by} min={today} aria-label="Goal date" onChange={(e) => { setBy(e.target.value); setError(''); }} />
        </label>
        <p className="hint">Counts money you move into your savings accounts{goal ? ` since ${longDay(goal.startDate)}` : ' from today'}, minus money you move back out. Interest does not count.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="button" className="btn primary" onClick={save}>Save goal</button>
        {goal && <button type="button" className="btn ghost" onClick={remove}>Remove goal</button>}
      </div>
    </Sheet>
  );
}

export default function GoalCard({ txns, today, savingsCents }) {
  const goal = useGoal();
  const [editing, setEditing] = useState(false);
  if (!goal) {
    return (
      <section className="card goal-card" aria-label="Savings goal">
        <div className="card-head"><span className="card-title head-save">Savings goal</span></div>
        <p className="small">Save $X by a date and watch it fill up here.</p>
        <button type="button" className="btn ghost small-btn goal-set" onClick={() => setEditing(true)}>Set a goal</button>
        {editing && <GoalSheet goal={null} today={today} onClose={() => setEditing(false)} />}
      </section>
    );
  }
  const v = goalView(goal, txns, today);
  const chip = v.status === 'done' ? { text: 'Goal reached', cls: 'ok' }
    : v.status === 'late' ? { text: `Past the date · ${formatCents(v.left)} to go`, cls: 'warn' }
    : v.status === 'behind' ? { text: `Behind · ${formatCents(v.perWeek)}/week to catch up`, cls: 'warn' }
    : { text: `On track · ${formatCents(v.perWeek)}/week`, cls: 'ok' };
  return (
    <section className="card goal-card" aria-label="Savings goal">
      <div className="card-head">
        <span className="card-title head-save">{goal.name}</span>
        <button type="button" className="link" onClick={() => setEditing(true)}>Edit</button>
      </div>
      <div className="goal-sub small">by {longDay(goal.byDate)}</div>
      <div className="goal-amt"><strong>{formatCents(Math.max(v.saved, 0))}</strong> <span className="small">of {formatCents(v.target)}</span></div>
      <div className="goal-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v.pct} aria-label="Goal progress">
        <i style={{ width: `${v.pct}%` }} />
        {v.status !== 'done' && <b style={{ left: `${v.markPct}%` }} aria-hidden="true" />}
      </div>
      <div className="goal-line">
        <span>{v.pct}%{v.left > 0 ? ` · ${formatCents(v.left)} to go` : ''}</span>
        <span className={`goal-chip ${chip.cls}`}>{chip.text}</span>
      </div>
      {savingsCents != null && (
        <div className="small goal-bal">Savings balance now: {formatCents(savingsCents)} <span className="goal-note">(includes interest and what was there before)</span></div>
      )}
      {editing && <GoalSheet goal={goal} today={today} onClose={() => setEditing(false)} />}
    </section>
  );
}
