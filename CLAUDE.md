# moni — project notes for Claude

Personal spending tracker and budget manager for one user (Ken, Sydney, AUD).
Ken is not a developer: explain decisions in plain words, keep changes small, and always run tests before pushing.
Full spec: "Finance Tracker — v1 Spec" doc in Ken's Claude artifacts.

## Stack
- React + Vite, static PWA, hosted on GitHub Pages at https://mfjiae.github.io/moni/ (base `/moni/`)
- IndexedDB via Dexie (`src/lib/db.js`) is each device's copy. No server, no bank login.
- Sync (`src/lib/sync.js`, `merge.js`, `github.js`): the app reads/writes `moni.json` in Ken's PRIVATE repo `mfjiae/moni-data` with a fine-grained token (Contents read/write on that repo only) stored on each device. Newest edit wins per record; deletes leave tombstones. The app refuses a public data repo.
- Snapshot = txns, learned rules, categories (renames/hidden/custom, since M2.5), tombstones, balance. An older app version drops `categories` when it writes; the next sync from a new version restores them.
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
- Accounts: main = Smart Access xx6193 (the CSV imported so far). Savings = NetBank Saver xx2066 (main savings, 5% bonus rate until ~Nov 2026) and xx2103 (2nd savings, emptied Aug 2026).
- Transfers between Ken's own accounts are `saving`, never income or spending. Saving shows as net.
- DON'T import savings-account CSVs until M2.6: they'd overwrite the main balance and their transfers aren't paired yet.
- Investing (Betashares, CommSec): Home keeps it OUT of "Spent" (it has its own Invested box). The Spending detail page adds it back so Ken sees everything that left in a month (Ken, 13 Oct 2026).
- Family money = Family support income: transfers marked LIVING FEE / LIVING EXPENSES and the ATM cash deposits. Match on those words, never on a person's name (public repo).
- Refunds and friends paying back reduce the category's spending; they are not income.
- PayID to/from people and unknown merchants go to the Review inbox for Ken to categorize.
- Merchant rules (`src/lib/rules.js`) are checked top to bottom, most specific first. Rent = "Direct Debit … SCAPE"; laundry = "SCAPE AUSTRALIA".
- Rules only run at import. When rules change: Activity → To review → "Re-sort with latest rules" (Review items only). The M2.5 rule change also ran a one-time catch-up per device (`migrateRules`, meta `rulesVersion` = 2): anything whose category equals what the M2 rules gave it (`rules-v1.js`, frozen) gets the new rule's category; hand-changed items are left alone; old "Income" items are re-checked (job/family/interest) and the rest become "Other income". Nothing sorted ever goes back to Review. If rules change again in a way that should recategorize old data, freeze the current rules as `rules-v2.js` and bump `RULES_VERSION`.
- Learned rules with a too-broad keyword (DIRECT DEBIT, TRANSFER TO, …, see `isBroadKeyword`) are ignored and can't be saved. Settings → Learned rules lists them with Delete.

## Code map
- `src/lib/`: pure logic (money, dates, csv, rules, importer, summary), all tested; `store.js` = database actions
- `src/lib/resort.js` = re-sort / one-time catch-up (pure, tested); `rules-v1.js` = frozen M2 rules, don't edit
- `src/lib/categories.js`: defaults + user overrides (`setCategoryOverrides`, called by App from the synced `categories` table); use `categoryName()` / `getCategory()`, never a static map
- `src/components/`: screens (Home, Detail = Spending/Income/Saved/Invested/account pages, Activity, AddTxn, TxnSheet, Settings) and shared UI (`ui.jsx`: Bar, MonthSwitch, CategorySelect dropdown)
- Learned rules live in the `rules` table and run before `DEFAULT_RULES`
- Savings transfers are hidden from Home's Recent and from Activity unless toggled on

## NetBank CSV
No header; columns: date DD/MM/YYYY, signed amount, description, running balance; newest first.
Card rows end with "Card xx#### Value Date: DD/MM/YYYY" — that is the purchase date. Dedupe on `importKey`.

## Categories (M2.5, CommBank-aligned; hidden = available but not shown until unhidden)
Ids: eating-out, groceries, shopping, entertainment, personal-care, health, sport, education, tuition, housing, utilities, subscriptions, transport, travel, gifts, fees, professional, other (= Uncategorized); hidden: business, cash, childcare, home-loan, insurance, pets, tax, super; income: job-income, family, interest, income (= Other income, the old M2 "Income" id); investing, saving, internal. Custom ones: `custom-<slug>-<rand>`. Ids never change.
- Spending: Eating out & takeaway, Groceries, Shopping, Entertainment, Personal care, Health & medical, Sport & fitness, Education, Tuition, Rent & housing (kept; CommBank "Home" maps here), Utilities (phone, internet), Subscriptions (Claude, Patreon, Real-Debrid, apps), Vehicle & transport, Travel & holidays, Gifts & donations, Fees & interest, Professional services, Uncategorized
- Hidden by default: Business, Cash, Childcare, Home loan, Insurance, Pets, Tax paid, Super contributions
- Income: Job income, Family support (incl. the ATM cash deposits, which were family money), Interest, Other income
- Revolut top-ups (card, "Revolut**"): leave in Review; Ken will check them against Revolut
- Not spending: Savings transfers, Transfers & payments (excluded), Investing (counts as invested, CommBank "Shares"/"Other investments")

## Visual bugs to fix later (Ken's list, don't fix until asked)
- (none open)
- Fixed in M2.5: Settings token input / Connect button spacing (the inner form wasn't a flex column); Sync card narrower than "This device" (all Settings cards now share one width); desktop sidebar "99+" badge overlapping "Activity".

## Later, for a real mobile app version (Ken's idea, not now)
- Mobile look: Material 3 / Samsung One UI style (Android 17 era): rounded cards, bigger tap targets, One UI-style top area.
- Animations and transitions come with that version, not in the web app now.

## Milestones
- [x] M1: app shell, Home screen with sample data, tests for core logic
- [x] M2: CSV import into Dexie (dedupe + manual-entry matching), learned merchant rules, Review inbox, Activity list, manual add, month switcher
- [x] Desktop layout (sidebar from 900px) and sync between devices via moni-data
- [x] M2.5 (built 13 Oct 2026; tested with both main-account CSVs in a browser):
  - Look: type and sizes up 10–15%; card headings bigger and highlighted; fix the visual bug list
  - Colors (Ken's palette; he dislikes yellow): income = blue, spend = orange, saving = purple, invest = green/teal; budget bars blue, over budget = orange-red
  - Home: monthly cash flow card = horizontal bars (income vs spend); 4 boxes In / Spent / Saved / Invested (2×2, also on desktop); Recent = 5 on phone (Ken picked 5), 10 on desktop
  - Balance as a highlighted box; tap opens an account page (balance-over-time chart + all transactions)
  - Tap any box -> detail page (CommBank-style), see M4 list below for the full version. Detail pages: category breakdown with %, tap a category to filter the list; phone back gesture closes them
  - Spending detail has a "without tuition" view; headline total still includes tuition
  - Income detail has a "job income only" view (excludes Family support)
  - Month switcher: "This month" button; no months before the first month with data (never before Jan 2024)
  - Category picker = dropdown (most-used first + search); "Add category" in the dropdown and in Settings; rename / hide (synced)
  - Category set (CommBank-aligned, see "Categories" below); recategorize existing data where rules change
  - Rules: Tuition = UTS ... BPAY only; "UNIVERSITY OF TECHNO" card charges = Education (kits, printing); Activate UTS, Broadway Gym, badminton = Sport & fitness; TelcoPay direct debit + Moose = Utilities (phone, ~$26.80/month); xx2103 transfers = saving; savings Credit Interest = Interest income
  - FIX: merchantKey turns "Direct Debit 502541 TelcoPay" into "DIRECT DEBIT", so a learned rule would catch every direct debit. Skip "Direct Debit <number>" / "Transfer to" prefixes when making the keyword.
  - "Re-sort Review with the latest rules" button (rules only apply at import time today)
- [ ] M2.6 Accounts: import a CSV per account (choose the account on import); Smart Access balance box + a box per savings account; pair transfers between own accounts (main "Transfer from xx2066" = savings "Transfer to xx6193") so nothing double counts; savings interest as income.
- [ ] Later: pending transactions aren't in CSV exports -> add by hand now; screenshot import later (v2).
- [ ] M3: Budgets page: vertical month-progress marker on each bar; "Add category to budget" picks from existing categories (like CommBank); all bars blue, over = orange-red
- [ ] M4: Cash flow page (CommBank-style):
  - Standing bar chart per month, scrollable month to month: income blue, spend orange, saving purple, invest teal
  - Four boxes (Spent, Bills, Saved, Invested) each open their own page
  - Period picker: this cycle (1–31 with days left), month, quarter, year
  - Spending: categories with % of total (e.g. Rent 50%) and what's left
  - Saved: per savings account breakdown, total on a graph, progress
  - Invested: like spending, plus a Betashares-style line chart of contributions over time
  - Tuition page: all tuition payments by semester
- [ ] M5: Bills tab: bills this month, next bill date, bill calendar, 3-month bar overview, expand to all months, review option; weekly/fortnightly/monthly bills; install polish
