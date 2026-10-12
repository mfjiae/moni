// All money in moni is stored as integer cents (AUD). Never use floats for amounts.

// "-10.00" | "+720.33" | "0.00" | "12" -> integer cents
export function parseCents(text) {
  const s = String(text).trim().replace(/[$,\s]/g, '');
  const m = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new Error(`Not a money amount: "${text}"`);
  const sign = m[1] === '-' ? -1 : 1;
  const dollars = parseInt(m[2], 10);
  const cents = m[3] ? parseInt(m[3].padEnd(2, '0'), 10) : 0;
  return sign * (dollars * 100 + cents);
}

// 72033 -> "$720.33"; with sign option: "+$720.33" / "−$10.00"
export function formatCents(cents, { sign = false } = {}) {
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = `$${dollars}.${String(abs % 100).padStart(2, '0')}`;
  if (!sign) return cents < 0 ? `−${body}` : body;
  if (cents === 0) return body;
  return cents < 0 ? `−${body}` : `+${body}`;
}
