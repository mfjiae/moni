import { useState } from 'react';
import { CategoryPicker } from './ui.jsx';
import { parseCents } from '../lib/money.js';
import { nowSydneyTime } from '../lib/dates.js';
import { addManual } from '../lib/store.js';

export default function AddTxn({ today, onDone, onToast }) {
  const [direction, setDirection] = useState('out');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(null);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const sign = direction === 'out' ? -1 : 1;

  async function save(e) {
    e.preventDefault();
    let cents;
    try { cents = parseCents(amount); } catch { cents = NaN; }
    if (!Number.isFinite(cents) || cents <= 0) return setError('Enter an amount, like 12.50');
    if (!description.trim()) return setError('Add a description, like the shop name');
    if (!categoryId) return setError('Pick a category');
    await addManual({
      date, time: date === today ? nowSydneyTime() : undefined,
      amountCents: sign * cents, description: description.trim(), categoryId, note: note.trim(),
    });
    onToast('Added');
    onDone();
  }

  return (
    <main className="screen">
      <header className="header"><div className="title">Add transaction</div></header>
      <form className="card form" onSubmit={save} noValidate>
        <div className="segmented" role="tablist" aria-label="Direction">
          <button type="button" role="tab" aria-selected={direction === 'out'} className={direction === 'out' ? 'on' : ''}
            onClick={() => { setDirection('out'); setCategoryId(null); }}>Money out</button>
          <button type="button" role="tab" aria-selected={direction === 'in'} className={direction === 'in' ? 'on' : ''}
            onClick={() => { setDirection('in'); setCategoryId(null); }}>Money in</button>
        </div>

        <label className="field">
          <span className="small">Amount (AUD)</span>
          <input className="input amount-input" inputMode="decimal" placeholder="0.00" value={amount}
            onChange={(e) => { setAmount(e.target.value); setError(''); }} />
        </label>

        <label className="field">
          <span className="small">Description</span>
          <input className="input" placeholder="e.g. Coffee, Cash at markets" value={description}
            onChange={(e) => { setDescription(e.target.value); setError(''); }} />
        </label>

        <div className="field">
          <span className="small">Category</span>
          <CategoryPicker value={categoryId} onChange={(id) => { setCategoryId(id); setError(''); }} amountCents={sign} />
        </div>

        <label className="field">
          <span className="small">Date</span>
          <input className="input" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} />
        </label>

        <label className="field">
          <span className="small">Note</span>
          <input className="input" placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" className="btn primary">Add</button>
        <p className="hint">If this purchase later shows up in a CSV import, moni swaps it for the bank's version so it isn't counted twice.</p>
      </form>
    </main>
  );
}
