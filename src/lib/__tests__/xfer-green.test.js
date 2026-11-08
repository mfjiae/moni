import { describe, it, expect } from 'vitest';
import { isTransferIn } from '../accounts.js';
import { amountClass } from '../../components/TxnRow.jsx';

const row = (o) => ({ uid: 'x', kind: 'saving', amountCents: 950, ...o });

describe('transfers into Smart Access get the muted sage color', () => {
  it('Smart Access row, money in, saving or internal: sage', () => {
    expect(isTransferIn(row({}))).toBe(true);
    expect(isTransferIn(row({ kind: 'internal' }))).toBe(true);
    expect(amountClass(row({}))).toBe(' text-xfer');
    expect(amountClass(row({ kind: 'internal', account: 'xx6193' }))).toBe(' text-xfer');
  });
  it('real income stays bright green', () => {
    expect(amountClass(row({ kind: 'income' }))).toBe(' text-in');
    expect(isTransferIn(row({ kind: 'income' }))).toBe(false);
  });
  it('money out and zero are never sage', () => {
    expect(isTransferIn(row({ amountCents: -950 }))).toBe(false);
    expect(isTransferIn(row({ amountCents: 0 }))).toBe(false);
    expect(amountClass(row({ amountCents: -950 }))).toBe('');
  });
  it('a savings account page row (saver side) stays plain', () => {
    expect(isTransferIn(row({ account: 'xx2066' }))).toBe(false);
    expect(amountClass(row({ account: 'xx2066' }))).toBe('');
  });
  it('a saver-CSV transfer turned round to read like the Smart Access row is sage', () => {
    expect(isTransferIn(row({ account: 'xx2066', mirrored: true }))).toBe(true);
  });
  it('spending and investing are unchanged', () => {
    expect(amountClass({ kind: 'investing', amountCents: -100 })).toBe(' text-invest');
    expect(amountClass({ kind: 'spending', amountCents: -100 })).toBe('');
    expect(amountClass({ kind: 'spending', amountCents: 500 })).toBe(' text-in');
  });
});
