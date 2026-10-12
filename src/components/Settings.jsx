import { useState } from 'react';
import { connect, disconnect, syncNow, DEFAULT_REPO } from '../lib/sync.js';
import { clearDevice } from '../lib/store.js';

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

function ago(ms) {
  if (!ms) return 'never';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

export default function Settings({ sync, onToast }) {
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

      <section className="card form" aria-label="Sync">
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
              <li>Permissions → Repository → <strong>Contents: Read and write</strong>. Nothing else.</li>
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
    </main>
  );
}
