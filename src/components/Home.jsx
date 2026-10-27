import { useEffect, useMemo, useState } from 'react';
import { formatCents, parseCents } from '../lib/money.js';
import { monthKey, monthName, longDay, ordinal, daysInMonth } from '../lib/dates.js';
import { kindForCategory } from '../lib/categories.js';
import { summarizeMonth, categoryRows, monthCompare, upcomingRent } from '../lib/summary.js';
import { rentFromBills } from '../lib/bills.js';
import { currentBalance } from '../lib/importer.js';
import { SAVERS } from '../lib/accounts.js';
import { displayName } from './TxnRow.jsx';
import { resolveMatch, setCashBalance } from '../lib/store.js';
import { settingsJump } from './Settings.jsx';
import { startBackupClock } from '../lib/store.js';
import { backupDue, backupAgo } from '../lib/backup.js';
import { Bar, ImportButton, MonthDropdown, Sheet, useOnline, OfflinePill } from './ui.jsx';
import { cashFlowCaption } from '../lib/budgets.js';
import { Icon } from './icons.jsx';
import { Donut } from './charts.jsx';

export function SettingsButton({ onClick }) {
  return (
    <button type="button" className="icon-btn mobile-only" aria-label="Settings" onClick={onClick}>
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
    </button>
  );
}



// The five shortcuts, together in one card (compact pass B, Ken 14 Oct 2026).
function Shortcuts({ onNavigate, onDetail }) {
  const items = [
    ['Spending', 'wallet', 'out', () => onDetail('spending')],
    ['Income', 'banknote', 'in', () => onDetail('income')],
    ['Saved', 'piggy', 'save', () => onDetail('saved')],
    ['Invested', 'linechart', 'invest', () => onDetail('invested')],
    ['Activity', 'list', 'accent', () => onNavigate('activity', 'all')],
  ];
  return (
    <nav className="card hc sc-card" aria-label="Shortcuts">
      <div className="shortcuts">
        {items.map(([label, icon, c, go]) => (
          <button type="button" key={label} className="sc" style={{ '--c': `var(--${c})` }} onClick={go}>
            <span className="sc-btn"><Icon name={icon} size={22} /></span>
            <span className="sc-label">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

// Spent so far: income on the title row, big number, thin bar with a white line for today, then how it
// compares with last month by the same day.
function SpentSoFar({ month, current, today, spent, income, compare, onClick }) {
  const prevName = compare ? monthName(compare.prev) : '';
  const isCurrent = month === current;
  const [y, m] = month.split('-').map(Number);
  const pace = isCurrent ? Number(today.slice(8)) / daysInMonth(y, m) : null;
  const by = compare && compare.isCurrent ? ` by the ${ordinal(compare.day)}` : '';
  const share = compare ? `${Math.round(compare.share * 100)}% of ${prevName}\u2019s ${formatCents(compare.prevTotal)}` : '';
  return (
    <button type="button" className="card hc tint tint-out spent-card" onClick={onClick} aria-label={`${isCurrent ? 'Spent so far' : 'Spent'} ${formatCents(spent)}. Open spending`}>
      <span className="hc-title"><span>{isCurrent ? 'Spent so far' : `Spent in ${monthName(month)}`}</span><span className="hc-side">{formatCents(income)} in</span></span>
      <span className="hc-big text-out">{formatCents(spent)}</span>
      {compare ? (
        <>
          <Bar ratio={compare.share} pace={pace} status={compare.share > 1 ? 'over' : 'out'}
            label={`${Math.round(compare.share * 100)}% of ${prevName}'s total`} />
          {pace != null && (
            <span className="pace-label" aria-hidden="true">
              <span style={{ left: `${pace * 100}%`, transform: `translateX(-${pace * 100}%)` }}>{Math.round(pace * 100)}% of month</span>
            </span>
          )}
          <span className="hc-cap">{share}</span>
          <span className={`vs ${compare.delta > 0 ? 'text-out' : compare.delta < 0 ? 'text-in' : ''}`}>
            {compare.delta === 0
              ? `Same as ${prevName}${by}`
              : `${formatCents(Math.abs(compare.delta))} ${compare.delta > 0 ? 'more' : 'less'} than ${prevName}${by}`}
          </span>
        </>
      ) : (
        <span className="hc-cap">Nothing earlier to compare with yet.</span>
      )}
    </button>
  );
}

// Monthly cash flow: what came in against what was spent, as two thin bars.
function CashFlowCard({ month, summary, onClick }) {
  const { income, spent } = summary;
  const max = Math.max(income, spent, 1);
  const cap = cashFlowCaption(income, spent);
  return (
    <button type="button" className="card hc tint tint-in flow-card" onClick={onClick} aria-label="Monthly cash flow. Open cash flow">
      <span className="hc-title"><span>Monthly cash flow</span><span className="hc-side">{monthName(month)}</span></span>
      <span className="flow-rows">
        <span>In</span><Bar ratio={income / max} status="in" label={`In ${formatCents(income)}`} /><strong className="text-in">{formatCents(income)}</strong>
        <span>Spent</span><Bar ratio={spent / max} status="out" label={`Spent ${formatCents(spent)}`} /><strong className="text-out">{formatCents(spent)}</strong>
      </span>
      <span className="hc-cap">
        {cap.kind === 'pct' && `Spent ${cap.percent}% of what came in`}
        {cap.kind === 'over' && <span className="text-out">Spent {formatCents(cap.overCents)} more than came in</span>}
        {cap.kind === 'none' && 'No money in yet this month'}
      </span>
    </button>
  );
}

// Where it went: small donut with the list right beside it (name, amount, percent).
// Every category gets its own row (Ken, 25 Oct 2026; no "Everything else"); tapping one opens Spending
// for that category (H-B).
function WhereCard({ rows, total, onOpen, onCategory }) {
  return (
    <section className="card hc where-card" aria-label="Where it went">
      <div className="hc-title">
        <span>Where it went</span>
        <button type="button" className="link hc-link" onClick={onOpen}>See all</button>
      </div>
      {rows.length === 0
        ? <div className="empty small-empty">No spending yet this month.</div>
        : <Donut rows={rows} total={total} size={null} amounts className="donut-home" onOpen={onCategory} minSlice={5} />}
    </section>
  );
}

// Small alarm pill in the top right for a bill coming up. Just a warning: it doesn't open anything.
// M5 (H1): the pill now opens the Bills page.
function RentPill({ rent, onOpen }) {
  const when = rent.days === 0 ? 'today' : rent.days === 1 ? 'tomorrow' : `in ${rent.days} days`;
  return (
    <button type="button" className="rent-pill" onClick={onOpen} title={`${longDay(rent.date)} \u00b7 about ${formatCents(rent.cents)}`}
      aria-label={`Rent due ${when}. Open Bills`}>
      <Icon name="alarm" size={16} />Rent due {when} <span aria-hidden="true">›</span>
    </button>
  );
}

// Balance card (M2.6, option B): Smart Access and Savings side by side once a saver has money in it.
// Savings = every saver with a balance above $0 (an emptied one, like xx2103, drops out). Each half opens
// its account page.
// UI bundle 2 (Ken, 26 Oct 2026, UI locked option A, prototype "Moni Balance Card Taps"): no more "+N typed" /
// "estimate" chip. When a balance includes typed entries (or transfers seen only in the other account's CSV),
// a small button beside it (with a rose dot while typed entries are pending) opens a breakdown under the card;
// the rest of the half still opens the account page. A bank row waiting for "which typed entry is this?"
// shows a "N match to confirm" chip, and the question is answered inside the breakdown.
const dayShort = (iso) => longDay(iso);
const plural = (n, one, many) => (n === 1 ? one : many);

function BalanceHalf({ id, cls = '', label, cents, note, info, open, setOpen, onOpenAccount }) {
  const items = info?.items ?? [];
  const confirms = info?.confirms ?? [];
  const has = items.length > 0 || confirms.length > 0;
  const pending = items.some((x) => x.from === 'typed');
  const isOpen = open === id;
  return (
    <div className={`bal-half${cls}`}>
      <button type="button" className="bal-hit" onClick={onOpenAccount} aria-label={`${label} balance ${formatCents(cents)}. Open account`} />
      <span className="balance-label">{label}</span>
      <span className="bal-row">
        <span className="balance-value">{formatCents(cents)}</span>
        {has && (
          <button type="button" className="bal-more" aria-expanded={isOpen} aria-controls={`bal-${id}`}
            aria-label={isOpen ? `Hide what is in the ${label} balance` : `Show what is in the ${label} balance`}
            onClick={() => setOpen(isOpen ? null : id)}>
            {pending && <i className="bal-dot" aria-hidden="true" />}
            <span aria-hidden="true">{isOpen ? '\u25B4' : '\u25BE'}</span>
          </button>
        )}
      </span>
      <span className="balance-note">{note}</span>
      {confirms.length > 0 && <span className="match-chip">{confirms.length} {plural(confirms.length, 'match', 'matches')} to confirm</span>}
    </div>
  );
}

function Breakdown({ id, title, banks, info, total, onToast }) {
  const pick = async (bankUid, typedUid, msg) => {
    try { await resolveMatch(bankUid, typedUid); onToast?.(msg); } catch (err) { onToast?.(`Couldn't save that: ${err.message}`); }
  };
  return (
    <div className="bal-panel" id={`bal-${id}`}>
      <span className="bal-panel-head">{title}</span>
      {banks.map((b) => (
        <div className="bp-row" key={b.label}>
          <span>From the bank <span className="bp-sub">({b.label}, as of {dayShort(b.asOf)})</span></span>
          <span className="bp-amt">{formatCents(b.cents)}</span>
        </div>
      ))}
      {info.items.map((x) => (
        <div className="bp-row" key={x.uid}>
          <span className="bp-name">{displayName(x)} <span className="bp-sub">{dayShort(x.date)}</span>
            <span className={`bp-tag${x.from === 'typed' ? '' : x.from === 'shot' ? ' shot' : ' other'}`}>{x.from === 'typed' ? 'typed' : x.from === 'shot' ? (x.pending ? 'pending' : 'screenshot') : 'other account\u2019s CSV'}</span></span>
          <span className="bp-amt">{formatCents(x.cents, { sign: true })}</span>
        </div>
      ))}
      {(info.confirms ?? []).map((q) => {
        const bankName = displayName(q.row);
        return (
          <div className="bp-ask" key={q.row.uid}>
            <div className="bp-row">
              <span className="bp-name">{bankName} <span className="bp-sub">{dayShort(q.row.date)}</span><span className="bp-tag wait">waiting for you</span></span>
              <span className="bp-amt">{formatCents(-q.row.amountCents, { sign: true })}</span>
            </div>
            {q.candidates.length === 1 && q.candidates[0].shot ? (
              // Screenshot rows (screenshot.js) are always asked about, even with the exact amount (Ken: "Ask me each time").
              <>
                <p>The bank file has <b>{bankName} {formatCents(-q.row.amountCents)}</b> on {dayShort(q.row.date)}. Is it the same one as <b>{displayName(q.candidates[0])} {formatCents(-q.candidates[0].amountCents)}</b> from your screenshot on {dayShort(q.candidates[0].date)}?</p>
                <div className="bp-opts">
                  <button type="button" className="bp-opt" onClick={() => pick(q.row.uid, q.candidates[0].uid, 'Matched. The bank row took over, nothing counts twice.')}>Yes, same one</button>
                  <button type="button" className="bp-opt quiet" onClick={() => pick(q.row.uid, null, 'Kept both')}>No, keep both</button>
                </div>
                <p className="bp-note">Yes: the bank row takes over and keeps your category. Until you answer, the bank row stays out of your totals.</p>
              </>
            ) : q.near ? (
              <>
                <p>The bank took <b>{formatCents(-q.row.amountCents)}</b> at {bankName} on {dayShort(q.row.date)}. Is it your <b>{q.candidates[0].description} {formatCents(-q.candidates[0].amountCents)}</b>{q.candidates[0].shot ? ' from your screenshot' : ''}?</p>
                <div className="bp-opts">
                  <button type="button" className="bp-opt" onClick={() => pick(q.row.uid, q.candidates[0].uid, 'Matched. The bank\u2019s amount replaced your typed one.')}>Yes, same purchase</button>
                  <button type="button" className="bp-opt quiet" onClick={() => pick(q.row.uid, null, 'Kept both')}>No, keep both</button>
                </div>
              </>
            ) : (
              <>
                <p>The bank took <b>{formatCents(-q.row.amountCents)}</b> at {bankName} on {dayShort(q.row.date)}. Which typed entry is it?</p>
                <div className="bp-opts">
                  {q.candidates.map((c) => (
                    <button type="button" key={c.uid} className="bp-opt" onClick={() => pick(q.row.uid, c.uid, `Matched your ${c.description} from ${dayShort(c.date)}`)}>{c.description} · {dayShort(c.date)}{c.shot ? ' · screenshot' : ''}</button>
                  ))}
                  <button type="button" className="bp-opt quiet" onClick={() => pick(q.row.uid, null, 'Kept them all')}>Neither</button>
                </div>
              </>
            )}
          </div>
        );
      })}
      {info.settled?.count > 0 && (
        <p className="bp-note">{info.settled.count} older typed {plural(info.settled.count, 'entry', 'entries')} never matched the bank, so {plural(info.settled.count, 'it isn\u2019t', 'they aren\u2019t')} counted here. {plural(info.settled.count, 'It\u2019s', 'They\u2019re')} in Activity as manual.</p>
      )}
      <div className="bp-row bp-total"><span>Shown on the card</span><span className="bp-amt">{formatCents(total)}</span></div>
    </div>
  );
}

// Paid with cash, Push 2 (Ken, 26 Oct 2026; prototype "Moni Paid With Cash" v4, "Home: the Cash button and panel"):
// a Cash button beside Smart Access and Savings. Tapping it opens its breakdown under the card, like the
// typed-entries panels. The rose dot shows only while a cash purchase is newer than your last import.
// Ken, 27 Oct 2026, UI locked option A: a slim strip under the divider (same on phone and desktop). Label and a muted
// sub-line on the left, the amount (about 22px, warm) and a chevron on the right.
function CashHalf({ cash, open, setOpen }) {
  const isOpen = open === 'cash';
  const neg = cash.left < 0;
  const n = cash.spent.count;
  const sub = `${cash.set ? `set ${dayShort(cash.set.asOf)}` : 'not set yet'} · ${n} cash purchase${n === 1 ? '' : 's'}`;
  return (
    <button type="button" className="cash-half cash-strip" aria-expanded={isOpen} aria-controls="bal-cash"
      onClick={() => setOpen(isOpen ? null : 'cash')}>
      <span className="cash-strip-text">
        <span className="balance-label">Cash{cash.dot && <i className="bal-dot cash-dot" aria-label="new cash purchase" />}</span>
        <span className="cash-sub">{sub}</span>
      </span>
      <span className="cash-strip-end">
        <span className={`cash-amt${neg ? ' neg' : ''}`}>{formatCents(cash.left)}</span>
        <span className="cash-chev" aria-hidden="true">›</span>
      </span>
    </button>
  );
}

function CashPanel({ cash, onSet }) {
  const neg = cash.left < 0;
  return (
    <div className="bal-panel cash-panel" id="bal-cash">
      <div className="bp-row">
        <span>Cash set by you{cash.set ? ` · ${dayShort(cash.set.asOf)}` : ' · not set yet'}</span>
        <span className="bp-amt">{formatCents(cash.set?.cents ?? 0)}</span>
      </div>
      <div className="bp-row">
        <span>ATM withdrawals ({cash.withdrawals.count}) <span className="bp-tag cash">auto</span></span>
        <span className="bp-amt text-in">{formatCents(cash.withdrawals.cents, { sign: true })}</span>
      </div>
      {cash.own.count > 0 && (
        <div className="bp-row">
          <span>Own cash put back in the bank ({cash.own.count})</span>
          <span className="bp-amt text-out">{formatCents(-cash.own.cents, { sign: true })}</span>
        </div>
      )}
      <div className="bp-row">
        <span>Cash spent ({cash.spent.count})</span>
        <span className="bp-amt text-out">{formatCents(-cash.spent.cents, { sign: true })}</span>
      </div>
      <div className="bp-row bp-total"><span>Cash left</span><span className={`bp-amt${neg ? ' text-out' : ''}`}>{formatCents(cash.left)}</span></div>
      {neg && <p className="cash-neg">Your cash is below zero, so a withdrawal or an old cash purchase is missing. Set your cash balance to fix it.</p>}
      <div className="cash-acts"><button type="button" className="cash-pill" onClick={onSet}>Set cash balance</button></div>
    </div>
  );
}

// Sheet: "Set cash balance" (prototype v4). Saves the amount as of today; moni counts from then on.
export function SetCashSheet({ cash, today, onClose, onToast }) {
  const [text, setText] = useState(() => (Math.max(cash.left, 0) / 100).toFixed(2));
  const [error, setError] = useState('');
  let cents = null;
  try { const c = parseCents(text); if (c >= 0) cents = c; } catch { cents = null; }
  const diff = cents == null ? null : cents - cash.left;
  async function save() {
    if (cents == null) { setError('Enter an amount, like 50.00'); return; }
    try { await setCashBalance(cents, today); onToast?.('Cash balance saved'); onClose(); } catch (e) { setError(e.message); }
  }
  return (
    <Sheet title="Set cash balance" onClose={onClose}>
      <div className="sheet-body">
        <h3 className="cash-q">How much cash do you have right now?</h3>
        <label className="field">
          <span className="small">Cash in hand (AUD)</span>
          <input className="input amount-input" inputMode="decimal" value={text} aria-label="Cash in hand"
            onChange={(e) => { setText(e.target.value); setError(''); }} />
        </label>
        <div className="field">
          <span className="small">As of</span>
          <span className="input cash-asof">Today, {longDay(today)}</span>
        </div>
        <div className="cash-eff">
          <div><span>Cash left today (calculated)</span><span>{formatCents(cash.left)}</span></div>
          <div><span>Your count</span><span>{cents == null ? '\u2014' : formatCents(cents)}</span></div>
          <div><span>Adjustment</span><span>{diff == null ? 'enter an amount' : diff === 0 ? 'none' : formatCents(diff, { sign: true })}</span></div>
        </div>
        <p className="hint">Moni counts from this date forward. Withdrawals and cash spending before it stay in Spending and Activity, but no longer change the cash balance. Use this the first time, and again whenever you get or lose cash outside moni.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="button" className="btn primary" onClick={save}>Save cash balance</button>
      </div>
    </Sheet>
  );
}

function BalanceCard({ bal, balance, saverBalances, est, cash, today, onDetail, onToast }) {
  const [open, setOpen] = useState(null);
  const [setting, setSetting] = useState(false);
  // est (M4.1): bank balance + what moni knows happened since (typed entries, the other account's CSV).
  const mainCents = est?.main?.cents ?? bal;
  const mainInfo = est?.main ?? null;
  const savers = SAVERS.map((a) => ({ ...a, b: est?.savers?.[a.id] ?? saverBalances?.[a.id] })).filter((a) => a.b && a.b.cents > 0);
  const main = (
    <BalanceHalf id="main" label="Smart Access" cents={mainCents} info={mainInfo} open={open} setOpen={setOpen}
      note={`${savers.length ? 'as of ' : 'Bank as of '}${longDay(balance.asOf)}`}
      onOpenAccount={() => onDetail('account', { account: 'xx6193' })} />
  );
  const mainPanel = open === 'main' && mainInfo && (
    <Breakdown id="main" title="Smart Access balance" info={mainInfo} total={mainCents} onToast={onToast}
      banks={[{ label: 'CSV', asOf: mainInfo.asOf, cents: mainInfo.bank }]} />
  );
  if (!savers.length) {
    if (!cash) return <div className="balance-card">{main}{mainPanel}</div>;
    return (
      <div className="balance-card with-cash">
        {main}
        <CashHalf cash={cash} open={open} setOpen={setOpen} />
        {mainPanel}
        {open === 'cash' && <CashPanel cash={cash} onSet={() => setSetting(true)} />}
        {setting && <SetCashSheet cash={cash} today={today} onClose={() => setSetting(false)} onToast={onToast} />}
      </div>
    );
  }
  const total = savers.reduce((a, s) => a + s.b.cents, 0);
  const newest = savers.reduce((a, s) => (s.b.asOf > a ? s.b.asOf : a), savers[0].b.asOf);
  const saveInfo = {
    items: savers.flatMap((s) => s.b.items ?? []).sort((a, b) => a.date.localeCompare(b.date)),
    confirms: [],
  };
  return (
    <div className={`balance-card split${cash ? ' with-cash' : ''}`}>
      {main}
      <i className="bal-rule" aria-hidden="true" />
      <BalanceHalf id="save" cls=" save" label="Savings" cents={total} info={saveInfo} open={open} setOpen={setOpen}
        note={`${savers.map((s) => s.id).join(' + ')} · ${longDay(newest)}`}
        onOpenAccount={() => onDetail('account', { account: savers[0].id })} />
      {cash && <CashHalf cash={cash} open={open} setOpen={setOpen} />}
      {mainPanel}
      {open === 'cash' && cash && <CashPanel cash={cash} onSet={() => setSetting(true)} />}
      {setting && cash && <SetCashSheet cash={cash} today={today} onClose={() => setSetting(false)} onToast={onToast} />}
      {open === 'save' && (
        <Breakdown id="save" title="Savings balance" info={saveInfo} total={total} onToast={onToast}
          banks={savers.map((s) => ({ label: s.id, asOf: s.b.asOf, cents: s.b.bank ?? s.b.cents }))} />
      )}
    </div>
  );
}

export default function Home({ txns, bills = [], today, month, setMonth, firstMonth, balance, saverBalances, est, cash = null, sync, backupMeta = null, onNavigate, onDetail, onToast }) {
  const current = monthKey(today);
  const online = useOnline();
  // Backup reminder (batch 4): the 30-day clock starts the first time this device has data.
  const hasData = txns.length > 0;
  const needsClock = hasData && backupMeta !== undefined && !backupMeta?.at && !backupMeta?.since;
  useEffect(() => { if (needsClock) startBackupClock(); }, [needsClock]);
  const dueBackup = backupDue(backupMeta, hasData, Date.now());
  const summary = useMemo(() => summarizeMonth(txns, month), [txns, month]);
  const reviewCount = useMemo(() => txns.filter((t) => t.kind === 'review').length, [txns]);
  const bal = useMemo(() => currentBalance(balance, txns), [balance, txns]);
  const compare = useMemo(() => monthCompare(txns, month, today), [txns, month, today]);
  // Rent pill: from your Rent bill when there is one (same date as the Bills page), else guessed from past rent.
  const rent = useMemo(() => {
    if (month !== current) return null;
    const fromBill = rentFromBills(bills, txns, today);
    return fromBill === undefined ? upcomingRent(txns, today) : fromBill;
  }, [txns, bills, today, month, current]);

  // Spending categories only (investing has its own page)
  const where = useMemo(() => {
    const totals = {};
    for (const [id, c] of Object.entries(summary.byCategory)) if (c > 0 && kindForCategory(id) === 'spend') totals[id] = c;
    const { total, rows } = categoryRows(totals);
    return { total, rows };
  }, [summary]);

  if (!txns.length) {
    return (
      <main className="screen">
        <header className="header"><div className="title">moni</div><SettingsButton onClick={() => onNavigate('settings')} /></header>
        <section className="card welcome">
          <span className="card-title">Start with your bank history</span>
          <p className="label">Export a CSV from NetBank for your everyday account, then import it here. Everything stays on this device.</p>
          <ImportButton className="btn primary" onDone={onToast} />
          <button type="button" className="btn ghost" onClick={() => onNavigate('add')}>Or add a transaction by hand</button>
          <button type="button" className="btn ghost" onClick={() => onNavigate('settings')}>Already using moni elsewhere? Connect sync</button>
        </section>
      </main>
    );
  }

  return (
    <main className="screen home">
      <header className="header home-head">
        <div className="head-month">
          <MonthDropdown month={month} setMonth={setMonth} current={current} first={firstMonth} />
          {!online && <OfflinePill />}
        </div>
        {rent && <RentPill rent={rent} onOpen={() => onNavigate('bills')} />}
        {reviewCount > 0 && (
          <button type="button" className="sort-pill" onClick={() => onNavigate('activity', 'review')}
            aria-label={`${reviewCount} transactions to sort`}>
            <Icon name="inbox" size={18} /><span><strong>{reviewCount}</strong><span className="sort-text"> to sort</span></span>
          </button>
        )}
        <div className="head-gear"><SettingsButton onClick={() => onNavigate('settings')} /></div>
      </header>

      {sync?.lastError && (
        <button type="button" className="banner action" onClick={() => onNavigate('settings')}>
          <span className="text-over">Sync stopped: {sync.lastError.message}</span>
          <span className="link-text">Fix</span>
        </button>
      )}
      {dueBackup && (
        <button type="button" className="bk-remind" onClick={() => { settingsJump.to = 'backup'; onNavigate('settings'); }}>
          <span>{backupMeta?.at ? `Last backup was ${backupAgo(backupMeta.at)}.` : 'You haven’t saved a backup yet.'}</span>
          <span className="link-text">Back up</span>
        </button>
      )}
      {!sync?.token && (
        <button type="button" className="banner action" onClick={() => onNavigate('settings')}>
          <span>Only saved on this device. Turn on sync to see it everywhere.</span>
          <span className="link-text">Set up</span>
        </button>
      )}

      <div className="home-grid">
        <div className="col">
          {bal != null && <BalanceCard bal={bal} balance={balance} saverBalances={saverBalances} est={est} cash={cash} today={today} onDetail={onDetail} onToast={onToast} />}
          <Shortcuts onNavigate={onNavigate} onDetail={onDetail} />
          <SpentSoFar month={month} current={current} today={today} spent={summary.spent} income={summary.income} compare={compare}
            onClick={() => onDetail('spending')} />
        </div>

        <div className="col">
          <CashFlowCard month={month} summary={summary} onClick={() => onDetail('cashflow')} />
          <WhereCard rows={where.rows} total={where.total} onOpen={() => onDetail('where')}
            onCategory={(id) => onDetail('spending', { category: id })} />
        </div>
      </div>
    </main>
  );
}
