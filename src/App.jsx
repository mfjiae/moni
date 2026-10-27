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
import Budgets from './components/Budgets.jsx';
import Bills from './components/Bills.jsx';
import { syncNow } from './lib/sync.js';
import { countedView, estimateBalances, SAVERS, balanceKey } from './lib/accounts.js';
import { markTyped } from './lib/typed.js';
import { cashBalance, cashDot, atmQuestion, atmSkipRules } from './lib/cash.js';
import { etfList, lastPick } from './lib/investing.js';
import { setNicknames } from './lib/names.js';

const Icon = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  budgets: <path d="M4 7h16M4 12h10M4 17h6" />,
  cashflow: <path d="M6 20V10M12 20V4M18 20v-7" />,
  bills: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M8 15h3" /></>,
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

  // allTxns = every account's rows as stored; txns = what moni counts (Smart Access + saver-only rows,
  // each transfer once; see accounts.js). Every total uses txns; the account pages use allTxns.
  const allTxns = useLiveQuery(() => db.txns.toArray(), []);
  const balance = useLiveQuery(() => db.meta.get('balance'), []);
  // Typed entries get `typed: 'pending' | 'manual'` for the list tags (UI bundle 2, typed.js).
  const baseTxns = useMemo(() => (allTxns ? markTyped(countedView(allTxns), balance?.asOf) : undefined), [allTxns, balance]);
  // Paid with cash, Push 2 (cash.js): the Cash balance, and rows marked with their cash effect (`cashFx`, cents)
  // and with "Cash withdrawal?" (`atmAsk`) while that question is open.
  const cashSetting = useLiveQuery(() => db.meta.get('cash'), []);
  const userRules = useLiveQuery(() => db.userRules.toArray(), []);
  const cash = useMemo(() => {
    if (!baseTxns) return null;
    const c = cashBalance(baseTxns, cashSetting ?? null);
    return { ...c, dot: cashDot(baseTxns, cashSetting ?? null, balance?.asOf) };
  }, [baseTxns, cashSetting, balance]);
  const skipAtm = useMemo(() => atmSkipRules(userRules ?? []), [userRules]);
  // Your nicknames for bank text (names.js, synced). Set before the rows render; `txns` is rebuilt when they
  // change so searches and lists pick up a new name straight away.
  const nameRecs = useLiveQuery(() => db.names.toArray(), []);
  const namesReady = useMemo(() => { setNicknames(nameRecs ?? []); return nameRecs !== undefined; }, [nameRecs]);
  const txns = useMemo(() => (baseTxns && cash ? baseTxns.map((t) => {
    const fx = cash.effects.get(t.uid);
    const ask = atmQuestion(t, skipAtm);
    return fx || ask ? { ...t, ...(fx ? { cashFx: fx } : {}), ...(ask ? { atmAsk: true } : {}) } : t;
  }) : undefined), [baseTxns, cash, skipAtm, nameRecs]);
  const saverBalances = useLiveQuery(async () => {
    const list = await Promise.all(SAVERS.map((a) => db.meta.get(balanceKey(a.id))));
    return Object.fromEntries(SAVERS.map((a, i) => [a.id, list[i] ?? null]));
  }, []);
  const est = useMemo(() => (allTxns ? estimateBalances(allTxns, balance ?? null, saverBalances ?? {}) : null), [allTxns, balance, saverBalances]);
  const sync = useLiveQuery(() => db.meta.get('sync'), []);
  const backupMeta = useLiveQuery(() => db.meta.get('backup'), []);
  const cats = useLiveQuery(() => db.categories.toArray(), []);
  const plans = useLiveQuery(() => db.budgetPlans.toArray(), []);
  const etfRecords = useLiveQuery(() => db.etfs.toArray(), []);
  const bills = useLiveQuery(() => db.bills.toArray(), []);
  const etfs = useMemo(() => (txns && etfRecords ? etfList(etfRecords, txns) : []), [etfRecords, txns]);
  const lastEtf = useMemo(() => (txns ? lastPick(txns) : null), [txns]);

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

  if (txns === undefined || !catsReady || plans === undefined || etfRecords === undefined || bills === undefined || !namesReady) return <div className="app"><div className="empty">Loading…</div></div>;

  const reviewCount = txns.filter((t) => t.kind === 'review').length;
  const open = openId != null ? (txns.find((t) => t.uid === openId) ?? allTxns.find((t) => t.uid === openId)) : null;

  return (
    <div className="app">
      {tab === 'home' && !page && (
        <Home txns={txns} bills={bills} today={today} month={month} setMonth={setMonth} firstMonth={firstMonth} balance={balance} saverBalances={saverBalances} est={est} cash={cash} sync={sync} backupMeta={backupMeta}
          onNavigate={go} onDetail={openDetail} onOpen={setOpenId} onToast={setToast} />
      )}
      {(tab === 'home' || tab === 'cashflow' || tab === 'bills') && page && (
        <Detail page={page} txns={txns} today={today} month={month} setMonth={setMonth} firstMonth={firstMonth}
          balance={balance} saverBalances={saverBalances} est={est} allTxns={allTxns} onBack={closeDetail} onOpen={setOpenId} onDetail={openDetail} etfs={etfs}
          rootLabel={tab === 'cashflow' ? 'Cash flow' : tab === 'bills' ? 'Bills' : 'Home'} />
      )}
      {tab === 'cashflow' && !page && (
        <Detail page={{ name: 'cashflow' }} txns={txns} today={today} month={month} setMonth={setMonth} firstMonth={firstMonth}
          balance={balance} onBack={() => go('home')} onOpen={setOpenId} onDetail={openDetail} etfs={etfs} rootLabel="Home" />
      )}
      {tab === 'bills' && !page && (
        <Bills txns={txns} bills={bills} today={today} usage={usage} onDetail={openDetail} onToast={setToast} />
      )}
      {tab === 'activity' && (
        <Activity txns={txns} today={today} usage={usage} preset={filter} presetKey={filterKey || null} onOpen={setOpenId} onToast={setToast} />
      )}
      {tab === 'add' && <AddTxn today={today} usage={usage} est={est} cash={cash} onDone={() => go('home')} onToast={setToast} />}
      {tab === 'budgets' && (
        <Budgets txns={txns} plans={plans} today={today} month={month} setMonth={setMonth} firstMonth={firstMonth} onToast={setToast} />
      )}
      {tab === 'settings' && <Settings sync={sync} txns={txns} onToast={setToast} />}

      {open && <TxnSheet key={open.uid} txn={open} txns={txns} usage={usage} etfs={etfs} lastEtf={lastEtf} onClose={() => setOpenId(null)} onToast={setToast} />}

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
          <NavItem id="bills" label="Bills" tab={tab} go={go} />
          <NavItem id="activity" label="Activity" tab={tab} go={go} badge={reviewCount} />
          <NavItem id="settings" label="Settings" tab={tab} go={go} className="desktop-only" />
        </div>
      </nav>
    </div>
  );
}
