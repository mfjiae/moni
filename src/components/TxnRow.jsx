import { formatCents } from '../lib/money.js';
import { categoryName } from '../lib/categories.js';
import { shortName } from '../lib/activity.js';
import { accountOf, isMain } from '../lib/accounts.js';
import { cashTag, isCash } from '../lib/cash.js';

// Friendlier names for transfers with your own savings accounts
export function displayName(t) {
  if (t.kind === 'saving') {
    if (/XX2066/i.test(t.description)) return t.amountCents < 0 ? 'To savings' : 'From savings';
    if (/XX2103/i.test(t.description)) return t.amountCents < 0 ? 'To 2nd savings' : 'From 2nd savings';
    if (/XX6193/i.test(t.description)) return t.amountCents < 0 ? 'To Smart Access' : 'From Smart Access';
  }
  return shortName(t.description);
}

export const amountClass = (t) => {
  if (t.kind === 'saving' || t.kind === 'internal') return '';
  if (t.kind === 'income') return ' text-in';
  if (t.kind === 'investing') return ' text-invest';
  return t.amountCents > 0 ? ' text-in' : '';
};

// showAccount: tag rows from a savings account (Activity, Income...); account pages turn it off.
// tags: small chips after the name, e.g. the ETFs an investing transaction bought: [{ text, cls }].
export default function TxnRow({ t, meta, tags, onOpen, showAccount = true }) {
  const cat = t.kind === 'review' ? 'To sort' : categoryName(t.categoryId);
  const muted = t.kind === 'saving' || t.kind === 'internal';
  // Paid with cash: a cash purchase shows only its warm "cash" tag (no "typed" / "manual"); ATM withdrawals,
  // cash deposits and online family deposits get their own tag (prototype "Moni Paid With Cash" v4).
  // Push 2: rows counted in the Cash balance show their cash effect under the amount (`cashFx`, set in App), and
  // rows that may be a missed ATM withdrawal get a rose "Cash withdrawal?" tag (`atmAsk`).
  const cash = isCash(t);
  const ctag = cashTag(t);
  return (
    <button type="button" className={`txn${muted ? ' muted-row' : ''}`} onClick={() => onOpen(t.uid)}>
      <div>
        <span className="merchant">{displayName(t)}{showAccount && !isMain(accountOf(t)) && <span className="acct-tag">{accountOf(t)}</span>}</span>
        <span className="small cat-line">
          <span className="cat-text">
            {t.kind === 'review' ? <span className="text-review">{cat}</span> : cat}
            {meta ? ` · ${meta}` : ''}
            {!cash && t.source === 'manual' && t.typed !== 'pending' ? ' · manual' : ''}
          </span>
          {!cash && t.typed === 'pending' && <span className="typed-tag">typed</span>}
          {t.atmAsk && <span className="cash-tag ask">Cash withdrawal?</span>}
          {ctag && <span className={`cash-tag${ctag.cls === 'cash' ? '' : ` ${ctag.cls}`}`}>{ctag.text}</span>}
          {tags?.map((g) => <span key={g.text} className={`etf-tag${g.cls ? ` ${g.cls}` : ''}`}>{g.text}</span>)}
        </span>
      </div>
      {t.cashFx ? (
        <span className="amt-col">
          <span className={`amount${amountClass(t)}`}>{formatCents(t.amountCents, { sign: true })}</span>
          <span className="cash-fx">cash {formatCents(t.cashFx, { sign: true })}</span>
        </span>
      ) : <span className={`amount${amountClass(t)}`}>{formatCents(t.amountCents, { sign: true })}</span>}
    </button>
  );
}
