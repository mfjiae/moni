import { useState } from 'react';
import { Sheet, CategoryPicker } from './ui.jsx';
import { formatCents } from '../lib/money.js';
import { longDay } from '../lib/dates.js';
import { isPersonTransfer, merchantKey } from '../lib/rules.js';
import { setCategory, saveRule, deleteTxn } from '../lib/store.js';

export default function TxnSheet({ txn, onClose, onToast }) {
  const [categoryId, setCategoryId] = useState(txn.categoryId ?? null);
  const [note, setNote] = useState(txn.note ?? '');
  const person = isPersonTransfer(txn.description);
  const canLearn = txn.source === 'csv' && !person;
  const [always, setAlways] = useState(canLearn && txn.kind === 'review');
  const [keyword, setKeyword] = useState(merchantKey(txn.description));
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    if (!categoryId) return;
    await setCategory(txn.uid, categoryId, note);
    let msg = 'Saved';
    if (canLearn && always && keyword.trim()) {
      const n = await saveRule(keyword, categoryId, txn.uid);
      msg = n ? `Saved. Also sorted ${n} more from ${keyword.trim().toUpperCase()}` : `Saved. ${keyword.trim().toUpperCase()} will be sorted automatically`;
    }
    onToast(msg);
    onClose();
  }

  async function remove() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    await deleteTxn(txn.uid);
    onToast('Deleted');
    onClose();
  }

  return (
    <Sheet title={txn.kind === 'review' ? 'Pick a category' : 'Transaction'} onClose={onClose}>
      <div className="sheet-body">
        <div className="detail">
          <span className={`detail-amount${txn.amountCents > 0 ? ' text-good' : ''}`}>{formatCents(txn.amountCents, { sign: true })}</span>
          <span className="merchant-full">{txn.description}</span>
          <span className="small">
            {longDay(txn.date)}
            {txn.postedDate && txn.postedDate !== txn.date ? ` · bank posted ${longDay(txn.postedDate)}` : ''}
            {txn.time ? ` · ${txn.time}` : ''}
          </span>
        </div>

        {txn.amountCents > 0 && (
          <p className="hint">Money in: choose Income, or the category it pays you back for (it reduces that category's spending).</p>
        )}

        <CategoryPicker value={categoryId} onChange={setCategoryId} amountCents={txn.amountCents} />

        {canLearn && (
          <div className="learn">
            <label className="check">
              <input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} />
              <span>Always use this category for</span>
            </label>
            <input className="input" aria-label="Merchant keyword" value={keyword} disabled={!always}
              onChange={(e) => setKeyword(e.target.value)} />
          </div>
        )}

        <label className="field">
          <span className="small">Note</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </label>

        <button type="button" className="btn primary" disabled={!categoryId} onClick={save}>Save</button>
        <button type="button" className="btn ghost danger" onClick={remove}>
          {confirmDelete ? 'Tap again to delete' : 'Delete transaction'}
        </button>
      </div>
    </Sheet>
  );
}
