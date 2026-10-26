// UTS session dates for the Tuition bill (Ken, 26 Oct 2026). Public calendar data, no personal data.
// Source: UTS "academic year dates" and "tuition payment dates" pages, checked 26 Oct 2026.
// Rule: fees are due on the THURSDAY OF WEEK 3 = session start (a Monday) + 17 days, which is also the
// census date (a Thursday) - 14 days. UTS publishes the due dates only for the current year, so later
// ones are expected dates. CHECK THIS LIST AGAINST THE UTS PAGES EACH YEAR and add the next year.
//   2026: Autumn due Thu 5 Mar, Spring due Thu 13 Aug (published).  2027: from session start / census.
import { addDays } from './dates.js';

export const UTS_SESSIONS = [
  { name: 'Autumn 2026', start: '2026-02-16', census: '2026-03-19' },
  { name: 'Spring 2026', start: '2026-07-27', census: '2026-08-27' },
  { name: 'Autumn 2027', start: '2027-02-15', census: '2027-03-18' },
  { name: 'Spring 2027', start: '2027-07-26', census: '2027-08-26' },
];

export const feeDue = (s) => addDays(s.start, 17);
export const UTS_DUE = UTS_SESSIONS.map(feeDue);

// The span the list covers (a little either side), so plain half-yearly guesses fill in only outside it.
export const UTS_COVER = { from: addDays(UTS_DUE[0], -90), to: addDays(UTS_DUE[UTS_DUE.length - 1], 90) };
