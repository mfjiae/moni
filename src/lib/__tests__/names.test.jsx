// Clean names / nicknames (27 Oct 2026). Fake data only.
import { describe, it, expect, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { renameKey, setNicknames, nicknameFor, nameRecordFor, suggestNames, countSimilar, titleCase, cleanName, nameChange, nameUid, nameList, billDisplayName } from '../names.js';
import { matchesSearch } from '../activity.js';
import { mergeSnapshots, normalize } from '../merge.js';
import { categorize } from '../rules.js';
import { prepareImport } from '../importer.js';
import TxnRow, { displayName } from '../../components/TxnRow.jsx';
import TxnSheet from '../../components/TxnSheet.jsx';
import { db } from '../db.js';

const row = (uid, description, extra = {}) => ({ uid, date: '2026-10-20', amountCents: -6400, kind: 'spend', categoryId: 'groceries', description, source: 'csv', ...extra });
const mart = row('csv|a', 'FAKEMART 1234 SYDNEY NS AUS Card xx1111 Value Date: 18/10/2026');
const mart2 = row('csv|b', 'FAKEMART 5678 SYDNEY NS AUS Card xx1111 Value Date: 12/10/2026');
const cafe = row('csv|c', 'FAKE CAFE BROADWAY NSW', { categoryId: 'eating-out' });
const rec = (key, name, updatedAt = 1) => ({ uid: nameUid(key), key, name, updatedAt });

afterEach(() => setNicknames([]));

describe('which rows can be renamed together', () => {
  it('bank merchant rows get the learned-rule keyword', () => {
    expect(renameKey(mart)).toBe('FAKEMART');
    expect(renameKey(cafe)).toBe('FAKE CAFE');
  });
  it('typed rows, payments to people, own-account transfers and too-general text cannot', () => {
    expect(renameKey({ ...mart, source: 'manual' })).toBe('');
    expect(renameKey(row('x', 'Fast Transfer From FAKE PERSON', { kind: 'review', amountCents: 2000 }))).toBe('');
    expect(renameKey(row('x', 'Transfer to xx2066 NetBank', { kind: 'saving' }))).toBe('');
    expect(renameKey(row('x', 'Direct Debit 123456 '))).toBe('');
  });
});

describe('what a row shows', () => {
  it('a similar-rows name covers every row with that bank text; others keep the bank name', () => {
    setNicknames([rec('FAKEMART', 'Fakemart')]);
    expect(displayName(mart)).toBe('Fakemart');
    expect(displayName(mart2)).toBe('Fakemart');
    expect(displayName(cafe)).toBe('FAKE CAFE BROADWAY NSW');
  });
  it("a row's own nickname wins; '' means the bank name on that row only", () => {
    setNicknames([rec('FAKEMART', 'Fakemart')]);
    expect(displayName({ ...mart, nickname: 'Big shop' })).toBe('Big shop');
    expect(displayName({ ...mart, nickname: '' })).toBe('FAKEMART 1234 SYDNEY NS AUS');
  });
  it('deleting a name (Settings → Names) brings the bank name back', () => {
    setNicknames([rec('FAKEMART', 'Fakemart')]);
    expect(displayName(mart2)).toBe('Fakemart');
    setNicknames([]);
    expect(displayName(mart2)).toBe('FAKEMART 5678 SYDNEY NS AUS');
  });
  it('the longest matching key wins', () => {
    setNicknames([rec('FAKE CAFE', 'Cafe'), rec('FAKE CAFE BROADWAY', 'Uni cafe')]);
    expect(displayName(cafe)).toBe('Uni cafe');
  });
  it('own-account transfers keep their friendly name and too-general saved keys are ignored', () => {
    setNicknames([rec('TRANSFER TO', 'Oops'), rec('XX2066', 'Savings!')]);
    expect(displayName(row('x', 'Transfer to xx2066 NetBank', { kind: 'saving' }))).toBe('To savings');
    expect(nicknameFor(row('y', 'TRANSFER TO FAKE PERSON'))).toBe(null);
  });
  it('lists render the nickname only (option A: no dot, no extra mark)', () => {
    setNicknames([rec('FAKEMART', 'Fakemart')]);
    const out = renderToStaticMarkup(<TxnRow t={mart} onOpen={() => {}} />);
    expect(out).toContain('<span class="merchant">Fakemart</span>');
    expect(out).not.toContain('SYDNEY');
  });
});

describe('the bank text never changes', () => {
  it('sorting rules and import dedupe still read the bank text', () => {
    setNicknames([rec('FAKEMART', 'Corner shop')]);
    const rules = [{ match: { contains: 'FAKEMART' }, kind: 'spend', categoryId: 'groceries', createdBy: 'user' }];
    const csvRow = { importKey: 'k1', date: mart.date, postedDate: mart.date, amountCents: mart.amountCents, description: mart.description, rawDescription: mart.description, balanceCents: 0 };
    const fresh = prepareImport([csvRow], { rules });
    expect(fresh.toAdd[0].description).toBe(mart.description);
    expect(fresh.toAdd[0].categoryId).toBe('groceries');
    expect(prepareImport([csvRow], { existingKeys: new Set(['k1']), rules }).toAdd).toHaveLength(0);
    expect(categorize(mart.description, mart.amountCents, rules).categoryId).toBe('groceries');
  });
});

describe('search', () => {
  it('finds a row by its nickname and by its bank text', () => {
    setNicknames([rec('FAKEMART', 'Corner shop')]);
    expect(matchesSearch(mart, 'corner')).toBe(true);
    expect(matchesSearch(mart, 'fakemart')).toBe(true);
    expect(matchesSearch(cafe, 'corner')).toBe(false);
  });
});

describe('suggestions and names', () => {
  it('offers a short name, the merchant key and the cleaned bank text', () => {
    expect(suggestNames(mart)).toEqual(['Fakemart', 'Fakemart 1234 Sydney']);
    expect(suggestNames(cafe)).toEqual(['Fake', 'Fake Cafe', 'Fake Cafe Broadway']);
    expect(suggestNames(row('p', 'Fast Transfer From FAKE PERSON', { kind: 'review', amountCents: 2000 }))[0]).toBe('Fake Person');
  });
  it('title case keeps small words small', () => {
    expect(titleCase('BANK OF FAKE')).toBe('Bank of Fake');
  });
  it('a typed name must have text and stay short', () => {
    expect(() => cleanName('   ')).toThrow();
    expect(() => cleanName('x'.repeat(41))).toThrow();
    expect(cleanName('  Corner   shop ')).toBe('Corner shop');
  });
  it('counts the rows a name would cover', () => {
    expect(countSimilar([mart, mart2, cafe], 'FAKEMART')).toBe(2);
  });
});

describe('what the sheet saves', () => {
  const base = { pick: null, typing: false, text: '', similar: true };
  it('nothing picked = nothing changes (saving a category never renames)', () => {
    expect(nameChange(mart, base)).toBe(null);
  });
  it('an empty "Type your own" box never wipes a name', () => {
    setNicknames([rec('FAKEMART', 'Fakemart')]);
    expect(nameChange(mart, { ...base, pick: 'Fakemart', typing: true, text: '  ' })).toBe(null);
  });
  it('picking a chip or "Bank name" is a change', () => {
    expect(nameChange(mart, { ...base, pick: 'Fakemart' })).toEqual({ name: 'Fakemart' });
    setNicknames([rec('FAKEMART', 'Fakemart')]);
    expect(nameChange(mart, { ...base, pick: null })).toEqual({ name: null });
    expect(nameChange(mart, { ...base, pick: 'Fakemart' })).toBe(null);
  });
});

describe('rename sheet (option B)', () => {
  it('shows chips, the bank text and the similar-rows switch on by default', () => {
    const out = renderToStaticMarkup(<TxnSheet txn={mart} txns={[mart, mart2, cafe]} usage={{}} onClose={() => {}} onToast={() => {}} />);
    expect(out).toContain('Shown as');
    expect(out).toContain('>Fakemart</button>');
    expect(out).toContain('Type your own…');
    expect(out).toContain('Bank text (never changes)');
    expect(out).toContain('2 rows with “FAKEMART”');
    expect(out).toMatch(/aria-checked="true" aria-label="Rename similar rows"/);
    expect(out).not.toContain('>Bank name<'); // only once something is renamed
  });
  it('a payment to a person can only be renamed on its own row', () => {
    const p = row('x', 'Fast Transfer From FAKE PERSON', { kind: 'review', categoryId: null, amountCents: 2000 });
    const out = renderToStaticMarkup(<TxnSheet txn={p} txns={[p]} usage={{}} onClose={() => {}} onToast={() => {}} />);
    expect(out).toMatch(/aria-checked="false" aria-label="Rename similar rows"/);
    expect(out).toContain('Only this row');
  });
  it('own-account transfers have no rename', () => {
    const t = row('x', 'Transfer to xx2066 NetBank', { kind: 'saving', categoryId: 'saving' });
    expect(renderToStaticMarkup(<TxnSheet txn={t} txns={[t]} usage={{}} onClose={() => {}} onToast={() => {}} />)).not.toContain('Shown as');
  });
});

describe('sync', () => {
  it('names merge newest-wins and a delete (tombstone) removes them', () => {
    const a = { names: [rec('FAKEMART', 'Fakemart', 5)] };
    const b = { names: [rec('FAKEMART', 'Corner shop', 9)] };
    expect(mergeSnapshots(a, b).names[0].name).toBe('Corner shop');
    expect(mergeSnapshots(b, a).names[0].name).toBe('Corner shop');
    const gone = { names: [], tombstones: { [nameUid('FAKEMART')]: 10 } };
    expect(mergeSnapshots(b, gone).names).toEqual([]);
    expect(normalize({}).names).toEqual([]);
  });
  it('an older snapshot without names keeps ours', () => {
    expect(mergeSnapshots({ names: [rec('FAKEMART', 'Fakemart')] }, { txns: [] }).names).toHaveLength(1);
  });
  it("a row's own nickname travels with the row", () => {
    const l = { txns: [{ ...mart, nickname: 'Big shop', updatedAt: 9 }] };
    const r = { txns: [{ ...mart, updatedAt: 3 }] };
    expect(mergeSnapshots(l, r).txns[0].nickname).toBe('Big shop');
  });
});

describe('database', () => {
  it('v8 adds the names table keyed by uid', () => {
    const v8 = [...db._versions].find((v) => v._cfg.version === 8);
    expect(v8._cfg.storesSource.names).toBe('uid');
  });
  it('the record that names a row', () => {
    const list = [rec('FAKEMART', 'Fakemart')];
    expect(nameRecordFor(mart, list).uid).toBe('name|FAKEMART');
    expect(nameRecordFor(cafe, list)).toBe(null);
  });
});

describe('Settings → Names list', () => {
  it('lists similar-rows names and single-row names together, skipping empty nicknames', () => {
    const rows = [
      { ...mart, uid: 'a', date: '2026-10-02' },
      { ...mart, uid: 'b', date: '2026-10-05' },
      { ...cafe, uid: 'c', date: '2026-10-06', nickname: 'Uni cafe' },
      { ...cafe, uid: 'd', date: '2026-10-07', nickname: '' },
    ];
    const out = nameList([rec('FAKEMART', 'Fakemart')], rows);
    expect(out.map((x) => x.kind)).toEqual(['similar', 'single']);
    expect(out[0]).toMatchObject({ from: 'FAKEMART', name: 'Fakemart', rows: 2 });
    expect(out[1]).toMatchObject({ name: 'Uni cafe', rowUid: 'c' });
  });
  it('is empty when nothing is renamed', () => {
    expect(nameList([], [mart])).toEqual([]);
  });
});

describe('names on bills', () => {
  afterEach(() => setNicknames([]));
  const auto = { uid: 'b1', name: 'Fake Telco', key: 'FAKE TELCO', cents: 2680, every: 'monthly' };
  it('shows your name for a bill found from the bank', () => {
    setNicknames([rec('FAKE TELCO', 'Phone')]);
    expect(billDisplayName(auto)).toBe('Phone');
  });
  it('keeps the bill name when you typed it yourself, or when it has no key', () => {
    setNicknames([rec('FAKE TELCO', 'Phone')]);
    expect(billDisplayName({ ...auto, name: 'My phone plan' })).toBe('My phone plan');
    expect(billDisplayName({ uid: 'b2', name: 'Gym', cents: 1000, every: 'monthly' })).toBe('Gym');
  });
  it('leaves Tuition and Rent alone and falls back to the bill name', () => {
    setNicknames([rec('FAKE TELCO', 'Phone')]);
    expect(billDisplayName({ uid: 'b3', name: 'Tuition', key: 'cat:tuition' })).toBe('Tuition');
    setNicknames([]);
    expect(billDisplayName(auto)).toBe('Fake Telco');
  });
});
