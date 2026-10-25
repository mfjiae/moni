import { useMemo, useState } from 'react';
import { formatCents } from '../lib/money.js';
import { longDay, relativeDay } from '../lib/dates.js';
import { groupByDay } from '../lib/daygroups.js';
import TxnRow from './TxnRow.jsx';

// Day-grouped transactions (CommBank style): a header per day (date, how long ago, net total), paged by whole days.
// The button says exactly how many more it will show.
export default function TxnList({ title, list, today, onOpen, empty, metaFor, tagsFor, showAccount = true }) {
  const [limit, setLimit] = useState(30);
  const { groups, shown } = useMemo(() => groupByDay(list, limit), [list, limit]);
  const next = useMemo(() => groupByDay(list, limit + 30).shown - shown, [list, limit, shown]);
  return (
    <section className="card list txn-box" aria-label={title}>
      <div className="card-head"><span className="card-title">{title}</span><span className="small">{list.length}</span></div>
      {list.length
        ? groups.map((g) => {
          const rel = relativeDay(g.date, today);
          return (
            <div key={g.date} role="group" aria-label={longDay(g.date)}>
              <div className="day-head">
                <span className="day-date">{longDay(g.date)}{rel && <span className="day-rel">{rel}</span>}</span>
                <span className="day-total">{formatCents(g.netCents, { sign: true })}</span>
              </div>
              {g.items.map((t) => <TxnRow key={t.uid} t={t} onOpen={onOpen} meta={metaFor?.(t)} tags={tagsFor?.(t)} showAccount={showAccount} />)}
            </div>
          );
        })
        : <div className="empty small-empty">{empty}</div>}
      {list.length > shown && (
        <button type="button" className="btn ghost more" onClick={() => setLimit(limit + 30)}>Show {next} more &middot; {list.length - shown} left</button>
      )}
    </section>
  );
}

