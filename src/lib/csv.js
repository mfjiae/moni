// CommBank NetBank CSV export (checked against a real sample, Oct 2026):
// no header row; columns: date (DD/MM/YYYY), signed amount, description, running balance; newest first.
// Card purchases end with "Card xx#### Value Date: DD/MM/YYYY" = the real purchase date.
import { parseCents } from './money.js';
import { parseDMY } from './dates.js';

// Minimal CSV line splitter that respects double quotes.
export function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const VALUE_DATE = /\s*Card xx\d{4}\s+Value Date:\s*(\d{2}\/\d{2}\/\d{4})\s*$/i;

export function cleanDescription(raw) {
  return raw.replace(VALUE_DATE, '').replace(/\s+/g, ' ').trim();
}

// Returns { rows, errors }. Each row:
// { postedDate, date, amountCents, description, rawDescription, balanceCents, importKey }
export function parseNetBankCsv(text) {
  const rows = [];
  const errors = [];
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    try {
      const cols = splitCsvLine(line);
      if (cols.length < 4) throw new Error(`expected 4 columns, got ${cols.length}`);
      const [dateText, amountText, rawDescription, balanceText] = cols;
      const postedDate = parseDMY(dateText);
      const vd = VALUE_DATE.exec(rawDescription);
      const date = vd ? parseDMY(vd[1]) : postedDate;
      const amountCents = parseCents(amountText);
      const balanceCents = parseCents(balanceText);
      rows.push({
        postedDate,
        date,
        amountCents,
        description: cleanDescription(rawDescription),
        rawDescription,
        balanceCents,
        importKey: `${postedDate}|${amountCents}|${rawDescription}|${balanceCents}`,
      });
    } catch (e) {
      errors.push({ line: i + 1, text: line, message: e.message });
    }
  });
  return { rows, errors };
}

// The newest row (first in the file) carries the current account balance.
export function latestBalance(rows) {
  return rows.length ? rows[0].balanceCents : null;
}
