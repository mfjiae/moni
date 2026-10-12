import { formatCents } from '../lib/money.js';
import { categoryById } from '../lib/categories.js';

// Friendlier names for transfers with your own savings account
export function displayName(t) {
  if (t.kind === 'saving' && /XX2066/i.test(t.description)) return t.amountCents < 0 ? 'To savings' : 'From savings';
  return t.description;
}

export default function TxnRow({ t, meta, onOpen }) {
  const cat = t.kind === 'review' ? 'To review' : (categoryById[t.categoryId]?.name ?? 'Other');
  const muted = t.kind === 'saving' || t.kind === 'internal';
  return (
    <button type="button" className={`txn${muted ? ' muted-row' : ''}`} onClick={() => onOpen(t.id)}>
      <div>
        <span className="merchant">{displayName(t)}</span>
        <span className="small">
          {t.kind === 'review' ? <span className="text-near">{cat}</span> : cat}
          {meta ? ` · ${meta}` : ''}
          {t.source === 'manual' ? ' · manual' : ''}
        </span>
      </div>
      <span className={`amount${t.amountCents > 0 ? ' text-good' : ''}`}>{formatCents(t.amountCents, { sign: true })}</span>
    </button>
  );
}
