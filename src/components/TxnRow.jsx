import { formatCents } from '../lib/money.js';
import { categoryName } from '../lib/categories.js';

// Friendlier names for transfers with your own savings accounts
export function displayName(t) {
  if (t.kind === 'saving') {
    if (/XX2066/i.test(t.description)) return t.amountCents < 0 ? 'To savings' : 'From savings';
    if (/XX2103/i.test(t.description)) return t.amountCents < 0 ? 'To 2nd savings' : 'From 2nd savings';
  }
  return t.description;
}

export const amountClass = (t) => {
  if (t.kind === 'saving' || t.kind === 'internal') return '';
  if (t.kind === 'income') return ' text-in';
  if (t.kind === 'investing') return ' text-invest';
  return t.amountCents > 0 ? ' text-in' : '';
};

export default function TxnRow({ t, meta, onOpen }) {
  const cat = t.kind === 'review' ? 'To review' : categoryName(t.categoryId);
  const muted = t.kind === 'saving' || t.kind === 'internal';
  return (
    <button type="button" className={`txn${muted ? ' muted-row' : ''}`} onClick={() => onOpen(t.uid)}>
      <div>
        <span className="merchant">{displayName(t)}</span>
        <span className="small">
          {t.kind === 'review' ? <span className="text-review">{cat}</span> : cat}
          {meta ? ` · ${meta}` : ''}
          {t.source === 'manual' ? ' · manual' : ''}
        </span>
      </div>
      <span className={`amount${amountClass(t)}`}>{formatCents(t.amountCents, { sign: true })}</span>
    </button>
  );
}
