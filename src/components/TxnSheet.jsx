import { useMemo, useState } from 'react';
import { Sheet, CategorySelect, CashRow, Segmented } from './ui.jsx';
import { formatCents, parseCents } from '../lib/money.js';
import { kindForCategory } from '../lib/categories.js';
import { splitOf, buildSplit } from '../lib/investing.js';
import { longDay } from '../lib/dates.js';
import { isPersonTransfer, merchantKey, isBroadKeyword } from '../lib/rules.js';
import { isCashDeposit, isCash, depositChoice, DEPOSIT_CHOICES } from '../lib/cash.js';
import { answerAtm, setCategory, saveRule, deleteTxn, setEtfSplit, addEtf } from '../lib/store.js';

const toCents = (text) => { try { const c = parseCents(text); return c > 0 ? c : NaN; } catch { return NaN; } };

// Which ETF(s) an investing transaction bought (T2, Ken 25 Oct 2026). One ETF = the whole amount, no typing;
// add a second row only when one transfer bought two ETFs, then the amounts must add up exactly.
function EtfSplit({ rows, setRows, etfs, amountCents, onToast }) {
  const [adding, setAdding] = useState(false);
  const [ticker, setTicker] = useState('');
  const { left } = buildSplit(rows.map((r) => ({ ticker: r.ticker, cents: toCents(r.text) })), amountCents);
  const multi = rows.length > 1;
  const set = (i, ch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...ch } : r)));
  const unused = etfs.find((e) => !rows.some((r) => r.ticker === e)) ?? '';

  async function add() {
    try {
      const t = await addEtf(ticker);
      if (rows.length === 0) setRows([{ ticker: t, text: '' }]);
      else if (!rows[rows.length - 1].ticker) set(rows.length - 1, { ticker: t });
      setTicker(''); setAdding(false);
      onToast(`Added ${t}`);
    } catch (e) { onToast(e.message); }
  }

  return (
    <div className="etf-split">
      <span className="small">{multi ? 'Which ETFs did this buy?' : 'Which ETF?'}</span>
      {rows.map((r, i) => (
        <div className={`etf-row${multi ? ' multi' : ''}`} key={i}>
          <select className="input" aria-label={`ETF ${i + 1}`} value={r.ticker} onChange={(e) => set(i, { ticker: e.target.value })}>
            <option value="">Not tagged</option>
            {etfs.map((e) => <option key={e} value={e} disabled={rows.some((x, j) => j !== i && x.ticker === e)}>{e}</option>)}
          </select>
          {multi && (
            <input className="input etf-amt" inputMode="decimal" aria-label={`Amount for ${r.ticker || `ETF ${i + 1}`}`} placeholder="$0.00"
              value={r.text} onChange={(e) => set(i, { text: e.target.value })} />
          )}
          {multi && <button type="button" className="icon-btn" aria-label={`Remove ${r.ticker || 'row'}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>×</button>}
        </div>
      ))}
      <div className="btn-row">
        {rows.length > 0 && etfs.length > rows.length && (
          <button type="button" className="link" onClick={() => setRows([...rows, { ticker: unused, text: '' }])}>+ Add another ETF</button>
        )}
        {!adding && <button type="button" className="link" onClick={() => setAdding(true)}>+ New ETF</button>}
      </div>
      {adding && (
        <div className="etf-row">
          <input className="input" aria-label="New ETF ticker" placeholder="Ticker, e.g. BGBL" value={ticker} autoFocus
            onChange={(e) => setTicker(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          <button type="button" className="btn small-btn" onClick={add}>Add</button>
        </div>
      )}
      {multi && (
        <div className="row etf-left"><span className="small">Left to split</span>
          <strong className={left === 0 ? 'text-in' : 'text-over'}>{formatCents(left)}</strong></div>
      )}
    </div>
  );
}

export default function TxnSheet({ txn, usage, etfs = [], lastEtf = null, onClose, onToast }) {
  const [categoryId, setCategoryId] = useState(txn.categoryId ?? null);
  const [note, setNote] = useState(txn.note ?? '');
  const person = isPersonTransfer(txn.description);
  const canLearn = txn.source === 'csv' && !person;
  const [keyword, setKeyword] = useState(() => merchantKey(txn.description));
  const [always, setAlways] = useState(canLearn && txn.kind === 'review' && !!keyword);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Paid with cash: a typed purchase can be switched to cash (or back) here; a bank cash deposit asks whose cash it was.
  const canCash = txn.source === 'manual' && !txn.transfer && txn.amountCents < 0;
  const [cash, setCash] = useState(isCash(txn));
  const deposit = isCashDeposit(txn);
  // Push 2 (Ken, 27 Oct 2026): a round, unsorted money-out row may be a missed ATM withdrawal (App marks it `atmAsk`).
  const atmKey = merchantKey(txn.description);
  const [remember, setRemember] = useState(false);
  async function answer(yes) {
    try {
      const n = await answerAtm(txn.uid, yes, { remember: remember && !!atmKey, keyword: atmKey });
      onToast(yes ? `Filed as an ATM withdrawal${n ? `. Also filed ${n} more like it` : ''}` : 'Kept in To sort');
      onClose();
    } catch (e) { onToast(e.message); }
  }
  const [rows, setRows] = useState(() => {
    const s = splitOf(txn);
    if (s) return s.length === 1 ? [{ ticker: s[0].ticker, text: '' }] : s.map((p) => ({ ticker: p.ticker, text: (p.cents / 100).toFixed(2) }));
    const pick = lastEtf ?? etfs[0];
    return pick ? [{ ticker: pick, text: '' }] : [];
  });
  const investing = categoryId && kindForCategory(categoryId) === 'investing';
  const split = useMemo(() => buildSplit(rows.map((r) => ({ ticker: r.ticker, cents: toCents(r.text) })), txn.amountCents), [rows, txn.amountCents]);

  const broad = canLearn && always && isBroadKeyword(keyword);

  async function save() {
    if (!categoryId || broad || (investing && !split.ok)) return;
    await setCategory(txn.uid, categoryId, note, canCash && cash !== isCash(txn) ? { cash } : {});
    if (investing) await setEtfSplit(txn.uid, split.split);
    else if (txn.etfSplit?.length) await setEtfSplit(txn.uid, []);
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
          <span className={`detail-amount${txn.amountCents > 0 ? ' text-in' : ''}`}>{formatCents(txn.amountCents, { sign: true })}</span>
          <span className="merchant-full">{txn.description}</span>
          <span className="small">
            {longDay(txn.date)}
            {txn.postedDate && txn.postedDate !== txn.date ? ` · bank posted ${longDay(txn.postedDate)}` : ''}
            {txn.time ? ` · ${txn.time}` : ''}
          </span>
        </div>

        {deposit && (
          <div className="cash-deposit">
            <span className="cash-q">Whose cash was this?</span>
            <Segmented label="Whose cash" value={depositChoice(categoryId)} onChange={(v) => setCategoryId(DEPOSIT_CHOICES[v])}
              options={[['gift', 'Cash someone gave me'], ['own', 'My own cash']]} />
            <div className="cash-eff">
              <div><span>Smart Access</span><span className="text-in">{formatCents(txn.amountCents, { sign: true })}</span></div>
              <div><span>Cash balance</span><span className={depositChoice(categoryId) === 'own' ? 'text-out' : ''}>{depositChoice(categoryId) === 'own' ? formatCents(-txn.amountCents, { sign: true }) : 'no change'}</span></div>
              <div><span>Category</span><span>{depositChoice(categoryId) === 'own' ? 'Transfers & payments' : 'Family support'}</span></div>
              <div><span>Counts as money in</span><span>{depositChoice(categoryId) === 'own' ? 'no, own cash' : 'yes'}</span></div>
            </div>
            <p className="hint">“My own cash” covers cash you withdrew earlier and cash you already had but never told moni about: set it in your cash balance first, then deposit it here. Online deposits from other people never ask this question.</p>
          </div>
        )}

        {txn.atmAsk && (
          <div className="atm-ask">
            <span className="cash-q">Was this a cash withdrawal?</span>
            <div className="atm-opts">
              <button type="button" className="btn primary" onClick={() => answer(true)}>Yes, ATM cash</button>
              <button type="button" className="btn ghost" onClick={() => answer(false)}>No, sort it myself</button>
            </div>
            <div className="atm-remember">
              <span className="cash-row-text">
                <span>Remember for similar rows</span>
                <span className="small">{atmKey ? `Rows with “${atmKey}”` : 'The bank text is too general to remember.'}</span>
              </span>
              <button type="button" role="switch" aria-checked={remember && !!atmKey} aria-label="Remember for similar rows" className="cash-sw"
                disabled={!atmKey} onClick={() => setRemember(!remember)} />
            </div>
          </div>
        )}

        {txn.amountCents > 0 && !deposit && (
          <p className="hint">Money in: choose Income, or the category it pays you back for (it reduces that category's spending).</p>
        )}

        <CategorySelect value={categoryId} onChange={setCategoryId} amountCents={txn.amountCents} usage={usage}
          onToast={onToast} startOpen={txn.kind === 'review' && !txn.atmAsk} />

        {canCash && <CashRow on={cash} onChange={setCash} />}

        {investing && <EtfSplit rows={rows} setRows={setRows} etfs={etfs} amountCents={txn.amountCents} onToast={onToast} />}

        {canLearn && (
          <div className="learn">
            <label className="check">
              <input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} />
              <span>Always use this category for</span>
            </label>
            <input className="input" aria-label="Merchant keyword" value={keyword} disabled={!always}
              placeholder="Merchant name, e.g. TELCOPAY" onChange={(e) => setKeyword(e.target.value)} />
            {broad && <p className="error" role="alert">{keyword.trim() ? `“${keyword.trim()}” would catch too many transactions.` : 'Type the merchant name.'} Use the merchant’s name, or untick this.</p>}
          </div>
        )}

        <label className="field">
          <span className="small">Note</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </label>

        <button type="button" className="btn primary" disabled={!categoryId || broad || (investing && !split.ok)} onClick={save}>Save</button>
        <button type="button" className="btn ghost danger" onClick={remove}>
          {confirmDelete ? 'Tap again to delete' : 'Delete transaction'}
        </button>
      </div>
    </Sheet>
  );
}
