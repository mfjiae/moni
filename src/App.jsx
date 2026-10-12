import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, requestPersistentStorage } from './lib/db.js';
import { todaySydney, monthKey } from './lib/dates.js';
import Home from './components/Home.jsx';
import Activity from './components/Activity.jsx';
import AddTxn from './components/AddTxn.jsx';
import TxnSheet from './components/TxnSheet.jsx';
import Settings from './components/Settings.jsx';
import { syncNow } from './lib/sync.js';

const Icon = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  budgets: <path d="M4 7h16M4 12h10M4 17h6" />,
  cashflow: <path d="M6 20V10M12 20V4M18 20v-7" />,
  activity: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" /></>,
};

function NavItem({ id, label, tab, go, badge, className = '' }) {
  return (
    <button type="button" className={`nav-item${tab === id ? ' active' : ''} ${className}`} onClick={() => go(id)}
      aria-current={tab === id ? 'page' : undefined}
      aria-label={badge ? `${label}, ${badge} to review` : label}>
      <span className="nav-icon">
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{Icon[id]}</svg>
        {badge > 0 && <span className="badge" aria-hidden="true">{badge > 99 ? '99+' : badge}</span>}
      </span>
      <span>{label}</span>
    </button>
  );
}

function Placeholder({ title, milestone }) {
  return (
    <main className="screen">
      <header className="header"><div className="title">{title}</div></header>
      <div className="empty">Coming in {milestone}.</div>
    </main>
  );
}

export default function App() {
  const today = todaySydney();
  const [tab, setTab] = useState('home');
  const [month, setMonth] = useState(monthKey(today));
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);
  const [toast, setToast] = useState(null);

  const txns = useLiveQuery(() => db.txns.toArray(), []);
  const balance = useLiveQuery(() => db.meta.get('balance'), []);
  const sync = useLiveQuery(() => db.meta.get('sync'), []);

  useEffect(() => { requestPersistentStorage(); }, []);

  // Sync when the app opens, when it comes back to the screen, and when the connection returns.
  useEffect(() => {
    syncNow();
    const onVisible = () => { if (document.visibilityState === 'visible') syncNow(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', syncNow);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', syncNow);
    };
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const go = (t, f) => {
    if (f) setFilter(f);
    setTab(t);
    window.scrollTo(0, 0);
  };

  if (txns === undefined) return <div className="app"><div className="empty">Loading…</div></div>;

  const reviewCount = txns.filter((t) => t.kind === 'review').length;
  const open = openId != null ? txns.find((t) => t.uid === openId) : null;

  return (
    <div className="app">
      {tab === 'home' && (
        <Home txns={txns} today={today} month={month} setMonth={setMonth} balance={balance} sync={sync}
          onNavigate={go} onOpen={setOpenId} onToast={setToast} />
      )}
      {tab === 'activity' && (
        <Activity txns={txns} today={today} filter={filter} setFilter={setFilter} onOpen={setOpenId} onToast={setToast} />
      )}
      {tab === 'add' && <AddTxn today={today} onDone={() => go('home')} onToast={setToast} />}
      {tab === 'budgets' && <Placeholder title="Budgets" milestone="M3" />}
      {tab === 'cashflow' && <Placeholder title="Cash flow" milestone="M4" />}
      {tab === 'settings' && <Settings sync={sync} onToast={setToast} />}

      {open && <TxnSheet key={open.uid} txn={open} onClose={() => setOpenId(null)} onToast={setToast} />}

      {toast && <div className="toast" role="status">{toast}</div>}

      <nav className="nav" aria-label="Main">
        <div className="nav-inner">
          <div className="nav-brand">moni</div>
          <NavItem id="home" label="Home" tab={tab} go={go} />
          <NavItem id="budgets" label="Budgets" tab={tab} go={go} />
          <button type="button" className="add-btn" aria-label="Add transaction" onClick={() => go('add')}>
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            <span className="add-label">Add transaction</span>
          </button>
          <NavItem id="cashflow" label="Cash flow" tab={tab} go={go} />
          <NavItem id="activity" label="Activity" tab={tab} go={go} badge={reviewCount} />
          <NavItem id="settings" label="Settings" tab={tab} go={go} className="desktop-only" />
        </div>
      </nav>
    </div>
  );
}
