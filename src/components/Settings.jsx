import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db.js';
import { connect, disconnect, syncNow, DEFAULT_REPO } from '../lib/sync.js';
import { clearDevice, updateCategory, addCategory, deleteRule } from '../lib/store.js';
import { allCategories, categoryName, LOCKED, TYPE_LABEL } from '../lib/categories.js';
import { isBroadKeyword } from '../lib/rules.js';

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

function ago(ms) {
  if (!ms) return 'never';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function CategoryRow({ c, count, onToast }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);
  async function save(e) {
    e.preventDefault();
    if (!name.trim()) return;
    await updateCategory(c.id, { name: name.trim() });
    setEditing(false);
    onToast(`Renamed to ${name.trim()}`);
  }
  if (editing) {
    return (
      <form className="set-row" onSubmit={save}>
        <input className="input" value={name} aria-label={`New name for ${c.name}`} autoFocus onChange={(e) => setName(e.target.value)} />
        <div className="actions">
          <button type="submit" className="btn small-btn">Save</button>
          <button type="button" className="btn ghost small-btn" onClick={() => { setEditing(false); setName(c.name); }}>Cancel</button>
        </div>
      </form>
    );
  }
  return (
    <div className="set-row">
      <span className="name">{c.name}{count ? <span className="tag">{count}</span> : null}</span>
      <div className="actions">
        <button type="button" className="btn ghost small-btn" onClick={() => setEditing(true)}>Rename</button>
        {!LOCKED.has(c.id) && (
          <button type="button" className="btn ghost small-btn" onClick={() => updateCategory(c.id, { hidden: !c.hidden })}>
            {c.hidden ? 'Show' : 'Hide'}
          </button>
        )}
      </div>
    </div>
  );
}

function CategoriesCard({ txns, onToast }) {
  const [showHidden, setShowHidden] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('spend');
  const counts = useMemo(() => {
    const u = {};
    for (const t of txns ?? []) if (t.categoryId) u[t.categoryId] = (u[t.categoryId] ?? 0) + 1;
    return u;
  }, [txns]);
  const list = allCategories();
  const visible = list.filter((c) => !c.hidden);
  const hidden = list.filter((c) => c.hidden);
  const groups = ['spend', 'income', 'investing', 'saving', 'internal']
    .map((t) => ({ t, items: visible.filter((c) => c.type === t) }))
    .filter((g) => g.items.length);

  async function add(e) {
    e.preventDefault();
    try {
      await addCategory(name, type);
      onToast(`Added ${name.trim()}`);
      setName('');
    } catch (err) {
      onToast(err.message);
    }
  }

  return (
    <section className="card" aria-label="Categories">
      <span className="card-title">Categories</span>
      <p className="hint">Rename or hide categories, or add your own. Hidden ones disappear from the picker; transactions already in them keep them. Changes sync to your other devices.</p>
      {groups.map((g) => (
        <div className="set-group" key={g.t}>
          <div className="set-group-title">{TYPE_LABEL[g.t]}</div>
          {g.items.map((c) => <CategoryRow key={c.id} c={c} count={counts[c.id]} onToast={onToast} />)}
        </div>
      ))}
      {hidden.length > 0 && (
        <div className="set-group">
          <button type="button" className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setShowHidden(!showHidden)}>
            {showHidden ? 'Hide' : 'Show'} hidden categories ({hidden.length})
          </button>
          {showHidden && hidden.map((c) => <CategoryRow key={c.id} c={c} count={counts[c.id]} onToast={onToast} />)}
        </div>
      )}
      <form className="form" onSubmit={add}>
        <label className="field">
          <span className="small">New category</span>
          <input className="input" value={name} placeholder="e.g. Coffee" onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="segmented" role="tablist" aria-label="Type">
          <button type="button" role="tab" aria-selected={type === 'spend'} className={type === 'spend' ? 'on' : ''} onClick={() => setType('spend')}>Spending</button>
          <button type="button" role="tab" aria-selected={type === 'income'} className={type === 'income' ? 'on' : ''} onClick={() => setType('income')}>Income</button>
        </div>
        <button type="submit" className="btn" disabled={!name.trim()}>Add category</button>
      </form>
    </section>
  );
}

function RulesCard({ onToast }) {
  const rules = useLiveQuery(() => db.userRules.orderBy('order').reverse().toArray(), []);
  const [confirm, setConfirm] = useState(null);
  if (!rules?.length) return null;
  return (
    <section className="card" aria-label="Learned rules">
      <span className="card-title">Learned rules</span>
      <p className="hint">Made when you tick “Always use this category”. They run before the built-in rules. A rule marked too broad would catch unrelated transactions, so moni ignores it.</p>
      <div className="set-group">
        {rules.map((r) => {
          const kw = Array.isArray(r.match?.contains) ? r.match.contains.join(', ') : r.match?.contains;
          const broad = isBroadKeyword(kw);
          return (
            <div className="set-row" key={r.uid}>
              <span className="name">
                <span className="strong">{kw}</span> → {categoryName(r.categoryId)}
                {broad && <span className="tag warn">too broad, ignored</span>}
              </span>
              <div className="actions">
                <button type="button" className="btn ghost danger small-btn" onBlur={() => setConfirm(null)}
                  onClick={async () => {
                    if (confirm !== r.uid) { setConfirm(r.uid); return; }
                    await deleteRule(r.uid);
                    setConfirm(null);
                    onToast(`Deleted the ${kw} rule`);
                  }}>
                  {confirm === r.uid ? 'Tap again' : 'Delete'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function Settings({ sync, txns, onToast }) {
  const [repo, setRepo] = useState(DEFAULT_REPO);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [replaceToken, setReplaceToken] = useState(false);

  async function onConnect(e) {
    e.preventDefault();
    if (!token.trim()) return setError('Paste your token first');
    setBusy(true); setError('');
    try {
      const r = await connect(token, sync?.repo ?? repo);
      setToken(''); setReplaceToken(false);
      onToast(r.status === 'ok' ? 'Connected. Your data is synced' : r.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onSyncNow() {
    setBusy(true);
    const r = await syncNow();
    setBusy(false);
    onToast(r.status === 'ok' ? 'Synced' : r.message ?? 'Sync is off');
  }

  async function onClear() {
    if (!confirmClear) { setConfirmClear(true); return; }
    await clearDevice();
    setConfirmClear(false);
    onToast('Removed from this device');
  }

  const connected = !!sync?.token;
  const showForm = !connected || replaceToken;

  return (
    <main className="screen">
      <header className="header"><div className="title">Settings</div></header>

      <div className="settings-col">
      <section className="card" aria-label="Sync">
        <span className="card-title">Sync between devices</span>

        {connected && (
          <>
            <div className="row label">
              <span>Saving to <span className="strong">{sync.repo}</span></span>
              <span>{sync.syncing ? 'Syncing…' : `Synced ${ago(sync.lastSyncAt)}`}</span>
            </div>
            {sync.lastError && <p className="error" role="alert">{sync.lastError.message}</p>}
            <button type="button" className="btn" disabled={busy} onClick={onSyncNow}>{busy ? 'Syncing…' : 'Sync now'}</button>
            {!replaceToken && (
              <div className="btn-row">
                <button type="button" className="btn ghost" onClick={() => setReplaceToken(true)}>Paste a new token</button>
                <button type="button" className="btn ghost danger" onClick={async () => { await disconnect(); onToast('Sync turned off on this device'); }}>Turn off sync</button>
              </div>
            )}
          </>
        )}

        {showForm && (
          <form className="form" onSubmit={onConnect} noValidate>
            {!connected && (
              <p className="hint">
                Your data is saved to your private <strong>moni-data</strong> repo, so your phone and computer see the same thing.
                Do this once on each device:
              </p>
            )}
            <ol className="steps">
              <li>Open <a href={TOKEN_URL} target="_blank" rel="noreferrer">GitHub → new fine-grained token</a> (sign in if asked).</li>
              <li>Name it <em>moni</em>. Set an expiration (moni will tell you when it runs out).</li>
              <li>Repository access: <strong>Only select repositories</strong> → <strong>moni-data</strong>.</li>
              <li>Permissions → <strong>Add permissions</strong> → search <em>contents</em> → pick <strong>Contents</strong>, then set it to <strong>Read and write</strong>. Nothing else.</li>
              <li>Generate, copy the token, and paste it below.</li>
            </ol>
            {!connected && (
              <label className="field">
                <span className="small">Data repo</span>
                <input className="input" value={repo} onChange={(e) => setRepo(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck="false" />
              </label>
            )}
            <label className="field">
              <span className="small">Token</span>
              <input className="input" type="password" value={token} placeholder="github_pat_…" autoComplete="off"
                onChange={(e) => { setToken(e.target.value); setError(''); }} />
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Connecting…' : connected ? 'Save new token' : 'Connect and sync'}</button>
            {replaceToken && <button type="button" className="btn ghost" onClick={() => setReplaceToken(false)}>Cancel</button>}
            <p className="hint">The token is stored only on this device. It can only touch moni-data, nothing else on your GitHub.</p>
          </form>
        )}
      </section>

      <section className="card" aria-label="This device">
        <span className="card-title">This device</span>
        <p className="hint">
          {connected
            ? 'Removes moni’s data and token from this device only. Your synced copy in moni-data stays, and comes back if you connect again.'
            : 'Deletes everything moni has stored on this device. This can’t be undone.'}
        </p>
        <button type="button" className="btn ghost danger" onClick={onClear} onBlur={() => setConfirmClear(false)}>
          {confirmClear ? 'Tap again to confirm' : connected ? 'Remove data from this device' : 'Delete all data'}
        </button>
      </section>

      <CategoriesCard txns={txns} onToast={onToast} />
      <RulesCard onToast={onToast} />
      </div>
    </main>
  );
}
