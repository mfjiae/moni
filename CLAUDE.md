# moni — project notes for Claude

Personal spending tracker and budget manager for one user (Ken, Sydney, AUD).
Ken is not a developer: explain decisions in plain words, keep changes small, and always run tests before pushing.
Full spec: "Finance Tracker — v1 Spec" doc in Ken's Claude artifacts.

## Stack
- React + Vite, static PWA, hosted on GitHub Pages at https://mfjiae.github.io/moni/ (base `/moni/`)
- IndexedDB via Dexie (`src/lib/db.js`) is each device's copy. No server, no bank login.
- Sync (`src/lib/sync.js`, `merge.js`, `github.js`): the app reads/writes `moni.json` in Ken's PRIVATE repo `mfjiae/moni-data` with a fine-grained token (Contents read/write on that repo only) stored on each device. Newest edit wins per record; deletes leave tombstones. The app refuses a public data repo.
- Tests: Vitest (`npm test`). The GitHub Action runs tests, builds and deploys on every push to `main`.

## Hard rules
- Money = integer cents (`src/lib/money.js`). Never floats.
- Dates = `YYYY-MM-DD` strings in Sydney local time (`src/lib/dates.js`). Never `new Date("DD/MM/YYYY")`.
- `.gitignore` is an allowlist. Never commit real CSVs, backups or personal data to this public repo. Test fixtures use fake names.
- Every record has a stable `uid` (bank rows: `csv|<importKey>`) and `updatedAt`. Any write must stamp `updatedAt` and call `requestSync()` (store.js does this).
- Claude has no access to moni-data and shouldn't need it.
- Dark theme only, no toggle. Color tokens live in `src/index.css`.
- Budget period: calendar month.

## Money logic
- Savings account xx2066: transfers to/from it are `saving`, never income or spending. Saving shows as net.
- Investing (Betashares, CommSec) counts as spending, in the Investing category.
- Refunds and friends paying back reduce the category's spending; they are not income.
- PayID to/from people and unknown merchants go to the Review inbox for Ken to categorize.
- Merchant rules (`src/lib/rules.js`) are checked top to bottom, most specific first. Rent = "Direct Debit … SCAPE"; laundry = "SCAPE AUSTRALIA".

## Code map
- `src/lib/`: pure logic (money, dates, csv, rules, importer, summary), all tested; `store.js` = database actions
- `src/components/`: screens (Home, Activity, AddTxn, TxnSheet) and shared UI
- Learned rules live in the `rules` table and run before `DEFAULT_RULES`
- Savings transfers are hidden from Home's Recent and from Activity unless toggled on

## NetBank CSV
No header; columns: date DD/MM/YYYY, signed amount, description, running balance; newest first.
Card rows end with "Card xx#### Value Date: DD/MM/YYYY" — that is the purchase date. Dedupe on `importKey`.

## Visual bugs to fix later (Ken's list, don't fix until asked)
- Settings, first-time connect form: the Token input and the "Connect and sync" button sit too close together.

## Milestones
- [x] M1: app shell, Home screen with sample data, tests for core logic
- [x] M2: CSV import into Dexie (dedupe + manual-entry matching), learned merchant rules, Review inbox, Activity list, manual add, month switcher
- [x] Desktop layout (sidebar from 900px) and sync between devices via moni-data
- [ ] M3: Budgets page (all categories, edit limits)
- [ ] M4: Cash flow page (income / spending / bills / saving / investing; 6-month category bars)
- [ ] M5: bills (weekly/fortnightly/monthly), install polish (backup is covered by moni-data history)
