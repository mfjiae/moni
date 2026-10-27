// Screenshot import overlay (Ken, 27 Oct 2026; UI locked: prototype "Moni Screenshot Import", review layout C).
// Opened from the Import menu (ImportButton in ui.jsx). Step 1: pick screenshots of CommBank's Smart Access
// transactions page (read on this device, ocr.js) or paste rows from chat. Step 2: the review list, one
// row per transaction with moni's category guess (your rules first, else CommBank's label) and a tick to
// confirm it. Only ticked rows are saved. Rows already in moni are left out (you can add one anyway).
// Phone: full screen. Desktop: a centered card over the page. x, Escape or the back gesture closes it.
import { useEffect, useRef, useState } from 'react';
import { formatCents, parseCents } from '../lib/money.js';
import { longDay, todaySydney } from '../lib/dates.js';
import { categoryName, kindForCategory } from '../lib/categories.js';
import { parsePastedRows, combineShots, planShot, canConfirm, rememberCandidates } from '../lib/screenshot.js';
import { addShotRows, getRules, saveRule } from '../lib/store.js';
import { db } from '../lib/db.js';
import { shortName } from '../lib/activity.js';
import { CategorySelect, Segmented, Sheet } from './ui.jsx';

const plural = (n, one, many) => (n === 1 ? one : many);
const FROM = { bank: 'from the bank file', typed: 'typed by you', screenshot: 'from an earlier screenshot' };

function usageOf(txns) {
  const u = {};
  for (const t of txns) if (t.categoryId && t.kind !== 'review') u[t.categoryId] = (u[t.categoryId] ?? 0) + 1;
  return u;
}

export default function ShotImport({ onClose, onDone }) {
  const [step, setStep] = useState('pick');
  const [files, setFiles] = useState([]);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [notes, setNotes] = useState([]);
  const [ticked, setTicked] = useState(() => new Set());
  const [toSort, setToSort] = useState(() => new Set());
  const [showDups, setShowDups] = useState(false);
  const [catFor, setCatFor] = useState(null);
  const [editing, setEditing] = useState(null);
  const [ctx, setCtx] = useState(null); // { txns, rules, usage, today }
  const [busy, setBusy] = useState(false);
  const [after, setAfter] = useState(null); // 1C: { msg, cands, skipped, picked } = the "Remember these?" sheet
  const fileInput = useRef(null);
  const card = useRef(null);

  // The back gesture closes the overlay (like Quick sort); Escape too.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    window.history.pushState({ moni: 'shot' }, '');
    const onPop = () => closeRef.current();
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.overlay')) window.history.back(); };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('popstate', onPop); window.removeEventListener('keydown', onKey); };
  }, []);
  const close = () => window.history.back();
  useEffect(() => { card.current?.focus({ preventScroll: true }); }, []);

  async function loadCtx() {
    const txns = await db.txns.toArray();
    const c = { txns, rules: await getRules(), usage: usageOf(txns), today: todaySydney() };
    setCtx(c);
    return c;
  }

  async function read() {
    setError('');
    setBusy(true);
    try {
      const c = await loadCtx();
      const lists = [];
      const found = [];
      if (files.length) {
        const { readScreenshot } = await import('../lib/ocr.js');
        for (let i = 0; i < files.length; i++) {
          setStep('reading');
          setStatus(files.length > 1 ? `Reading picture ${i + 1} of ${files.length}…` : 'Reading your screenshot…');
          const r = await readScreenshot(files[i], {
            today: c.today,
            onStatus: (m) => {
              if (m.status === 'loading' || /loading/.test(m.status ?? '')) setStatus('Getting the reader ready (first time only, about 7 MB)…');
              else if (m.status === 'recognizing text') setStatus(`Reading${files.length > 1 ? ` picture ${i + 1} of ${files.length}` : ''}… ${Math.round((m.progress ?? 0) * 100)}%`);
            },
          });
          if (r.account === 'other') {
            found.push(`Picture ${i + 1} looks like a savings account, not Smart Access. moni only reads Smart Access screenshots, so it was skipped. Import savings with their CSV.`);
            continue;
          }
          if (r.account == null) found.push(`moni couldn't see the account name in picture ${i + 1}, so it takes these rows as Smart Access.`);
          lists.push(r.rows);
        }
      }
      if (text.trim()) {
        const p = parsePastedRows(text, c.today);
        lists.push(p.rows);
        if (p.errors.length) found.push(`${p.errors.length} pasted ${plural(p.errors.length, 'line', 'lines')} couldn't be read: ${p.errors.map((e) => `“${e.text.trim()}”`).join(', ')}`);
      }
      const rows = combineShots(lists);
      if (!rows.length) {
        setStep('pick');
        setError(found.length ? found.join(' ') : 'No transactions found. Use a screenshot of the Smart Access transactions page, or check the pasted rows.');
        return;
      }
      setItems(planShot(rows, c));
      setNotes(found);
      setTicked(new Set());
      setToSort(new Set());
      setStep('review');
    } catch (e) {
      setStep('pick');
      setError(`Couldn't read that: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  const list = items.filter((it) => !it.dupOf);
  const dups = items.filter((it) => it.dupOf);
  const ready = list.filter((it) => canConfirm(it) && !ticked.has(it.id));
  const saving = list.filter((it) => ticked.has(it.id));
  const update = (id, changes) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...changes } : x)));
  const tick = (id) => setTicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const leaveToSort = (id) => { setToSort((s) => new Set(s).add(id)); setTicked((s) => new Set(s).add(id)); };

  async function save() {
    if (!saving.length || busy) return;
    setBusy(true);
    try {
      const n = await addShotRows(saving, toSort);
      const left = list.length - n;
      const msg = `Added ${n} from your screenshot${left ? ` · ${left} not confirmed, left out` : ''}${dups.length ? ` · ${dups.length} already in moni` : ''}`;
      const { candidates, skipped } = rememberCandidates(saving, { toSort, rules: ctx?.rules });
      if (candidates.length) {
        setAfter({ msg, cands: candidates, skipped, picked: new Set(candidates.map((c) => c.key)) });
        setBusy(false);
        return;
      }
      onDone?.(msg);
      close();
    } catch (e) {
      setError(`Couldn't save: ${e.message}`);
      setBusy(false);
    }
  }

  // 1C: after saving, offer the new rules. "Not now" (or closing the sheet) remembers nothing.
  async function finishRemember(remember) {
    if (!after || busy) return;
    setBusy(true);
    let n = 0;
    if (remember) {
      for (const c of after.cands) {
        if (!after.picked.has(c.key)) continue;
        try { await saveRule(c.key, c.categoryId); n += 1; } catch { /* too general: skipped */ }
      }
    }
    onDone?.(`${after.msg}${n ? ` · remembered ${n} ${plural(n, 'rule', 'rules')}` : ''}`);
    close();
  }
  const togglePick = (key) => setAfter((a) => { const picked = new Set(a.picked); if (picked.has(key)) picked.delete(key); else picked.add(key); return { ...a, picked }; });

  const catItem = items.find((x) => x.id === catFor);
  const editItem = items.find((x) => x.id === editing);

  return (
    <div className="qs-overlay" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="qs-card ss-card" role="dialog" aria-modal="true" aria-label="Import a screenshot" tabIndex={-1} ref={card}>
        <div className="qs-head">
          <span className="card-title plain">Screenshot</span>
          <button type="button" className="icon-btn" aria-label="Close" onClick={close}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        {step === 'pick' && (
          <>
            <p className="small ss-intro">Take a screenshot of CommBank&rsquo;s Smart Access transactions page, then bring it in one of two ways. You confirm every row before it counts.</p>
            <section className="ss-opt">
              <div className="ss-opt-head"><span className="ss-kicker">Option 1</span><span className="ss-opt-title">Pick the picture</span></div>
              <button type="button" className="ss-drop" onClick={() => fileInput.current?.click()}>
                <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="M21 16l-5-5-8 9" /></svg>
                <span>{files.length ? `${files.length} ${plural(files.length, 'picture', 'pictures')} picked · change` : 'Choose from your photos'}</span>
              </button>
              <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { setFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
              <p className="small">moni reads it on this device. The first time it downloads the reader (about 7 MB). Nothing leaves your phone. It can misread a digit, so you check every row. Several pictures are fine (scroll, screenshot again).</p>
            </section>
            <section className="ss-opt">
              <div className="ss-opt-head"><span className="ss-kicker">Option 2</span><span className="ss-opt-title">Paste rows from chat</span></div>
              <label className="ss-paste">
                <span className="small">One row per line: date | name | amount | category</span>
                <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)}
                  placeholder={'26/10/2026 | PENDING: Fake Shop | -111.95 | Entertainment\n25/10/2026 | Fakemart | -33.49 | Groceries'} />
              </label>
              <p className="small">Send the screenshot to Claude in chat, copy the rows it gives you, paste them here. Most accurate.</p>
            </section>
            {error && <p className="import-warn" role="alert">{error}</p>}
            <div className="ss-foot">
              <button type="button" className="btn primary" disabled={busy || (!files.length && !text.trim())} onClick={read}>Read the rows</button>
            </div>
          </>
        )}

        {step === 'reading' && (
          <div className="ss-reading" role="status" aria-live="polite">
            <span className="ss-spin" aria-hidden="true" />
            <span>{status}</span>
          </div>
        )}

        {step === 'review' && (
          <>
            <div className="ss-progress">
              <div className="ss-progress-line small">
                <span>{saving.length} of {list.length} confirmed</span>
                {dups.length > 0 && (
                  <button type="button" className="link" aria-expanded={showDups} onClick={() => setShowDups(!showDups)}>
                    {dups.length} already in moni, left out
                  </button>
                )}
              </div>
              <div className="qs-bar ss-bar" role="progressbar" aria-valuemin={0} aria-valuemax={list.length} aria-valuenow={saving.length}>
                <i style={{ width: `${list.length ? Math.round((saving.length / list.length) * 100) : 0}%` }} />
              </div>
            </div>
            {notes.map((n) => <p key={n} className="small ss-note">{n}</p>)}

            {showDups && (
              <div className="ss-dups">
                {dups.map((it) => (
                  <div key={it.id} className="ss-dup">
                    <span className="ss-main">
                      <span className="ss-name">{it.name}</span>
                      <span className="small">{longDay(it.date)} · matches {shortName(it.dupOf.name)} {FROM[it.dupOf.from]}, {longDay(it.dupOf.date)}</span>
                    </span>
                    <span className={`ss-amt${it.amountCents > 0 ? ' text-in' : ''}`}>{formatCents(it.amountCents, { sign: true })}</span>
                    <button type="button" className="btn ghost small-btn" onClick={() => update(it.id, { dupOf: null })}>Add anyway</button>
                  </div>
                ))}
              </div>
            )}

            <div className="ss-list">
              {list.map((it) => {
                const on = ticked.has(it.id);
                const sorted = toSort.has(it.id);
                const rose = !on && !canConfirm(it);
                return (
                  <div key={it.id} className={`ss-row${on ? ' on' : ''}${rose ? ' rose' : ''}`}>
                    <span className="ss-main">
                      <button type="button" className="ss-name ss-edit" onClick={() => setEditing(it.id)} aria-label={`Edit ${it.name}`}>{it.name}</button>
                      <span className="ss-meta">
                        <span className="small">{longDay(it.date)}</span>
                        {it.pending && <span className="shot-tag pend">pending</span>}
                        {on ? <span className="small">{sorted ? 'To sort' : categoryName(it.categoryId)}</span>
                          : it.problem ? <span className="small text-review">{it.problem === 'amount' ? 'Couldn’t read the amount. Tap the name to fix it.' : 'That date is in the future. Tap the name to fix it.'}</span>
                            : (
                              <button type="button" className={`ss-cat${it.categoryId ? '' : ' empty'}`} onClick={() => setCatFor(it.id)}>
                                {it.categoryId ? categoryName(it.categoryId) : 'Pick a category'}
                                <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                              </button>
                            )}
                        {!on && !it.problem && !it.categoryId && (
                          <button type="button" className="link ss-tosort" onClick={() => leaveToSort(it.id)}>Leave in To sort</button>
                        )}
                      </span>
                    </span>
                    <span className={`ss-amt${it.amountCents > 0 && it.kind !== 'saving' ? ' text-in' : it.kind === 'saving' ? ' muted' : ' text-out'}`}>
                      {it.amountCents == null ? '?' : formatCents(it.amountCents, { sign: true })}
                    </span>
                    <button type="button" className={`ss-tick${on ? ' on' : ''}`} aria-pressed={on}
                      aria-label={`${on ? 'Unconfirm' : 'Confirm'} ${it.name}`} disabled={!on && !canConfirm(it)}
                      onClick={() => { if (on && sorted) setToSort((s) => { const n = new Set(s); n.delete(it.id); return n; }); tick(it.id); }}>
                      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                    </button>
                  </div>
                );
              })}
            </div>
            {list.some((it) => !canConfirm(it)) && (
              <p className="small ss-note">Rows moni can&rsquo;t sort stay rose and can&rsquo;t be confirmed until you pick a category, or you can leave them in To sort. Unconfirmed rows aren&rsquo;t saved.</p>
            )}
            {error && <p className="import-warn" role="alert">{error}</p>}
            <div className="ss-foot">
              {ready.length > 0 && (
                <button type="button" className="btn primary" onClick={() => setTicked((s) => new Set([...s, ...ready.map((x) => x.id)]))}>
                  Confirm all that look right ({ready.length})
                </button>
              )}
              <button type="button" className={`btn${ready.length ? ' ghost' : ' primary'}`} disabled={!saving.length || busy} onClick={save}>
                {busy ? 'Saving…' : `Save ${saving.length} confirmed`}
              </button>
            </div>
          </>
        )}

        {after && (
          <Sheet title="Remember these for next time?" onClose={() => finishRemember(false)} handle>
            <div className="sheet-body">
              <p className="hint">Saved. When you import again, rows that start with these words get sorted for you.</p>
              <div className="rm-list">
                {after.cands.map((c) => {
                  const on = after.picked.has(c.key);
                  return (
                    <button key={c.key} type="button" role="checkbox" aria-checked={on} className={`rm-rule${on ? ' on' : ''}`} onClick={() => togglePick(c.key)}>
                      <span className="rm-cb" aria-hidden="true">{on && <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 6.5l2.5 2.5L10 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>}</span>
                      <span className="rm-text"><span className="rm-k">{c.key} → {categoryName(c.categoryId)}</span><span className="small">{c.names[0]} · {c.count} {plural(c.count, 'row', 'rows')}</span></span>
                    </button>
                  );
                })}
              </div>
              {after.skipped > 0 && <p className="small">Left out: {after.skipped} {plural(after.skipped, 'row', 'rows')} that can’t be remembered (a payment to a person, a name that’s too general, or two categories for one name).</p>}
              <button type="button" className="btn primary" disabled={busy || !after.picked.size} onClick={() => finishRemember(true)}>
                {busy ? 'Saving…' : `Remember ${after.picked.size} ${plural(after.picked.size, 'rule', 'rules')}`}
              </button>
              <button type="button" className="btn ghost" disabled={busy} onClick={() => finishRemember(false)}>Not now</button>
            </div>
          </Sheet>
        )}
        {catItem && ctx && (
          <Sheet title={`Category for ${catItem.name}`} onClose={() => setCatFor(null)}>
            <div className="sheet-body">
              <CategorySelect value={catItem.categoryId} amountCents={catItem.amountCents} usage={ctx.usage} startOpen
                onChange={(id) => { update(catItem.id, { categoryId: id, kind: kindForCategory(id), transfer: id === 'saving' ? catItem.transfer : false }); setCatFor(null); }} />
            </div>
          </Sheet>
        )}
        {editItem && ctx && (
          <EditRow item={editItem} ctx={ctx} onClose={() => setEditing(null)}
            onSave={(next) => { setItems((xs) => xs.map((x) => (x.id === editItem.id ? next : x))); setTicked((s) => { const n = new Set(s); n.delete(editItem.id); return n; }); setEditing(null); }} />
        )}
      </div>
    </div>
  );
}

// Fix a row moni misread: name, date, amount and direction. Saving runs the guesses again for that row.
function EditRow({ item, ctx, onClose, onSave }) {
  const [name, setName] = useState(item.name);
  const [date, setDate] = useState(item.date);
  const [amount, setAmount] = useState(item.amountCents == null ? '' : (Math.abs(item.amountCents) / 100).toFixed(2));
  const [dir, setDir] = useState(item.amountCents != null && item.amountCents > 0 ? 'in' : 'out');
  const [err, setErr] = useState('');
  const submit = (e) => {
    e.preventDefault();
    let cents;
    try { cents = parseCents(amount); } catch { cents = null; }
    if (!name.trim()) return setErr('Enter a name');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setErr('Pick a date');
    if (!cents || cents <= 0) return setErr('Enter an amount, like 12.50');
    const row = { date, name: name.trim(), amountCents: dir === 'out' ? -cents : cents, pending: item.pending, bankLabel: item.bankLabel, problem: null };
    const [next] = planShot([row], ctx);
    return onSave({ ...next, id: item.id });
  };
  return (
    <Sheet title="Fix this row" onClose={onClose}>
      <form className="sheet-body ss-form" onSubmit={submit}>
        <label className="field"><span className="small">Name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span className="small">Date</span><input className="input" type="date" value={date} max={ctx.today} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field"><span className="small">Amount</span><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></label>
        <Segmented value={dir} onChange={setDir} label="Direction" options={[['out', 'Money out'], ['in', 'Money in']]} />
        {err && <p className="import-warn" role="alert">{err}</p>}
        <button type="submit" className="btn primary">Save row</button>
      </form>
    </Sheet>
  );
}
