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
- `src/components/`: screens (Home, Detail = Spending/Income/Saved/Invested/account pages, Activity, AddTxn, TxnSheet, Settings) and shared UI (`ui.jsx`: Bar, MonthDropdown (Home), MonthSwitch + MonthPicker (other pages), CategorySelect dropdown; `icons.jsx`: line icons, one per category)
- `summary.js` also holds Home's month maths: `spentByDay`, `cumulativeSpend`, `monthCompare` (this month so far vs last month by the same day), `upcomingRent`
- Learned rules live in the `rules` table and run before `DEFAULT_RULES`
- Savings transfers are hidden from Home's Recent and from Activity unless toggled on
- `.claude/skills/`: design and review helpers (see "Design helpers" below). Origins and licences in `.claude/skills/SOURCES.md`.

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

## Ken's UX preferences (learned; apply to every screen)
- Stats first, transactions second. Each page leads with its own numbers (totals, categories, charts). Transactions are a separate box underneath, full width, grouped by day like CommBank, paged ("Show 10 more" or pages), never the main thing.
- Home has NO transaction list. At most a small link to Activity (or a tiny one-liner). Ken hates big transaction lists on Home.
- Controls must not move. A button appearing must never shift other buttons (the "This month" pill pushing the month arrows was annoying).
- Background: near-black neutral like the Claude app, no purple/indigo tint. Strong contrast, colors that pop, but not white text everywhere: secondary info goes muted, color carries meaning.
- Money colors (Ken, 13 Oct 2026; replaces the M2.5 blue-income palette), tokens in `src/index.css`: spent = red/orange, income/credit = green, saved = blue, invested = purple. Balance, buttons and links = cyan; "to sort" = rose. Hex values were my pick on 13 Oct (Ken only saw the prototypes): change the tokens if he wants different shades.
- Use the whole screen on wide monitors.
- Big visual changes: show prototypes in chat first, Ken picks, then build. Point out UX problems proactively and suggest ideas.

## NEXT UPDATE: M2.5b Layout, look and search (Ken, 13 Oct 2026; before M2.6 accounts)
**STEP 1 DONE (13 Oct 2026), STEP 2 BUILT and reworked to stats-left / transactions-right (134 tests); both waiting only for Ken's live check, he reports bugs as he finds them. Progress rule: after each piece of work, update this status and the memory notes (what is done, which update/step is next). NEXT: M2.5b step 3 (Activity search and filters, Opus, high).** new palette, Home layout, box icons, month dropdown + picker, wide-screen 2 columns from 900px (content up to 1600px; was 3 columns until Day by day moved down), Settings side list, 1W/1M on the account chart. Not yet seen by Ken in a browser: check it live and note what to adjust. Decisions (Ken approved the v3 prototype; change if he wants):
- Home order on phone: month dropdown with a small rose "N to sort" pill to its left (opens Activity > To review), banners (sync), rent warning, balance card, 4 boxes, "Spent so far", "Where it went", "Day by day". Desktop: col 1 = balance + Where it went (fills the column, 8 rows), col 2 = 4 boxes + Spent so far, then Day by day in a row below under col 1. CSS: on phone `.col` is `display:contents` with `order` on the cards.
- The 4 boxes show a bottom line with the FULL previous month ("September: $186.35"), never "by the 13th". "By the 13th" is only on the Spent so far card and its graph. Saved box reads "$X from savings" / "$X saved".
- Detail pages (Spending, Money in, Saved, Invested) have a "Compared with September" card: current month = two rows, "By the 13th" and "All of September", each with more/less; a past month = one "Whole month" row; "Nothing in X to compare with" when last month is empty (`compareMonths` in summary.js). Spending compares spent + invested, honoring "without tuition". Spending/less = green, more = orange; income/saved more = green; invested is neutral.
- **BUILT 13 Oct 2026 (129 tests, check live) (Ken, screenshot of the June view):** on the Spent so far card, remove the "Spent in June" title and the big number ($3,259.34 in the screenshot), because the Spent box above already shows that number. Keep only the "138% of May's $2,358.92" line with the "$900.42 more than May" line on its right, the progress bar and the graph. The big number is what the earlier line below calls "under the big number"; the more/less line stays on the same row as the % line. Done in `PaceCard` (Home.jsx); the card shows only the % line, the bar and the graph (or "Nothing earlier to compare with yet.").
- Spent so far: big graph with axes (hover/touch shows the day), this month vs last month, "$X so far, X% of September's $Y". The "$X less/more than September by the 13th" line sits on the same row as "44% of September's $Y" (that one left, this one right, never a new line except on a phone), under the big number (Ken, 13 Oct 2026).
- **BUILT 13 Oct 2026 (129 tests, check live; Ken approved the prototype in chat) (Ken, screenshot of the built Day by day card; supersedes the desktop column split and the inside of Day by day above):**
  - Desktop Home columns: the 4 boxes (In / Spent / Saved / Invested) move to the LEFT column, between the Smart Access balance card and Where it went. Column 1 = balance, 4 boxes, Where it went. Column 2 = Spent so far (graph) and Day by day.
  - The left column gets narrower (and the boxes shrink horizontally with it, so they stay a 2x2 grid) to give the right column more width, so the graph and the calendar are wider. Use unequal grid columns (about 1fr left, 1.5fr right; pick by eye).
  - Day by day inside: "Busiest day" becomes a smaller pill at the top right of the card header (same row as the "Day by day" title), not a box under the calendar.
  - The picked-day card becomes narrower and sits to the RIGHT of the calendar (calendar on the left), showing that day's total and the categories with their amounts (as it does now, just narrower and beside the calendar).
  - Phone: Ken confirmed nothing changes in width or order: everything is one full-width column, the picked-day card stays under the calendar, the busiest-day pill stays top right of its card.
  - Rent warning: the big banner is replaced by a small alarm pill ("Rent due in N days", "today", "tomorrow") in the top right corner of the Home header (`RentPill` in Home.jsx). Still only a warning, not clickable; hover shows the date and amount. On a phone it sits left of the Settings button; check it fits next to the month pill.
  - Font: the prototype in chat was drawn in Claude's own font (Anthropic Sans), which can't be used in moni. The app keeps IBM Plex Sans; if Ken wants the look closer, pick a free font (Inter or DM Sans are the nearest) and test it.
- **BUILT 13 Oct 2026 (129 tests, check in the live app; not seen in a browser by Claude), supersedes the Day by day placement below (Ken picked "option 1" in chat, 13 Oct 2026, after seeing the live desktop Home with a big empty block under the Spent so far graph):** on desktop (900px and up), move Day by day into column 2, directly under Spent so far, so both columns end at about the same height. Column 1 stays balance + Where it went; it does NOT stretch its rows to match column 2 (that spreads rows apart in months with few categories; see the visual bug list), so the columns may end at different heights. Make the calendar cells bigger so the calendar fills the column width; keep the bars above it, and the "Busiest day" and picked-day boxes under the calendar side by side. Phone order does not change. Done in `Home.jsx` (DayByDay inside column 2) and `index.css` (no stretching in Where it went, desktop cells 66px).
- Day by day (prototype B, Ken, 13 Oct 2026; desktop placement superseded by the line above): its own row at the very bottom of Home, as wide as column 1 (balance + Where it went), left-aligned, so Ken scrolls down to it. Desktop Home is now always 2 columns from 900px (no 3-column layout). Inside: bars, then calendar on the left with "Busiest day" and the picked-day box stacked on the right (under the calendar on a phone). Defaults to the latest day with spending.
- Rent warning (now a small pill in the header, see above; was a bigger, NOT clickable banner) (guess: last rent bill + the gap between the last two; shows from 7 days before). M5 (Bills) replaces it.
- Search box removed from Home. "All spending" in Where it went opens Activity (the Spending box opens the Spending page). Each category row in Where it went opens the Spending page with that category selected and only its transactions listed (Ken, 13 Oct 2026). Real search/filters = step 3.
- Savings balance inside the Smart Access card is NOT built: Ken will send ALL CSVs and M2.6 handles savings balances. No balance is invented. Ken asked on 13 Oct 2026 why it is missing (the prototype showed it, with sample numbers) and chose to wait for M2.6.
- Month picking: Home's month pill now has previous/next arrows either side of the name (Ken, 13 Oct 2026; changed from no arrows), with the arrows in fixed places (the name has a minimum width) and extra padding so the text isn't tight to the pill edge; other pages keep arrows in fixed places too. Tapping the name opens the picker on every page. "This month" is inside the picker.
- Settings = side list (Sync, This device, Categories, Learned rules). Desktop: list left, section right (Sync open by default). Phone: list of rows, each opens its section with a Settings button to go back. Learned rules shows an empty-state card.
- Account page chart ranges: 1W / 1M / 3M / 1Y / All (the line starts at the balance held coming into the range).
- **STEP 2 BUILT (13 Oct 2026, 132 tests, check live):** detail and account pages: stats first, then ONE full-width transactions box underneath, grouped by day with each day's net total in the header ("Today, Tue 13 Oct  -$24.00"), paged by whole days (30 transactions, then "Show more"; `groupByDay` in `src/lib/daygroups.js`, tested). On desktop the stat cards sit side by side in a row (they wrap under 340px each); the account balance chart (1W/1M/3M/1Y/All, from step 1) is full width. Home's busiest-day pill now reads "Busiest day: Tue 6th · $961.31".
- **BUILT 13 Oct 2026 (134 tests, check live; Ken approved the prototypes) (Ken, screenshots of the built step 2):** the step 2 desktop layout looks odd (cards in a row with a big empty area, and on Smart Access a big empty space right of the balance card). Ken wants it reverted to two columns: STATS on the LEFT, the day-grouped TRANSACTIONS box on the RIGHT, on every detail page and the account page (about 1fr left, 1.15fr right, transactions tall on the right). Spending: left column = Everything / Without tuition toggle, big total, Compared with last month, By category. Smart Access: left = balance card, then the balance chart (smaller, with 1W/1M/3M/1Y/All) ; right = All transactions. Phone stays one column (stats then transactions). This also fixes the bug below. Built: `.detail-grid` is 2 columns from 900px; the Everything / Without tuition and All income / Job income only toggles are now at the top of the left column.
  - Ken said yes to the left/right layout for Spending and Smart Access (13 Oct 2026).
  - Date header (Ken picked option C, 13 Oct 2026): bold date with a cyan accent bar, day total at the right, PLUS a small relative-day chip beside the date: Today, Yesterday, then "2 days ago" up to "6 days ago"; older days show the date only. Chip goes up to "31 days ago" (`relativeDay` in dates.js, tested), Ken's call. Built.
  - "Show more" button shows the exact number it will reveal plus what is left (e.g. "Show 31 more · 920 left"); the number varies because paging is by whole days (`groupByDay`, limit +30); it never cuts a day. Built.
  - Bug (Ken): on the Spending page the Everything / Without tuition toggle sits on its own as a third card on the right for no reason. Cause: the stat cards flow in an auto-fit grid. Goes away with the left/right layout above (toggle at the top of the left column).
- Left for later: Activity filters (step 3). Remembered toggles, quick sort and nicknames not started.
Build in steps, test each. Home layout = PICKED (Ken, 13 Oct 2026): prototype 1 as the base, mixed with parts of 2, 3, 4, 5. Ken's pick:
- Home pick details (Ken, 13 Oct 2026):
  - Base = prototype 1 (command center): month-dropdown, top categories with icons, small "last month" reflection (graph), search box, small "N to sort" chip (its own small separate box, not a big one).
  - Balance: Smart Access balance with the savings balance beside it, in prototype 1's style, but it must POP: bigger and a distinctive color. Palette = palette 1.
  - 4 boxes (In / Spent / Saved / Invested) with icons like prototype 2, but with BIGGER numbers.
  - "Where it went" with % per category, "more or less than last month by this date", and month total with progress bar (from prototype 2); draw the bars in prototype 1's style. Avoid clutter.
  - Per-day spending bars for the month (prototype 4) and a COMPACT heat-scale calendar (prototype 5, left side only). Ken said yes to both.
  - Bill warning banner (rent due soon) from prototype 3.
  - Drop: pie chart, prototype 5's right side, prototype 3's other parts.
  - Background brightness between prototype 1 and 2 (near-black neutral).
  - Reword the "spent X% of September's total so far" line: show "$X so far, X% of September's $Y" so it is clear.
  - Saved and Invested colors: Ken said "ye sure" to my suggestion: Saved = blue, Invested = purple (spent red/orange, income green).
- Look: Claude-like near-black background (no purple tint), better contrast, new palette (spent red/orange, income green), less white text, colored icons instead of the top lines on the 4 boxes, use the space on wide screens (see visual bug list).
- Month picking: (Home now has arrows, see above.) On other pages: arrows stay in fixed positions; tapping the month name opens a picker (years and months grid, "This month" inside it) to jump straight to any month.
- Home: remove Recent; link to Activity instead (or a tiny one-liner).
- Detail pages (Spending, Income, Saved, Invested): category stats on top; transactions in a separate full-width box underneath, grouped by day (CommBank-style day headers with the day's total), paged.
- Account page: bigger balance chart, full width; add a 1-week range (1W / 1M / 3M / 1Y / All); transactions move into a separate box under the chart, grouped by day, paged/expandable.
- Activity = the place for all transactions: grouped by day, paged, plus a scalable search (CommBank-style filter buttons):
  - text search (merchant, note, person), with matches highlighted
  - date range from / to; amount range min / max; direction in / out
  - category filter (pick several); type filter: card purchase, direct debit, BPAY, transfer/PayID to a person, to/from savings, income, refund
  - "who" filter: pick a person or merchant
  - result count and total of what's shown

## Design helpers (installed 13 Oct 2026)
Three skills in `.claude/skills/`, copied from public repos (not auto-updated; see `SOURCES.md`):
- `ui-ux-pro-max/`: gives design OPTIONS (palettes, layouts, fonts, chart types). Its default answers are generic and not finance-specific: its first test for "personal finance dashboard" suggested glassmorphism, a handwritten font and blue/green. Treat its output as options only. Ken's rules below win: money colours (spent red/orange, income green, Saved blue, Invested purple), dark near-black background, no yellow, no handwriting or decorative fonts, no glass or blur effects.
- `web-design-guidelines/`: run it as a review on UI changes before pushing (accessibility, focus states, forms, reduced motion, dark mode). Report what it finds in a few lines; fix only what Ken asks for, or note it in the visual bug list.
- `react-best-practices/`: a reference when writing or reviewing components. Don't refactor for performance unless there is a real slowdown; the app is small.
- Not installed on purpose: Vercel deploy and optimise skills (moni deploys to GitHub Pages), React Native rules (no native app yet), writing and view-transition skills, and the other UI UX Pro Max extras (banner, brand, slides, design-system).
- `.gitignore` is an allowlist. It now lets through `.claude/skills/` only (not `.claude/` in general, so local settings stay ignored). The skill's data CSVs are generic reference tables and are allowed under that folder only; real CSVs elsewhere stay blocked.

## Model per update (Ken, 13 Oct 2026)
At the start of every session and every stage, tell Ken which update and stage we're in, and which model and effort it needs. If he's on a different one, say so before starting.
- M2.5b step 1, look + Home layout + icons + wide screen + month picker: Sonnet, medium
- M2.5b step 2, detail and account pages (stats first, day-grouped transactions, 1W chart): Sonnet, medium
- M2.5b step 3, Activity search and filters (decides which transactions are shown and totaled): Opus, high
- Quick sort: Sonnet, medium. Clean names / nicknames (synced data): Opus, high
- M2.6 accounts (transfer pairing, double-count risk): Opus, high
- M3 budgets: Sonnet, medium
- M4 cash flow + investment page: Opus, high for the numbers; Sonnet for the charts if split
- M5 bills (recurring detection, next dates): Opus, high
- Small visual fixes or notes: Sonnet, low or medium. A session mixing money logic and UI: start on Opus, high.

## Visual bugs to fix later (Ken's list, don't fix until asked)
- Fixed 13 Oct 2026 (check live; was: Ken, screenshot of January 2026 on desktop): "Where it went" has huge gaps between rows when a month has only a few categories (3 rows: Rent & housing, Utilities, Subscriptions). The card stretches to the height of column 2 and spreads the rows apart to fill it. Wanted: it should manage space flexibly. Rows keep a normal, fixed spacing whatever the number of categories; leftover space stays empty at the bottom of the card, or the card is only as tall as its rows, never rows spread apart. Fix with the Day by day move below: do NOT stretch the rows to match column 2.
- Fixed 13 Oct 2026 (check live): on a wide desktop screen Home had a big empty block under the Spent so far graph (column 2), because Day by day sits under column 1. Fixed by moving Day by day into column 2 (check live).
- Fixed, Ken confirmed it works (13 Oct 2026; screenshot of the 591769a build): the month pill touched the "226 to sort" pill (the -14px left margin from that fix pulled it into the gap) and showed no arrows. Both were changed in the next push (0b4d9c3: margin removed, arrows added inside the pill). If it still looks the same after reloading the app twice (old version cached), it is a real bug: fix the gap between the two pills (header-left gap) and the arrows.
- Fixed 13 Oct 2026 (check live): the month pill (e.g. "August 2026" with the dropdown arrow) on hover: the month text isn't centred in the pill, and the "A" sits too close to the pill's left border. The "226 to sort" pill is not part of this bug.
- Fixed 13 Oct 2026 (check live): Day by day was cluttered sideways in the 3-column Home (boxes moved under the calendar); on detail pages (Spending, Money in, Saved, Invested, account) the big-number card and the comparison card touched with no gap (`.detail-grid .col` now has a 16px gap, same as Home).
- Fixed 13 Oct 2026 (check live): the empty gaps in Home's third column are gone because Day by day moved to the bottom (prototype B, column 1 width); the more/less line moved onto the "% of September" row.
- DECIDED (Ken, 13 Oct 2026): the Savings line under the Smart Access balance (prototype had it) waits for M2.6. No balance-only shortcut, no hand-typed figure.
- Found in the 13 Oct review (not Ken's, not fixed): buttons have no visible keyboard focus ring outside the category dropdown, and there is no `prefers-reduced-motion` handling (little animation exists yet).
- Fixed in M2.5b step 1 (13 Oct 2026, check in the live app): Home's 4 boxes now have a colored icon instead of the top line; desktop content grows to 1600px with 3 columns on Home.
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
  - Colors (superseded by the M2.5b palette: spent red/orange, income green, saved blue, invested purple): income = blue, spend = orange, saving = purple, invest = green/teal; budget bars blue, over budget = orange-red
  - Home: monthly cash flow card = horizontal bars (income vs spend); 4 boxes In / Spent / Saved / Invested (2×2, also on desktop); Recent = 5 on phone (Ken picked 5), 10 on desktop
  - Balance as a highlighted box; tap opens an account page (balance-over-time chart + all transactions)
  - Tap any box -> detail page (CommBank-style), see M4 list below for the full version. Detail pages: category breakdown with %, tap a category to filter the list; phone back gesture closes them
  - Spending detail has a "without tuition" view; headline total still includes tuition
  - Income detail has a "job income only" view (excludes Family support)
  - Month switcher: "This month" button; no months before the first month with data (never before Jan 2024)
  - Category picker = dropdown (most-used first + search); "Add category" in the dropdown and in Settings; rename / hide (synced)
  - Category set (CommBank-aligned, see "Categories" below); recategorize existing data where rules change
  - Rules: Tuition = UTS ... BPAY only; "UNIVERSITY OF TECHNO" card charges = Education (kits, printing), except "University Of Technol Broadway NS" = Health & medical (health visit) and its AGA Assistance insurance refund = Health; Activate UTS, Broadway Gym, badminton = Sport & fitness; TelcoPay direct debit + Moose = Utilities (phone, ~$26.80/month); xx2103 transfers = saving; savings Credit Interest = Interest income
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
  - Invested page (Ken, 13 Oct 2026): line chart of contributions per month and cumulative total, ranges month / quarter / year / 3y / 5y / 10y / all; optional "potential growth" line at a return rate Ken sets (clearly labelled as an estimate, not Betashares data). Goes in M4 because it needs M2.6 (investing paid from savings must count once) and a few months of contributions to be worth charting.
  - Tuition page: all tuition payments by semester
- [ ] M5: (Ken, 13 Oct 2026) when the Bills tab is built, the "Rent due in N days" pill in the top right of Home opens the Bills page (it is only a warning until then).
- [ ] M5: Bills tab: bills this month, next bill date, bill calendar, 3-month bar overview, expand to all months, review option; weekly/fortnightly/monthly bills; install polish
