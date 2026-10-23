import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, requestPersistentStorage } from './lib/db.js';
import { todaySydney, monthKey } from './lib/dates.js';
import { setCategoryOverrides } from './lib/categories.js';
import { firstDataMonth } from './lib/summary.js';
import { migrateRules } from './lib/store.js';
import { useCategoryUsage } from './components/ui.jsx';
import Home from './components/Home.jsx';
import Detail from './components/Detail.jsx';
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
      aria-label={badge ? `${label}, ${badge} to sort` : label}>
      <span className="nav-icon">
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{Icon[id]}</svg>
        {badge > 0 && <span className="badge" aria-hidden="true">{badge > 99 ? '99+' : badge}</span>}
      </span>
      <span>{label}</span>
      {badge > 0 && <span className="badge badge-inline" aria-hidden="true">{badge > 99 ? '99+' : badge}</span>}
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
  const [filterKey, setFilterKey] = useState(0);
  const [openId, setOpenId] = useState(null);
  const [toast, setToast] = useState(null);
  const [page, setPage] = useState(null); // detail page: { name, category? }
  const pushed = useRef(false);
  const pageRef = useRef(null);
  useEffect(() => { pageRef.current = page; }, [page]);

  const txns = useLiveQuery(() => db.txns.toArray(), []);
  const balance = useLiveQuery(() => db.meta.get('balance'), []);
  const sync = useLiveQuery(() => db.meta.get('sync'), []);
  const cats = useLiveQuery(() => db.categories.toArray(), []);

  // Your renamed / hidden / added categories (synced) apply everywhere.
  const catsReady = useMemo(() => { setCategoryOverrides(cats ?? []); return cats !== undefined; }, [cats]);
  const usage = useCategoryUsage(txns);
  const firstMonth = useMemo(() => firstDataMonth(txns ?? []), [txns]);

  useEffect(() => { requestPersistentStorage(); }, []);

  // Detail pages: the phone's back gesture closes them instead of leaving the app.
  useEffect(() => {
    const onPop = () => {
      const p = pageRef.current;
      if (p?.from) {            // came from another detail page: go back to that one, keep one history entry
        setPage(p.from);
        window.history.pushState({ moni: 'detail' }, '');
        return;
      }
      pushed.current = false;
      setPage(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const openDetail = (name, extra = {}) => {
    setPage((prev) => ({ name, ...extra, from: prev ? { name: prev.name, category: prev.category } : undefined }));
    if (!pushed.current) { window.history.pushState({ moni: 'detail' }, ''); pushed.current = true; }
    window.scrollTo(0, 0);
  };
  const closeDetail = () => {
    if (pushed.current) window.history.back(); else setPage(null);
  };

  // Sync when the app opens, when it comes back to the screen, and when the connection returns.
  // After the first sync, catch up older transactions with the M2.5 rules (once per device).
  useEffect(() => {
    let alive = true;
    syncNow().then(() => migrateRules()).then((n) => {
      if (alive && n) setToast(`Updated ${n} transactions to the new categories`);
    }).catch(() => {});
    const onVisible = () => { if (document.visibilityState === 'visible') syncNow(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', syncNow);
    return () => {
      alive = false;
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
    if (f) { setFilter(f); setFilterKey((k) => k + 1); }
    if (page) closeDetail();
    setTab(t);
    window.scrollTo(0, 0);
  };

  if (txns === undefined || !catsReady) return <div className="app"><div className="empty">Loading…</div></div>;

  const reviewCount = txns.filter((t) => t.kind === 'review').length;
  const open = openId != null ? txns.find((t) => t.uid === openId) : null;

  return (
    <div className="app">
      {tab === 'home' && !page && (
        <Home txns={txns} today={today} month={month} setMonth={setMonth} firstMonth={firstMonth} balance={balance} sync={sync}
          onNavigate={go} onDetail={openDetail} onOpen={setOpenId} onToast={setToast} />
      )}
      {(tab === 'home' || tab === 'cashflow') && page && (
        <Detail page={page} txns={txns} today={today} month={month} setMonth={setMonth} firstMonth={firstMonth}
          balance={balance} onBack={closeDetail} onOpen={setOpenId} onDetail={openDetail}
          rootLabel={tab === 'cashflow' ? 'Cash flow' : 'Home'} />
      )}
      {tab === 'cashflow' && !page && (
        <Detail page={{ name: 'cashflow' }} txns={txns} today={today} month={month} setMonth={setMonth} firstMonth={firstMonth}
          balance={balance} onBack={() => go('home')} onOpen={setOpenId} onDetail={openDetail} rootLabel="Home" />
      )}
      {tab === 'activity' && (
        <Activity txns={txns} today={today} preset={filter} presetKey={filterKey || null} onOpen={setOpenId} onToast={setToast} />
      )}
      {tab === 'add' && <AddTxn today={today} usage={usage} onDone={() => go('home')} onToast={setToast} />}
      {tab === 'budgets' && <Placeholder title="Budgets" milestone="M3" />}
      {tab === 'settings' && <Settings sync={sync} txns={txns} onToast={setToast} />}

      {open && <TxnSheet key={open.uid} txn={open} usage={usage} onClose={() => setOpenId(null)} onToast={setToast} />}

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
