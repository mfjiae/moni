import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db.js';
import { connect, disconnect, syncNow, DEFAULT_REPO } from '../lib/sync.js';
import { clearDevice, updateCategory, addCategory, deleteRule, deleteName, clearName, renameSimilar, renameRow } from '../lib/store.js';
import { nameList, MAX_NAME } from '../lib/names.js';
import { longDay } from '../lib/dates.js';
import { allCategories, categoryName, LOCKED, TYPE_LABEL } from '../lib/categories.js';
import { isBroadKeyword } from '../lib/rules.js';
import { Chevron, useWide } from './ui.jsx';

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

// Rename in place (Ken, 27 Oct 2026): a small box with Save / Cancel. An empty box changes nothing.
function RenameInline({ label, start, onSave, onCancel }) {
  const [text, setText] = useState(start ?? '');
  const [err, setErr] = useState('');
  async function save(e) {
    e.preventDefault();
    if (!text.trim() || text.trim() === (start ?? '')) { onCancel(); return; }
    try { await onSave(text); } catch (x) { setErr(x.message); }
  }
  return (
    <form className="rename-inline" onSubmit={save}>
      <label className="small">{label}
        <input className="input" value={text} maxLength={MAX_NAME + 10} autoFocus aria-label={label}
          onChange={(e) => { setText(e.target.value); setErr(''); }} />
      </label>
      {err && <span className="small rename-err">{err}</span>}
      <span className="actions">
        <button type="submit" className="btn small-btn">Save</button>
        <button type="button" className="btn ghost small-btn" onClick={onCancel}>Cancel</button>
      </span>
    </form>
  );
}

function RulesCard({ rules, names, onToast }) {
  const [confirm, setConfirm] = useState(null);
  const [editing, setEditing] = useState(null);
  if (!rules?.length) {
    return (
      <section className="card" aria-label="Learned rules">
        <span className="card-title">Learned rules</span>
        <p className="hint">None yet. When you sort a transaction and tick “Always use this category”, the rule shows up here.</p>
      </section>
    );
  }
  return (
    <section className="card" aria-label="Learned rules">
      <span className="card-title">Learned rules</span>
      <p className="hint">Made when you tick “Always use this category”. They run before the built-in rules. A rule marked too broad would catch unrelated transactions, so moni ignores it.</p>
      <div className="set-group">
        {rules.map((r) => {
          const kw = Array.isArray(r.match?.contains) ? r.match.contains.join(', ') : r.match?.contains;
          const broad = isBroadKeyword(kw);
          // Only plain category rules can be renamed: one keyword, not too broad, not an ATM / "not ATM" rule.
          const canRename = typeof r.match?.contains === 'string' && !broad && !r.notAtm && !r.atm;
          const nameRec = canRename ? (names ?? []).find((n) => n.key === kw.toUpperCase().trim()) : null;
          return (
            <div className="set-row" key={r.uid}>
              <span className="name">
                <span className="strong">{kw}</span> → {r.notAtm ? 'not a cash withdrawal (never asked)' : r.atm ? `${categoryName(r.categoryId)}, ATM cash` : categoryName(r.categoryId)}
                {broad && <span className="tag warn">too broad, ignored</span>}
                {nameRec && editing !== r.uid && <span className="small name-key">shown as {nameRec.name}</span>}
                {editing === r.uid && (
                  <RenameInline label="Shown as" start={nameRec?.name}
                    onCancel={() => setEditing(null)}
                    onSave={async (text) => {
                      const n = await renameSimilar(null, kw, text);
                      setEditing(null);
                      onToast(`${kw} now shows as ${n}`);
                    }} />
                )}
              </span>
              <div className="actions">
                {canRename && editing !== r.uid && (
                  <button type="button" className="btn ghost small-btn" onClick={() => setEditing(r.uid)}>Rename</button>
                )}
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

// Settings → Names (clean names, 27 Oct 2026): every "Rename similar rows" name, with the bank text it covers.
// Delete brings the bank's own name back on those rows. Names for a single row live on that row's sheet.
function NamesCard({ names, txns, onToast }) {
  const [confirm, setConfirm] = useState(null);
  const [editing, setEditing] = useState(null);
  const list = nameList(names, txns);
  if (!list.length) {
    return (
      <section className="card" aria-label="Names">
        <span className="card-title">Names</span>
        <p className="hint">None yet. Open a transaction and pick a name under “Shown as”: every rename shows up here.</p>
      </section>
    );
  }
  return (
    <section className="card" aria-label="Names">
      <span className="card-title">Names</span>
      <p className="hint">Your names for bank text. Only the name you see changes: moni still matches, imports and sorts on the bank’s own text.</p>
      <div className="set-group">
        {list.map((r) => {
          const scope = r.kind === 'similar'
            ? `all similar · ${r.rows} row${r.rows === 1 ? '' : 's'}`
            : `this row only · ${r.date ? longDay(r.date) : ''}`;
          return (
            <div className="set-row" key={r.id}>
              <span className="name">
                <span className="strong">{r.from}</span> → {editing === r.id ? '' : r.name}
                <span className="small name-key">{scope}</span>
                {editing === r.id && (
                  <RenameInline label="Shown as" start={r.name}
                    onCancel={() => setEditing(null)}
                    onSave={async (text) => {
                      const n = r.kind === 'similar' ? await renameSimilar(null, r.from, text) : (await renameRow(r.rowUid, text), text.trim());
                      setEditing(null);
                      onToast(`Now shows as ${n}`);
                    }} />
                )}
              </span>
              <div className="actions">
                {editing !== r.id && (
                  <button type="button" className="btn ghost small-btn" onClick={() => setEditing(r.id)}>Rename</button>
                )}
                <button type="button" className="btn ghost danger small-btn" onBlur={() => setConfirm(null)}
                  onClick={async () => {
                    if (confirm !== r.id) { setConfirm(r.id); return; }
                    if (r.kind === 'similar') await deleteName(r.id);
                    else await clearName(r.rowUid);
                    setConfirm(null);
                    onToast(`Deleted ${r.name}. Showing the bank name again`);
                  }}>
                  {confirm === r.id ? 'Tap again' : 'Delete'}
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
  const wide = useWide();
  const [picked, setPicked] = useState(null);       // phone: null = the list; desktop: always one open
  const rules = useLiveQuery(() => db.userRules.orderBy('order').reverse().toArray(), []);
  const names = useLiveQuery(() => db.names.toArray(), []);
  const nameCount = names ? nameList(names, txns ?? []).length : 0;

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

  const catCount = allCategories().filter((c) => !c.hidden).length;
  const NAV = [
    ['sync', 'Sync', connected ? `Synced ${ago(sync.lastSyncAt)}` : 'Off on this device'],
    ['device', 'This device', 'Remove data from here'],
    ['categories', 'Categories', `${catCount} shown`],
    ['rules', 'Learned rules', rules ? (rules.length ? `${rules.length} saved` : 'None yet') : ''],
    ['names', 'Names', names ? (nameCount ? `${nameCount} saved` : 'None yet') : ''],
  ];
  const active = picked ?? (wide ? 'sync' : null);
  const content = {
    sync: (
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
    ),
    device: (
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
    ),
    categories: <CategoriesCard txns={txns} onToast={onToast} />,
    rules: <RulesCard rules={rules} names={names} onToast={onToast} />,
    names: <NamesCard names={names} txns={txns} onToast={onToast} />,
  };

  const list = (
    <nav className="settings-nav" aria-label="Settings sections">
      {NAV.map(([id, title, sub]) => (
        <button key={id} type="button" className={`settings-item${active === id ? ' active' : ''}`} aria-current={active === id ? 'page' : undefined}
          onClick={() => setPicked(id)}>
          <span className="settings-item-text"><span className="settings-item-title">{title}</span><span className="small">{sub}</span></span>
          <Chevron />
        </button>
      ))}
    </nav>
  );

  return (
    <main className="screen">
      <header className="header">
        <div className="title">{!wide && active ? NAV.find((n) => n[0] === active)[1] : 'Settings'}</div>
        {!wide && active && <button type="button" className="btn ghost small-btn" onClick={() => setPicked(null)}><Chevron dir="left" size={16} /> Settings</button>}
      </header>
      {wide ? (
        <div className="settings-layout">
          {list}
          <div className="settings-pane">{content[active]}</div>
        </div>
      ) : active ? (
        <div className="settings-col">{content[active]}</div>
      ) : list}
    </main>
  );
}
