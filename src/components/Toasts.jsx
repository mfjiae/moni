import { useCallback, useEffect, useRef, useState } from 'react';

// Toasts (Ken, 28 Oct 2026): small messages that confirm an action.
//   green  = done (added, saved, renamed)      amber = heads up (already added, no change, blocked)
//   red    = deleted or failed (can carry an Undo button)
// Every call site still just does onToast('text'). moni picks the colour from the words and splits
// "Saved. Also sorted 3 more" into a bold line plus a small line. A call site can pass an object
// for full control: { type: 'ok' | 'warn' | 'bad' | 'info', title, detail, action, onAction, ms }.

const MAX = 3;
const SHORT = 4000;
const WITH_UNDO = 6500;
let nextId = 1;

export function toastFromText(text) {
  const s = String(text).trim();
  const cut = s.search(/\.\s+\S/);
  const title = cut > 0 ? s.slice(0, cut) : s.replace(/\.$/, '');
  const detail = cut > 0 ? s.slice(cut + 1).trim().replace(/\.$/, '') : '';
  let type = 'ok';
  if (/^(deleted|removed)\b/i.test(s)) type = 'bad';
  else if (/could ?n.t|can.t|failed|error|went wrong|invalid|not a valid|unable/i.test(s)) type = 'bad';
  else if (/already|too many|too general|too broad|no change|nothing to|kept in|must |enter |choose |pick /i.test(s)) type = 'warn';
  return { type, title, detail };
}

// Any file can call toast('text') or toast({...}) without passing onToast down; App listens for it.
export function toast(x) { window.dispatchEvent(new CustomEvent('moni-toast', { detail: x })); }

export function useToasts() {
  const [list, setList] = useState([]);
  const push = useCallback((x) => {
    if (!x) return;
    const t = typeof x === 'string' ? toastFromText(x) : { type: 'ok', ...x };
    if (!t.title) return;
    const ms = t.ms ?? (t.action ? WITH_UNDO : SHORT);
    setList((l) => [...l.slice(-(MAX - 1)), { ...t, ms, id: nextId++ }]);
  }, []);
  const dismiss = useCallback((id) => setList((l) => l.filter((t) => t.id !== id)), []);
  useEffect(() => {
    const on = (e) => push(e.detail);
    window.addEventListener('moni-toast', on);
    return () => window.removeEventListener('moni-toast', on);
  }, [push]);
  return { list, push, dismiss };
}

const PATHS = {
  ok: <><circle cx="10" cy="10" r="8" /><path d="M6.5 10.3l2.4 2.4 4.6-5" /></>,
  warn: <><path d="M10 2.8l7.6 13.4H2.4z" /><path d="M10 8v3.6M10 14h.01" /></>,
  bad: <><path d="M4.5 6h11M8 6V4h4v2M6 6l.7 10h6.6L14 6" /></>,
  info: <><circle cx="10" cy="10" r="8" /><path d="M10 9v5M10 6.2h.01" /></>,
};

function Toast({ t, dismiss }) {
  const [leaving, setLeaving] = useState(false);
  const timer = useRef(null);
  const left = useRef(t.ms);
  const started = useRef(0);
  const close = useCallback(() => {
    clearTimeout(timer.current);
    setLeaving(true);
    setTimeout(() => dismiss(t.id), 180);
  }, [dismiss, t.id]);
  const arm = useCallback(() => { started.current = Date.now(); timer.current = setTimeout(close, left.current); }, [close]);
  const pause = () => { clearTimeout(timer.current); left.current -= Date.now() - started.current; };
  useEffect(() => { arm(); return () => clearTimeout(timer.current); }, [arm]);
  const type = PATHS[t.type] ? t.type : 'ok';
  return (
    <div className={`toast toast-${type}${leaving ? ' out' : ''}`} style={{ '--dur': `${t.ms}ms` }}
      onMouseEnter={pause} onMouseLeave={arm}>
      <svg className="toast-icon" aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{PATHS[type]}</svg>
      <div className="toast-msg">
        <div className="toast-title">{t.title}</div>
        {t.detail && <div className="toast-detail">{t.detail}</div>}
      </div>
      {t.action && (
        <button type="button" className="toast-act" onClick={() => { t.onAction?.(); close(); }}>{t.action}</button>
      )}
      <button type="button" className="toast-x" aria-label="Dismiss" onClick={close}>&times;</button>
      <span className="toast-bar" />
    </div>
  );
}

export function ToastStack({ list, dismiss }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => <Toast key={t.id} t={t} dismiss={dismiss} />)}
    </div>
  );
}
