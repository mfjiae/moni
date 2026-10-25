import { useState } from 'react';
import { CategorySelect } from './ui.jsx';
import { parseCents } from '../lib/money.js';
import { nowSydneyTime } from '../lib/dates.js';
import { addManual, addTransfer } from '../lib/store.js';
import { formatCents } from '../lib/money.js';
import { ACCOUNTS, MAIN, transferRow } from '../lib/accounts.js';

// One account picker for the Transfer tab: a native select, with the account's balance under its name.
function AccountPick({ label, value, onChange, est }) {
  const b = (id) => (id === MAIN ? est?.main : est?.savers?.[id]);
  const acc = ACCOUNTS.find((a) => a.id === value);
  const bal = b(value);
  return (
    <label className="field">
      <span className="small">{label}</span>
      <span className={`acc-pick${value === MAIN ? ' main' : ' save'}`}>
        <span className="acc-text">
          <span className="acc-name">{acc.name}</span>
          <span className="small">{bal ? formatCents(bal.cents) : 'No balance yet'}</span>
        </span>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 5l5 5 5-5" /></svg>
        <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
          {ACCOUNTS.map((a) => <option key={a.id} value={a.id}>{a.long}</option>)}
        </select>
      </span>
    </label>
  );
}

export default function AddTxn({ today, usage, est, onDone, onToast }) {
  const [direction, setDirection] = useState('out');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(null);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [from, setFrom] = useState('xx2066');
  const [to, setTo] = useState(MAIN);
  const transfer = direction === 'transfer';

  const sign = direction === 'out' ? -1 : 1;

  async function save(e) {
    e.preventDefault();
    let cents;
    try { cents = parseCents(amount); } catch { cents = NaN; }
    if (!Number.isFinite(cents) || cents <= 0) return setError('Enter an amount, like 12.50');
    if (transfer) {
      try { transferRow({ from, to, cents }); } catch (err) { return setError(err.message); }
      await addTransfer({ date, time: date === today ? nowSydneyTime() : undefined, from, to, cents, note: note.trim() });
      onToast('Transfer added');
      onDone();
      return;
    }
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
      <form className="card form add-form" onSubmit={save} noValidate>
        <div className="segmented" role="tablist" aria-label="Direction">
          <button type="button" role="tab" aria-selected={direction === 'out'} className={direction === 'out' ? 'on' : ''}
            onClick={() => { setDirection('out'); setCategoryId(null); }}>Money out</button>
          <button type="button" role="tab" aria-selected={direction === 'in'} className={direction === 'in' ? 'on' : ''}
            onClick={() => { setDirection('in'); setCategoryId(null); }}>Money in</button>
          <button type="button" role="tab" aria-selected={transfer} className={transfer ? 'on' : ''}
            onClick={() => { setDirection('transfer'); setError(''); }}>Transfer</button>
        </div>

        {transfer && (
          <div className="transfer-pick">
            <AccountPick label="From" value={from} onChange={(v) => { setFrom(v); setError(''); }} est={est} />
            <button type="button" className="swap-btn" aria-label="Swap From and To"
              onClick={() => { setFrom(to); setTo(from); setError(''); }}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3v12M3 12l3 3 3-3M12 15V3M9 6l3-3 3 3" /></svg>
            </button>
            <AccountPick label="To" value={to} onChange={(v) => { setTo(v); setError(''); }} est={est} />
          </div>
        )}

        <label className="field">
          <span className="small">Amount (AUD)</span>
          <input className="input amount-input" inputMode="decimal" placeholder="0.00" value={amount}
            onChange={(e) => { setAmount(e.target.value); setError(''); }} />
        </label>

        {!transfer && <label className="field">
          <span className="small">Description</span>
          <input className="input" placeholder="e.g. Coffee, Cash at markets" value={description}
            onChange={(e) => { setDescription(e.target.value); setError(''); }} />
        </label>}

        {!transfer && <div className="field">
          <span className="small">Category</span>
          <CategorySelect value={categoryId} onChange={(id) => { setCategoryId(id); setError(''); }} amountCents={sign}
            usage={usage} onToast={onToast} />
        </div>}

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
        <p className="hint">{transfer
          ? 'Counted once, as Saved. When either bank CSV arrives, moni matches it to this entry so nothing is counted twice.'
          : 'If this purchase later shows up in a CSV import, moni swaps it for the bank\'s version so it isn\'t counted twice.'}</p>
      </form>
    </main>
  );
}
