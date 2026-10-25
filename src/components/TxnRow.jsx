import { formatCents } from '../lib/money.js';
import { categoryName } from '../lib/categories.js';
import { shortName } from '../lib/activity.js';
import { accountOf, isMain } from '../lib/accounts.js';

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
  return (
    <button type="button" className={`txn${muted ? ' muted-row' : ''}`} onClick={() => onOpen(t.uid)}>
      <div>
        <span className="merchant">{displayName(t)}{showAccount && !isMain(accountOf(t)) && <span className="acct-tag">{accountOf(t)}</span>}</span>
        <span className="small">
          {t.kind === 'review' ? <span className="text-review">{cat}</span> : cat}
          {meta ? ` · ${meta}` : ''}
          {t.source === 'manual' ? ' · manual' : ''}
          {tags?.map((g) => <span key={g.text} className={`etf-tag${g.cls ? ` ${g.cls}` : ''}`}>{g.text}</span>)}
        </span>
      </div>
      <span className={`amount${amountClass(t)}`}>{formatCents(t.amountCents, { sign: true })}</span>
    </button>
  );
}
