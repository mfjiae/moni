// Clean names / nicknames (Ken, 27 Oct 2026; UI locked: rename sheet B, list rows A, Settings → Names).
// Display only: the stored bank description NEVER changes, so import dedupe, sorting rules, learned rules and
// typed-entry matching keep using the bank's text.
// Two kinds of nickname:
// - "Rename similar rows": a synced `names` record { uid: 'name|<KEY>', key, name, updatedAt }. Every row whose
//   bank text contains KEY (same matching as learned rules) shows the name. KEY comes from merchantKey, so
//   too-general keys (DIRECT DEBIT, TRANSFER TO…) are never made.
// - This row only: `nickname` on the transaction itself (synced with the row). '' = "show the bank name here",
//   even when a similar-rows name would match.
import { merchantKey, isBroadKeyword, isPersonTransfer } from './rules.js';
import { shortName } from './activity.js';

export const MAX_NAME = 40;
export const nameUid = (key) => `name|${String(key).toUpperCase().trim()}`;

// The keyword "Rename similar rows" would use for this row, or '' when it can't (typed rows, payments to people,
// own-account transfers, text too general). Same rule as "Remember for similar rows".
export function renameKey(t) {
  if (!t || t.source !== 'csv' || t.kind === 'saving' || isPersonTransfer(t.description)) return '';
  const k = merchantKey(t.description);
  return k && !isBroadKeyword(k) ? k : '';
}

// Module-level list, set by App from the synced `names` table (like categories' setCategoryOverrides).
let records = [];
export function setNicknames(list) {
  records = (list ?? [])
    .filter((r) => r && r.key && r.name && !isBroadKeyword(r.key))
    .map((r) => ({ ...r, key: String(r.key).toUpperCase().trim() }))
    // Longest key first, so "FAKE CAFE BROADWAY" beats "FAKE CAFE" when both are saved.
    .sort((a, b) => b.key.length - a.key.length || a.key.localeCompare(b.key));
}
export const nicknameRecords = () => records;

// The similar-rows record that names this row, if any.
export function nameRecordFor(t, list = records) {
  if (!t?.description || t.kind === 'saving') return null;
  const d = t.description.toUpperCase();
  return list.find((r) => d.includes(r.key)) ?? null;
}

// The nickname to show for a row, or null for "use the bank name".
export function nicknameFor(t, list = records) {
  if (!t || t.kind === 'saving') return null;
  if (typeof t.nickname === 'string') return t.nickname.trim() || null;
  return nameRecordFor(t, list)?.name ?? null;
}

// How many rows a similar-rows name would cover.
export function countSimilar(txns, key) {
  const k = String(key ?? '').toUpperCase().trim();
  if (!k) return 0;
  return txns.filter((t) => t.kind !== 'saving' && t.description?.toUpperCase().includes(k)).length;
}

// Settings → Names list (Ken, 27 Oct 2026, option A): every rename in one list, "bank text → name".
// Similar-rows names first (A-Z by bank text), then single-row names, newest first. A row nickname of ''
// ("show the bank name here") is not a rename, so it is left out.
export function nameList(records, txns) {
  const similar = (records ?? []).map((r) => ({
    id: r.uid, kind: 'similar', from: r.key, name: r.name, rows: countSimilar(txns, r.key),
  })).sort((a, b) => a.from.localeCompare(b.from));
  const single = (txns ?? [])
    .filter((t) => typeof t.nickname === 'string' && t.nickname.trim())
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    .map((t) => ({ id: t.uid, kind: 'single', from: shortName(t.description), name: t.nickname.trim(), date: t.date, rowUid: t.uid }));
  return [...similar, ...single];
}

const SMALL = new Set(['and', 'of', 'the', 'at', 'on', 'for', 'to', 'in']);
export function titleCase(s) {
  return String(s ?? '').toLowerCase().split(/\s+/).filter(Boolean)
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

// Bank text without the place and country tail: "FAKEMART 1234 SYDNEY NS AUS" -> "FAKEMART 1234 SYDNEY".
function trimTail(s) {
  return s.replace(/\s+(NSW?|VIC|QLD|ACT|SA|WA|TAS|NT)?\s*(AUS?|AU)?\s*$/i, '').replace(/\s+\d[\d\s]*$/, '').trim();
}

// Suggested names for the rename chips (option B): a short one, the merchant key, and the cleaned bank text.
export function suggestNames(t) {
  const out = [];
  const add = (s) => {
    const v = titleCase(s).slice(0, MAX_NAME).trim();
    if (v && v.length >= 2 && !out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
  };
  const key = merchantKey(t.description);
  // A person's first name alone is too vague ("Fake" from FAKE PERSON), so people get the full name only.
  if (key) { if (!isPersonTransfer(t.description)) add(key.split(' ')[0]); add(key); }
  add(trimTail(shortName(t.description).replace(/[*]+/g, ' ').replace(/\s+/g, ' ')));
  return out.slice(0, 3);
}

// Check a typed name. Returns the cleaned name or throws a plain-words error.
export function cleanName(text) {
  const v = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!v) throw new Error('Type a name');
  if (v.length > MAX_NAME) throw new Error(`Keep it under ${MAX_NAME} characters`);
  return v;
}

// What the rename sheet wants to save. state = { pick, typing, text, similar } (pick null = bank name).
// Returns null when nothing changed, else { name } (null = back to the bank name). An empty "Type your own"
// box changes nothing, so a stray tap never wipes a name.
export function nameChange(txn, state) {
  if (state.typing && !state.text.trim()) return null;
  const before = nicknameFor(txn);
  const after = state.typing ? state.text.trim() : state.pick;
  const ownBefore = typeof txn.nickname === 'string';
  const wantOwn = !(state.similar && renameKey(txn));
  if ((after ?? '') === (before ?? '') && (after === null || ownBefore === wantOwn)) return null;
  return { name: after ?? null };
}
