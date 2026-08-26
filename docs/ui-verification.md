# UI verification — Technical Ledger redesign

Tab-by-tab visual acceptance of the Stitch "Technical Ledger" overhaul. Screens
are opened in a browser through the real UI on a fresh local origin
(`localhost:8099`) with **sample data** (Settings → Advanced → Load sample data)
and **no real sync credentials**.

## Method (updated 2026-08-26 — typography-correction pass)

Screenshots are captured with **headless Chromium via Playwright** at a **true
390px** CSS mobile viewport (deviceScaleFactor 2 → 780px PNGs) and **1600px**
desktop, saved as **real PNG** files (no JPEG re-compression). The earlier
~500px "mobile" shots from the clamped in-browser tool were replaced. Computed
`font-family` / `font-weight` / `font-size` were read from the live DOM (below).

Comparison screenshots: `artifacts/ui-verification/*.png` (390 mobile + 1600 desktop).

## Computed font evidence (live DOM, sample data)

| Element | Family | Weight | Size |
| --- | --- | --- | --- |
| Sidebar item (inactive) | JetBrains Mono | 400 | 12px |
| Sidebar item (active) | JetBrains Mono | 500 | 12px |
| Sidebar brand | JetBrains Mono | 500 | 12px |
| Mobile page title | JetBrains Mono | 500 | 13px |
| Bottom nav (active) | JetBrains Mono | 500 | 10px |
| Instrument label (Net worth) | JetBrains Mono | 400 | 10px |
| Home hero value (SAR 0) | JetBrains Mono | 600 | 34px |
| Budget income value | JetBrains Mono | 500 | 34px |
| Expenses burn value | JetBrains Mono | 600 | 34px |
| **Investments hero total** | **Source Serif 4** | 600 | 40px |
| Transaction field label | JetBrains Mono | 400 | 10px |
| Transaction amount | JetBrains Mono | 500 | 34px |

Fonts load from **local files** (`fonts/*.woff2`) — `document.fonts.check()`
confirms JetBrains Mono 400/500, Inter 500, and Source Serif 4 600 are all
present; there are **no `fonts.googleapis`/`gstatic`/Material Symbols** references
in any served file. Self-hosted weights: Inter 400/500/600/700, JetBrains Mono
400/500/600, Source Serif 4 600.

## Home / Dashboard overhaul (2026-08-26 — focused pass, revised)

The Home screen and the shell elements it depends on were rebuilt around the
approved Stitch **Dashboard** composition (an open financial-ledger layout, not
the earlier bordered-card grid). Scope was Home + shared shell only; other
screens were not redesigned in this pass.

**Viewports captured (real PNG, headless Chromium via Playwright, sample data,
no sync credentials):**

| Artifact | Viewport (CSS) | Device scale | PNG size |
| --- | --- | --- | --- |
| `artifacts/ui-verification/home-mobile-revised.png` | 390 × 844 | 2 | 780 × 1688 |
| `artifacts/ui-verification/home-mobile-320-revised.png` | 320 × 720 | 2 | 640 × 1440 |
| `artifacts/ui-verification/home-desktop-revised.png` | 1600 × 1000 | 2 | 3200 × 2000 |
| `…-revised-full.png` (mobile + desktop) | full-page variants | 2 | — |

Files confirmed to contain **PNG** data (`file` → `PNG image data`), not JPEG.

**Status: Pass** — close alignment with the approved Stitch Dashboard in desktop
column structure, mobile section structure, hierarchy, whitespace, borders/
dividers, typography roles, header treatment, navigation geometry, and
responsive behaviour.

**Desktop** (compared to `stitch-reference/dashboard-desktop/screen.png`):
- Fixed 256px sidebar (all real routes preserved) + compact top utility bar;
  the dashboard begins immediately below the bar.
- Three adjoining vertical panels in current module order — Net Worth (≈1.6fr) ·
  Investments (1fr) · Tracked Spending (1fr) — separated by thin vertical rules,
  no gutters, no floating cards, with a viewport-based minimum height.
- Me / My Wife / Household selector **moved into the utility bar** (Home only);
  compact `NOT CONNECTED` sync + Settings sit to its right.
- Secondary modules (Savings & Investing, Goals, trend cards, Quick actions)
  sit below the primary workspace as subordinate, rule-separated open sections.

**Mobile** (compared to `stitch-reference/dashboard-mobile/screen.png`):
- Vertically stacked ledger: full-width open sections divided by thin horizontal
  hairlines, module order Net Worth → Investments → Tracked Spending → Savings &
  Investing → Goals.
- Compact header: home glyph + mono `HOME`, **icon-only** sync utility (no boxed
  connection button), Settings, thin bottom rule.
- Net Worth is the hero; the Me/Partner/Household selector stays inside it on
  mobile. Section title reads `NET WORTH` (no `· …` truncation); at 320px the
  label wraps cleanly rather than truncating, and nothing overflows.
- Bottom navigation is the **compact floating rail**: centred, opaque warm-white,
  one hairline, subtle shadow, separated from the edges and above the safe area,
  **icons only** (accessible names via `aria-label`/`title`), active icon in ink.
- Square black FAB preserved; nudged up to clear the floating rail with a gap.

### Intentional differences from Stitch (Home)

- **Module order** kept as the app's own: Net Worth, Investments, Tracked
  Spending (Stitch's middle/right columns are Active Budgets then Investments;
  we place Investments second per the approved exception).
- **No Overview / Reports / Analytics tabs** — Stitch's utility-bar tabs are
  decorative; we show the real page indicator (`HOME`) instead and add no dead
  controls.
- **No avatar/portrait** — the app has no real avatar asset; Stitch's portrait
  is a placeholder and is not reproduced.
- **Brand mark** stays the app's existing wallet glyph (its established
  vocabulary); the Stitch cloud is not adopted as the wordmark. The cloud icon
  remains the app's sync indicator.
- **Square black FAB** appearance/behaviour preserved (Stitch-consistent),
  rather than restyled.
- **Mobile rail shows four custom destinations + More** (Home, Budget, Expenses,
  Banks, More). The stored per-owner nav config still holds up to five
  destinations and the **desktop sidebar shows them all**; only the mobile rail
  trims to four, routing any 5th custom destination (default: Investments)
  through More so nothing becomes unreachable. No stored preference is deleted.
- **Empty states** (no history / offline / no quotes) keep the panel geometry
  and reserve the chart region with a restrained annotation — no fabricated
  trends. With sample data offline the Net Worth/Investments charts are empty and
  Investments reads USD 0 (no live quotes).

### Remaining visual differences (Home)

- With no history, the Net Worth and Investments chart regions are large reserved
  blanks; the mint-green Stitch trend line only renders once ≥2 data points
  exist (net worth) / ≥2 daily snapshots exist (investments).
- Trend cards (Lifestyle, Savings trend) remain null until 3 completed periods
  exist; their section headings still use the earlier Inter-600 style and were
  not recomposed (they cannot render against current data).

## Budget — recomposition (2026-08-26, direct-reference pass)

Rebuilt `BudgetView` to the approved Stitch Budget composition in the Home
open-ledger language. **All logic preserved** (month copy-on-write nav, plan-
source banner, copy-from-month, income `NumField`, select-mode move sheet,
sub-items, invest target, tracking/trim/goal-link controls, delete confirms) —
`git diff` is presentation-only.

**Viewports (real PNG, headless Chromium, sample data):**

| Artifact | Viewport | PNG |
| --- | --- | --- |
| `artifacts/ui-verification/budget-mobile-revised.png` | 390 × 844 | 780 × 1688 |
| `artifacts/ui-verification/budget-mobile-320-revised.png` | 320 × 720 | 640 × 1440 |
| `artifacts/ui-verification/budget-desktop-revised.png` | 1600 × 1000 | 3200 × 2000 |
| `…-revised-full.png` / `budget-mobile-revised-rows.png` | full-page / scrolled | — |

**Status: Pass.** Desktop shows the 8/4 analytical workspace (envelope ledger +
allocation-summary rail with a single vertical rule); mobile shows the stacked
ledger with mono group labels and hairline envelope rows. Structure, hierarchy,
metric strip, per-row rulers, and dividers align with the Stitch reference.

**What changed:** flat "Budget overview" header + period control (‹ month ›,
`.period-chip`); responsive 3-col metric strip (`.bm*`: income · allocated ·
remaining, vertical hairlines) + utilization `ProgressMeter` + owner toggle +
`Status`; envelopes as open-ledger groups (`.budget-group`, mono uppercase
`.group-head` labels, hairline `.cat-row`s, a `.cat-row-bar` relative-size
ruler); allocation summary + Total/Remaining footer + Invest & Grow moved into
the desktop right rail (stacks below envelopes on mobile); all category/sub
amounts render mono.

**Intentional differences from Stitch (Budget):**
- Rows show **allocation share** (amount, % of income, relative-size ruler), not
  spent-vs-budget — the app's Budget tab is the allocation *planner*; actual
  spending/utilization lives on Expenses. The Stitch "SPENT/BUDGET/UTILIZATION"
  treatment is applied to the app's allocation figures.
- The income figure is the editable raw `NumField` value (e.g. `SAR 22000`, no
  thousands grouping) — a known `NumField` limitation; every read-only figure
  (allocated, remaining, group totals, sub totals) is grouped.
- No Overview/Reports/Analytics tabs and no avatar (as on Home).
- App-specific affordances Stitch has no equivalent for are retained in the
  ledger language: plan-source banner, copy-from-month, select-to-move,
  sub-items, trim/goal-link controls, derived Installments group.

**Remaining differences:** on the narrowest widths envelope names truncate
earlier once the ruler + amount are shown (ruler hidden below 360px); the metric
strip keeps a light container border where Stitch mobile is borderless.

**Plan-status control (2026-08-26 follow-up).** The large always-on plan-status
banner between the month controls and the income summary was replaced by a single
compact outlined button (`I.Receipt` + `Base plan` / `Carried forward` / `Custom
plan`, `P.surface` + 1px hairline, radius 2, 40px, mono uppercase, left-aligned)
that opens a portalled `.sheet-bg`/`.sheet` bottom sheet (`useScrollLock` +
`useDialogA11y`, `role=dialog`/`aria-modal`, `I.X` close, backdrop + Escape
close, inside-click guarded). The sheet holds the full dynamic title, the
base/carried/custom explanation, the collapsed "Copy from a different month"
workflow (reveals the existing month selector + Copy, reusing `copyMonthOptions`/
`createCopyFrom`/`doCopyFrom` + the overwrite `ConfirmDialog`), and the Remove
action when the month has its own plan. A successful copy (or remove) closes the
sheet and resets the picker; reopening starts collapsed. Verified at 320/390/1600
+ DOM-asserted open/reveal/Escape/backdrop/reset. Reclaims the banner's vertical
space; no data-model/copy-on-write/calculation change.

**Expenses got the same treatment (follow-up).** The Expenses monthly-plan banner
was likewise replaced by the compact `Base plan` / `Carried forward` / `Custom
plan` button opening a portalled plan-status sheet (dynamic title + explanation +
actions). Its "+ Create plan" hands off to the existing plan picker
(`showPlanPicker` / `handleCreatePlan`); Remove uses `removePlanForMonth`. DOM-
asserted: button→sheet→Create-plan opens the picker.

**Shared `PeriodNav` component.** The `‹ month › + Today` control (flat squared
hairline arrows, centered `August 2026 / CURRENT MONTH` chip) and both page
titles (`.t-section`) are now shared/identical across the Budget "Budget
overview" and Expenses "Technical overview" headers — factored into one
module-scope `PeriodNav({viewMonth,setViewMonth,nowMonth,isFuture,isNow,
usesPayPeriod,addMonths,fmtMonth})` so the two can't drift again. (`addMonths`/
`fmtMonth` are per-view period-aware closures, passed in as props.) The floating
mobile nav rail + its buttons were squared to `borderRadius:2` to match the rest
of the app.

## Expenses — recomposition (2026-08-26, direct-reference pass)

Rebuilt the `ExpenseTrackerView` body (NOT the Add-Transaction sheet) to the
approved Stitch Expenses composition in the Home open-ledger language. **All
logic preserved** (owner scope, month copy-on-write nav, plan-source banner +
create/remove plan, burn/daily-avg/unaccounted maths, envelope pace/burn/trend,
extra-funds, untracked quick-transfer + goal-link, inline-per-envelope tx
expansion, the full month/day transaction log + reorder + delete/edit, the
Home filter-request drill-down). `git diff` is presentation-only.

**Viewports (real PNG, headless Chromium, sample data):**

| Artifact | Viewport | PNG |
| --- | --- | --- |
| `artifacts/ui-verification/expenses-mobile-revised.png` | 390 × 844 | 780 × 1688 |
| `artifacts/ui-verification/expenses-mobile-320-revised.png` | 320 × 720 | 640 × 1440 |
| `artifacts/ui-verification/expenses-desktop-revised.png` | 1600 × 1000 | 3200 × 2000 |
| `…-revised-full.png` | full-page | — |

**Status: Pass** — the previously-missing **desktop right-column activity
ledger split is now built** (`.split-8-4`: overview + envelope utilization LEFT,
"Recent activity" transaction ledger RIGHT, one vertical rule). Mobile is the
stacked open ledger. Structure/hierarchy/metric strip/rulers align with Stitch.

**What changed:** flat "Technical overview" header + period control (‹ month ›
`.period-chip`, replaces the glass nav); flat plan banner; **burn | daily-avg
metric strip** (`.exp-metrics`, vertical rule on desktop) with `ProgressMeter`
utilization; "Envelope utilization" open ledger — envelope cards → `.env-item`
open rows (flat `ProgressMeter` ruler with an even-pace tick, mono spent/of/left,
flat group/extra tags), untracked transfers → flat rows, the transaction log →
open month sections (hairline rows, flat NOW/PLANNED tags) placed in the desktop
right rail; `renderTxRow` tags/amounts flattened to flat mono.

**Intentional differences from Stitch (Expenses):**
- The right rail is the app's full **month/day transaction log** (collapsible,
  filterable), not a fixed 4-item "recent" list — no data is hidden; it defaults
  collapsed and expands in place.
- Envelope rows keep the app's richer affordances (pace/burn/3-mo-avg flags,
  add-to-envelope, add-extra-funds, inline tx expansion) in the flat ledger
  language rather than the read-only Stitch row.
- No Overview/Reports/Analytics tabs, no avatar (as on Home); sample data offline
  reads SAR 0 (no logged transactions / no live quotes).

**Remaining differences:** with sample data there are no transactions, so the
right-rail activity shows its empty state; the burn/daily-avg cells carry a
light internal rule rather than Stitch's exact spacing.

## Investments — recomposition (2026-08-26, direct-reference pass)

Rebuilt `InvestmentsView` to the approved Stitch Investments composition in the
Home open-ledger language, and **built the desktop 6/6 split that was previously
missing**. Presentation-only; all calculations, ownership filtering, priced-type
dispatch (Stocks/ETF · MP2 · Time Deposit · Gold), trade/contribution/payout/
maturity flows and modals preserved — `git diff` shows only JSX/CSS/style plus a
pure `allocParts` presentation helper (reuses the per-type USD totals already
computed; no new valuation).

**Viewports (real PNG, headless Chromium, sample data):**

| Artifact | Viewport | PNG |
| --- | --- | --- |
| `artifacts/ui-verification/investments-mobile-revised.png` | 390 × 844 | 780 × 1688 |
| `artifacts/ui-verification/investments-mobile-320-revised.png` | 320 × 720 | 640 × 1440 |
| `artifacts/ui-verification/investments-desktop-revised.png` | 1600 × 1000 | 3200 × 2000 |
| `investments-desktop-revised-full.png` | full-page | — |

**Desktop (6/6 split, `.split-6-6`):** LEFT = whole-screen scope switch, the
**Source-Serif portfolio total** (the app's one serif figure) + Market cost /
Return two-up + per-type breakdown, then **Asset allocation** (flat monochrome
`ProgressMeter` rows per class). RIGHT = **Holdings ledger** (Refresh + type/
status filters + MP2 rates), with the four holding groups (Stocks/ETF · Pag-IBIG
MP2 · Time Deposits · Gold) as open hairline rows under mono group labels.
Analysis (Portfolio trend · What's driving it · Growth projection) moved to a
full-width strip below the split.

**Mobile:** the same content stacked in reading order — scope, Source-Serif
total, Market cost/Return, allocation, holdings ledger, analysis. No horizontal
overflow at 320px (the Market cost/Return two-up wraps cleanly).

**Intentional differences from Stitch:**
- Holdings rows show ticker + value + return% + a disclosure chevron (the app's
  editable detail — name/owner/type/trades/delete — is behind the chevron, the
  same progressive-disclosure split Budget/Home use), rather than Stitch's static
  symbol/name/24h/units row. Nothing hidden.
- Allocation classes follow the app's real types (Stocks/ETF · Pag-IBIG MP2 ·
  Time Deposits · Gold), not Stitch's Stocks/Crypto/Cash/Gold; rulers are
  monochrome ink (allocation is neutral, not a good/bad state).
- No Overview/Holdings/Performance tabs, no avatar (as on Home).
- **Source Serif 4 on the portfolio total ONLY** — confirmed; every other figure
  is JetBrains Mono.

**Remaining differences:** in sample data offline there are no live quotes, so
stock values read $0.00 (−100% vs a real cost basis) and the allocation + trend
regions show their empty states; the MP2/TD/Gold account sub-cards
(`Mp2AccountCard`/`TdAccountCard`/`GoldAccountCard`) render inside the now-open
groups but retain some of their own internal chrome (not fully re-flattened this
pass — they are only visible once such an account exists, none in sample).

## Add/Edit Transaction — recomposition (2026-08-26, direct-reference pass)

Reflowed the `.sheet-task` Add-Transaction surface (inside `ExpenseTrackerView`)
to the approved Stitch Transaction composition. **All flows preserved** (create
+ edit, Tracked/Untracked/Goals, shortcuts + repeat quick-fill, name
suggestions, installment-linked read-only + unlink, envelope-after preview,
date, note, rapid "Save & add another", pin-as-shortcut, delete + confirm,
duplicate prevention, iOS focus rules) — `git diff` is presentation-only.

**Viewports (real PNG, headless Chromium, sample data):**

| Artifact | Viewport | State |
| --- | --- | --- |
| `artifacts/ui-verification/transaction-mobile-revised.png` | 390 × 844 | create, empty → **validation** (CATEGORY label red, RECORD dimmed) |
| `artifacts/ui-verification/transaction-mobile-filled-revised.png` | 390 × 844 | amount + category filled → REMAINING BUDGET + flat envelope preview |
| `artifacts/ui-verification/transaction-mobile-320-revised.png` | 320 × 720 | create, no horizontal overflow |
| `artifacts/ui-verification/transaction-desktop-revised.png` | 1600 × 1000 | bounded centered canvas over the dimmed Expenses backdrop |

**What changed:** the stacked label-above-input blocks became **connected
left-label field rows** (`.tx-field`/`.tx-field-label`/`.tx-field-val`, mono
uppercase label in a fixed left column, borderless value to its right, rows
divided by a single hairline — the Stitch construction), reordered to Stitch
order **AMOUNT · TITLE · CATEGORY · DATE · NOTE** (amount now the prominent first
row, matching the existing autofocus). Type segmented + shortcuts/repeat chips
sit in a padded strip above; chips flattened (999→2 radius, hairline). The
tinted rounded envelope-preview box became a flat status line; name-suggestion
and shortcut chips flattened. The required-empty validation cue moved from the
select's red box-border (borderless rows can't carry it) to a **red field
label**; the disabled-until-valid RECORD button is unchanged. Header (Close /
ADD TRANSACTION / Clear), the REMAINING-BUDGET/period context row, and the
pinned green RECORD action were already in place. Suppressed the global green
`:focus-visible` ring on the `.sheet-task` container (it is a `tabindex=-1`
a11y wrapper, not a tabbable control; inner controls keep their focus ring).

**Status: Pass.** Mobile is the full-screen task surface (Stitch mobile);
desktop is the bounded centered ≤600px canvas (a deliberate decision — Stitch's
desktop "ENTRY CONSOLE" is a full-bleed console with a category tile grid + right
rail; the app keeps the bounded canvas per the prompt and does not adopt the
tile-grid/right-rail construction). Create, filled, validation, and 320px states
all verified.

**Intentional differences:** 3-way TRACKED/UNTRACKED/GOALS segmented (the app's
real classification) vs Stitch's 2-way EXPENSE/INCOME; desktop stays a bounded
canvas rather than Stitch's full-screen console; the app's extra affordances
(shortcuts, repeat, name suggestions, installment link, envelope preview, pin,
rapid save) have no Stitch equivalent and are kept as flat subordinate elements.

**Shared-shell regression:** Home re-captured after this pass —
`home-mobile-regression.png` (390) + `home-desktop-regression.png` (1600) —
**unchanged** vs the approved `home-{mobile,desktop}-revised.png` baseline (the
only additions were Transaction-scoped `.tx-*` CSS + the `.sheet-task:focus`
suppression; no shared primitive changed).

## Verification table

| Screen | Mobile (390) | Desktop (1600) | Stitch reference | Status | Remaining differences |
| --- | --- | --- | --- | --- | --- |
| Home | ✓ | ✓ | Dashboard (A) | **Pass** | Card titles + net-worth/spending figures are mono; scope switch mono; sidebar mono 400/500. Verdict lines stay Inter (deliberate emphasis). No desktop side-ledger deviation — the dashboard grid is metric modules, matching Stitch. |
| Budget | ✓ | ✓ | Budget (A) | **Pass** (recomposed 2026-08-26) | Rebuilt to the Stitch composition: desktop **8/4 split** (envelope ledger LEFT · ALLOCATION SUMMARY rail RIGHT, one vertical rule); flat "Budget overview" header + period control; responsive **3-column metric strip** (income · allocated · remaining) with vertical hairlines + utilization ruler; **open-ledger groups** (mono uppercase group labels, hairline rows, per-row relative-size ruler); mono amounts throughout. See "Budget — recomposition" below. |
| Expenses | ✓ | ✓ | Expenses (A) | **Pass** (recomposed 2026-08-26) | Rebuilt to the Stitch composition: desktop **8/4 split** (overview + envelope utilization LEFT · "Recent activity" transaction ledger RIGHT, one vertical rule — the previously-missing split now built); flat "Technical overview" header + period control; **burn \| daily-avg metric strip** with vertical rule; **open-ledger envelope rows** (`.env-item`, flat `ProgressMeter` ruler + even-pace tick, mono spent/left, flat tags); untracked transfers + transaction log flattened. See "Expenses — recomposition" below. |
| Add/Edit Transaction | ✓ | ✓ | Transaction (A) | **Pass** | Full-screen TaskSurface reflowed to **connected left-label field rows** (`.tx-field`, mono label left / borderless value right / hairline-divided) in Stitch order AMOUNT · TITLE · CATEGORY · DATE · NOTE; mono header (Close / ADD TRANSACTION / Clear), REMAINING-BUDGET context row, TRACKED/UNTRACKED/GOALS segmented, prominent mono amount, pinned green RECORD. Required-empty validation = red field label + dimmed RECORD. Desktop = bounded centered canvas (≤600px), not Stitch's full-bleed console. All flows preserved. See "Add/Edit Transaction — recomposition" above. |
| Investments | ✓ | ✓ | Investments (A) | **Pass** (recomposed 2026-08-26) | Rebuilt to the Stitch composition: desktop **6/6 split** (portfolio overview + asset allocation LEFT · **holdings ledger** RIGHT, one vertical rule — the previously-missing split now built); analysis charts (Portfolio trend · What's driving it · Growth projection) moved to a full-width strip below. Portfolio total in **Source Serif 4** (the one serif figure); labels/returns/market-cost/allocation/holdings all mono. Holdings groups (Stocks/ETF · MP2 · Time Deposits · Gold) are open-ledger rows under mono group labels; residual `neu()`/`glass` chrome flattened; filters/selects/buttons flat hairline. Values read $0 in sample (no live quotes offline). See "Investments — recomposition" below. |

## Per-screen typography detail (against the approved screenshots)

- **Home → Dashboard.** Page header: mono 500 uppercase title (no bold Inter
  heading). Instrument labels (NET WORTH, INVESTMENTS, TRACKED SPENDING, SAVINGS
  & INVESTING): mono 400 10px uppercase. Financial display: JetBrains Mono
  (net worth, USD 0, PHP remaining). Nav: mono 400/500. ✔ matches.
- **Budget → Budget.** Header mono; NET MONTHLY INCOME / TOTAL ALLOCATED /
  REMAINING mono labels; figures + 100% UTILIZED / % REMAINING mono; ME/MY WIFE
  + ON TRACK mono. ✔ matches.
- **Expenses → Expenses.** NET MONTHLY BURN / DAILY AVG mono labels; burn + `/`
  budget + daily avg + unaccounted mono. ✔ matches; desktop ledger split is the
  open item.
- **Transaction → Transaction.** Full-screen task flow, mono header with
  Close+Clear, Remaining-Budget instrumentation, mono TYPE/AMOUNT/TITLE/CATEGORY/
  DATE/NOTE labels, large mono amount, bottom mono Record action. ✔ matches.
- **Investments → Investments.** Source Serif on the portfolio total only;
  everything else mono. ✔ matches; desktop split is the open item.

## Category B / C (not this pass)

Banks, Net Worth, Forecast (hidden), Goals, Installments, Purchase Advisor,
Bills, Household, Currency, More, Settings, and system overlays inherit the flat
token + mono type system through the shared classes/primitives, but have not
been individually recomposed. Their broadly-shared Inter-600 card-title /
`h3` patterns were intentionally left untouched so half-finished screens don't
get a partial mono conversion mid-pass.

## Known remaining items

- Expenses and Investments **desktop right-column ledger split** not built
  (full-width single column).
- A few `SAR … left` / soft status chips remain rounded/tinted (should be flat
  status text) on Expenses envelope rows.
- Home/Expenses mono hero figures are weight 600 vs Budget/Transaction 500 —
  cosmetic; 600 reads as emphasized.
- Inline editable numeric fields inside Budget rows (`bare tnum`) still render in
  Inter tabular, not mono (they are not tagged `.mono`); the approved rows use
  mono. Low priority.

## Verification results

- Parse check: **PASS** (`node parsecheck.cjs /tmp/pc/node_modules/@babel/standalone`).
- All **25 runners**: **PASS** after the Home/Dashboard overhaul (headertest,
  navtabtest included — the mobile-rail trim to four is a display-time slice in
  `App` and does not touch `navTabsFor`/`NAV_BAR_SIZE`, so both stay green).
- Computed font-family/weight: **PASS** (table above; Home stays JBM-dominant).
- Fonts local, no network dependency: **PASS**.
- `stage.cjs` release guard: not re-run this pass (no font/version change; Home
  overhaul is index.html-only, presentation). Bump BUILD_ID in all three sites
  at deploy time as before.
