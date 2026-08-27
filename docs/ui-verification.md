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

## Banks — recomposition (2026-08-27, Category B, Rounds 1–3)

**Status: Pass.** Banks was ported to the open-ledger language over three review
rounds; verified at **390 + 320 + 430 (Pro Max) + 1600, both themes**, plus the
Update sheet at mobile and the settings panel expanded from a row. Shots in
`artifacts/ui-verification/banks/` (`{430,390,320,1600}-{light,dark}`,
`settings-*`, `updatesheet-*`). All 25 runners + parse green; presentation-only
(no mutator/data/sync diff).

- **Round 1** — flat MetricStrip summary (dominant SAR Total + USD/PHP 2-up +
  per-owner split with square owner markers), owner-grouped flat surfaces, square
  `Status` chips, flattened `UpdateBalanceSheet` + `InterestSettings`.
- **Round 2** — desktop `.split-8-4`: LEFT = summary + toggle + accounts, RIGHT =
  a read-only rail (**Cash availability** spendable/emergency/can't-reach ·
  **Account checkup** needs-confirmation / oldest-confirmed / earning-interest /
  est. 30-day interest · **Currency exposure** footer). Rail values reuse
  `bankValuation`/`bankTierRate`/`dayNumber` (no parallel math; the 30-day
  projection runs `bankValuation` on a today-anchored synthetic copy). Update
  sheet → `sheet-task` (full-screen mobile / bounded desktop). Weights reduced to
  the approved hierarchy (500 names/figures, 600 only tiny mono tags). Toggle
  left-aligned.
- **Round 3 (open-ledger)** — account cards **flattened to hairline rows** (no
  boxes, grouped by owner); **combined identity line** "Account Name · BANK"
  (name primary, bank quieter mono); metadata row **normalized** (currency ·
  country · status · conversion · accrual all one 10px/mono weight; reserved /
  unreachable keep only a coloured square); balance **26 → 16px**; dashed Add
  tiles → **"+ Add account" rows**; **profile selector moved above** Liquid
  Assets; availability + currency **percentages apportioned to total 100**
  (largest-remainder); per-row owner labels removed. Owner-split tiles use a
  small `SAR` prefix + number so they never wrap at ≤390px.

**Intentional differences:** no direct Stitch mockup (Category B) — composed from
the proven primitives. Banks keeps the 3-way `HomeProfileToggle` (needs the
Household/joint view) rather than Budget's 2-way `OwnerToggle`. The Update sheet
keeps the ADD/SUBTRACT/SET colour cue on its segmented control. `heroBg` dark
hero was dropped in favour of the flat MetricStrip.

## Net Worth — recomposition (2026-08-27, Category B)

**Status: Pass.** Net Worth was ported to the open-ledger language following the
Banks precedent; verified at **390 + 320 + 430 (Pro Max) + 1600, both themes**,
across the **Me / My wife / Household** scope views plus the expanded
asset-editing panel. Shots in `artifacts/ui-verification/networth/`
(`{430,390,320,1600}-{light,dark}`, `{1600,390}-light-me`,
`{1600,390}-light-expanded`). All 25 runners + parse green; presentation-only
(no calc/data/mutator/sync diff — `NetWorthView` + `AssetRow` markup only).

- **One card only.** Per the open-ledger rule (only the hero is a bordered
  surface), the summary is the tab's **single** `GridSection`; Composition, Net
  worth trend, and What's driving it are **open sections** (mono `.t-section`
  label + hairline content, no box), matching the rail modules.
- **Summary** — the filled neumorphic hero was replaced by a flat `GridSection`
  MetricStrip: dominant **Total** in the display currency + secondary
  conversions 2-up, with the Combined-only "since last snapshot" delta as a
  `Status` line. Scope toggle (`HomeProfileToggle`) moved **above** the summary,
  left-aligned; the joint-records caption sits under it in a person view.
- **Display currency follows Home** (`homeDisplay.netWorth.primary` +
  `.secondary`, the same config `HeroCard` reads — PHP primary in sample data).
  All derived figures — total, delta, composition, growth, milestone — are
  computed in SAR then converted via `convert()` and formatted "CODE 1,234"
  (Home's style); secondary tiles show the remaining configured currencies.
  **Per-item asset/liability rows keep their OWN stored currency** (a PHP loan
  reads PHP), like Banks account rows — only the derived totals convert. The
  **monthly snapshot log stays SAR** (its `history` rows are stored SAR and its
  "Add entry" input writes SAR — converting it would risk writing in the wrong
  unit; the input is labelled `(SAR)`).
- **Composition** — flat segmented bar (no `liquid-fill` gradient) + hairline
  legend; the three asset **percentages total 100** (largest-remainder
  `pctInts`); liabilities render as a signed coral line (not a % of gross).
- **Trend + What's driving it** — the two existing range charts
  (`HistoryRangeChart` / `CompositionRangeChart`) are reused unchanged inside
  open sections.
- **Assets & Liabilities** — `AssetRow` rebuilt as **row-expand** open-ledger
  rows: collapsed line = name · owner + signed value; tapping reveals the edit
  fields (name / owner / currency / value or the liability installment sub-form,
  its progress bar → `ProgressMeter`) below the row. Big "Add" tiles →
  **"+ Add asset/liability" rows**.
- **Desktop `.split-8-4`** — LEFT = summary + composition + trend + driving;
  RIGHT rail carries two **new read-only derived modules** — **Growth**
  (since-last / since-first + % / avg-per-month, over per-profile daily
  snapshots) and **Next milestone** (next round-number target + `ProgressMeter`
  + "CODE X to go") — plus the assets/liabilities ledger and the monthly snapshot
  log. Rail stacks below the charts on mobile. Milestone is computed in the
  display currency and rescales per profile (next PHP 2,000,000 for the combined
  view in sample data).

**Milestone celebration (sticky achievement memory, added on review).** The
"Next milestone" module gained a restrained celebration: a **close nudge**
("Almost there — CODE X to go", ≥95% "So close", meter goes success-green) only
when `pct >= 85`, and a persistent **reached trophy** — `🎉 Reached CODE V ·
Mon YYYY`, warming to `🎉 Just reached CODE V!` within ~14 days — mirroring the
app's only celebratory precedent (the lone `🎉` on "All goals completed"). It
reads a NEW synced per-profile map **`data.netWorthMilestones`** (`{me,wife,
household}` → `{v,ccy,at,updatedAt}`), stamped like `trimPolicy`/`navTabs` but
**merged max-per-key** (`mergeMilestones`, sticky/highest-ever, commutative). A
debounced `App()` effect detects a new all-time-high off `netWorthParts(pf)` in
the display currency and writes it through **`setData`** (a real, sync-worthy
edit — not the snapshot effect's `setDataRaw`), monotonic + no-op-guarded so a
mere re-open never dirties. Backfill is silent (calm badge, not a toast).
Verified in-browser: household → "Just reached PHP 1,000,000", Me → "Just
reached PHP 250,000" (per-profile), light + dark. Covered by **`milestonetest.cjs`**
(new committed runner, 19 cases). This is the one part of the Net Worth work
that is **NOT presentation-only** — a synced field + merge + effect + test.
**Sandbox sync check passed** (the mandatory `sandboxworker.cjs` POST-watch for
any sync change): a real asset crossing a rung wrote the milestone, the autosave
**POSTed it** (payload carried `netWorthMilestones`), and it **survived the
conflict merge** the sandbox returns — bounded to 2 POSTs (conflict-retry
artifact), no write-storm.

**Intentional differences:** no direct Stitch mockup (Category B) — derived from
the Dashboard net-worth hero/trend + Investments allocation/ledger. Keeps the
3-way `HomeProfileToggle` (needs the Household/joint view). **Milestones are
anchored in the display currency (PHP), not SAR** (user chose round, motivating
targets): SAR is USD-pegged and PHP floats, so a pure FX swing can nudge you
across a milestone without new saving and — being sticky — it stays earned.
Accepted diff, chosen deliberately over FX-purity; do not "fix" it to SAR. No
filled `heroBg`
hero (flat MetricStrip, per the Banks decision). Snapshot log stays
**household-wide AND in SAR** (its `history` rows are stored SAR and its input
writes SAR). **Growth**, the **trend/driving charts**, and the composition
**Investments** row show empty / `0` states with sample data offline — no
multi-day snapshots or live quotes exist there (data-limited, verified by code +
parse, consistent with Home).

## Goals — recomposition (2026-08-27, Category C)

**Status: Pass.** Goals was the most-behind screen (hand-rolled neumorphic 148px
tiles with SVG progress rings, split into stacked me/wife grids, three separate
modals, no aggregate). Ported to the open-ledger language following the Banks /
Net Worth precedent; verified at **390 + 320 + 430 + 1600, both themes**, across
**Me / My wife / Household**, plus the add-money sheet, the details sheet, a
dated-goal rail, and the empty state. Shots in `artifacts/ui-verification/goals/`
(`{1600,390}-{light,dark}`, `430-light`, `320-light`, `me-1600-light`,
`wife-390-light`, `dated-rail-1600`, `add-sheet`, `details-sheet`, `empty`). All
26 runners + parse green; **presentation-only** (`GoalsView` + the new `GoalRow`
markup + the two sheets — no calc/data/mutator/sync/undo diff; `goaltest.cjs`
43/43).

- **One card only.** The summary is the tab's **single** `GridSection`; the goal
  ledger and all three rail modules are **open sections** (`.t-section` label +
  hairline rows).
- **Scope = shared synced `profile`.** `HomeProfileToggle` (Me / My wife /
  Household) sits **above** the summary; `GoalsView` now takes `profile` +
  `setProfile:setProfileSynced` (the one mount-site prop change), so scope
  persists across tabs exactly like Banks / Net Worth. Goals store owner me|wife
  only — **Household is the view-only union** (`g.owner==="me"||"wife"`); each
  owner group's "Add goal" writes to a real person, never `addGoal("household")`.
- **Hero answers "how much have I saved?":** a `Verdict` line derived from the
  overall funded % (flat "No goals yet" → warn "N goals behind" → good "On
  pace"), a **`MetricBlock hero`** Total saved (small `SAR` prefix + narrow
  figure, `remaining` as its sub — avoids the 24px-mono column clip at 320/390),
  then a 2-up `MetricStrip` of Active / Completed counts.
- **`GoalSquare` → `GoalRow`** (module-scope, top-level for input focus): a flat
  **two-line** hairline row — line 1 = type icon + inline name + saved/target;
  line 2 = `ProgressMeter` + type/deadline verdict + `[Add]`/`[Details]`. Two
  lines so a long name keeps full width at 320 (single-line crushed it to
  "Emer"). Meter colour + verdict reuse `goalDeadlineStatus` (done/on-track →
  jade, behind → info, overdue → coral). Household groups rows by owner via
  `.ledger-group`; single scope is flat. Reached goals fold into a collapsed
  **Completed** `.ledger-group` keyed by scope.
- **Desktop `.split-8-4`** — LEFT = toggle + hero + ledger; RIGHT rail carries
  three **new read-only derived modules**, all reusing `goalSavedTotal` /
  `goalDeadlineStatus` (no parallel reduces): **Portfolio progress** (Σ saved / Σ
  target + overall `ProgressMeter`), **Monthly commitment** (Σ required vs Σ
  committed over DATED goals + `Status` surplus/shortfall), **On-track vs
  at-risk** (partition dated goals, list at-risk by name + date + needed/mo).
  Undated goals (no `deadline` — `goalDeadlineStatus` returns null) are
  **excluded** from the two deadline modules with a "N goals undated" footnote;
  Portfolio progress is the only module that counts them. Rail stacks below on
  mobile.
- **Sheets flattened to `.sheet-task`** (Portal + scroll-lock kept): **Add money**
  (amount + note + live preview + disabled-until-valid foot) and **Details**
  (NumField target/monthly, date + owner-scoped bank select, pace/deadline
  verdict, contributions list). The standalone **type picker modal was folded
  into Details** as a selector grid (3 modals → 2); goal **delete** moved into
  the Details foot.

**Intentional differences:** no direct Stitch mockup (Category C) — derived from
the open-ledger language. Keeps the 3-way `HomeProfileToggle` (needs the
Household union view). All figures use the app's `fmt` (SAR in sample) rather
than a per-item stored currency (goals carry no currency; money lives in the
linked bank). With sample data all three seed goals are **undated**, so the two
deadline rail modules show their empty state + "3 undated" footnote until a
target date is set (verified populated in `dated-rail-1600`: setting a future
date flips the hero to "1 goal behind", the row to "BEHIND · NEEDS …/mo", and
the rail to "SHORTFALL …/mo" + an at-risk entry).

## Typography flip — monospace as primary (2026-08-27)

**Status: Pass.** JetBrains Mono became the app-wide default (`body`); Inter is now
the exception (`.sans`) for prose only. Verified across **every major screen at
1600 + 390, light + dark** (shots in `artifacts/ui-verification/typography/`).
Browser probe confirmed `getComputedStyle(body).fontFamily` = JetBrains Mono and
`document.fonts.check('bold 16px "JetBrains Mono"')` = true (JBM 700 loaded, no
synthetic bold). Zero console errors; parse + all 26 runners green; `node stage.cjs`
passes.

- **Flip:** `body` default Inter→JetBrains Mono. Names, buttons, status pills, and
  the 28 `fontFamily:"inherit"` form-control corrections all inherit mono for free.
- **Prose → `.sans` (Inter):** `Verdict` (component-level, covers all), dialog
  bodies, empty-states, chart empty-text, helper/freshness/error sentences —
  ~64 sites. Confirmed sans/readable on screen (e.g. Investments "Allocation
  appears once you add holdings.", "Portfolio value split by account type over
  time."; Home verdicts).
- **Serif folded:** the one Source Serif figure (Investments portfolio total) is
  now mono **700** — the app's heaviest weight, the single headline number. Source
  Serif 4 removed (`@font-face`, `.serif`, `SERVED`, `APP_SHELL`).
- **Casing unchanged:** structural labels/metadata stay UPPERCASE; names/controls
  stay mixed case — only the family flipped.
- **Known minor:** Budget's dense single-line category rows at 390 clip long names
  slightly more (mono is ~10% wider than Inter) — pre-existing row density,
  editable inputs, not a blocker. Goals' two-line rows + every other screen render
  names fully.

## Expenses envelope-row declutter (2026-08-27)

**Status: Pass.** The three always-visible per-row actions (Add to / Add extra
funds / Add remaining from last month) crowded the row on mobile. Now the whole
envelope header is the expand toggle; a **collapsed row shows only name · group ·
meter · spent/left** (zero buttons), and tapping it reveals a compact
`+ Add · Top up · Carry over {amount}` bar above the transaction list. Labels
shortened; **Carry over appears only when a name-matched prior-bucket category has
non-zero leftover** (same basis `CarryoverSheet` uses). JSX-only in
`ExpenseTrackerView` — handlers/sheets/data unchanged. Verified at 390 + 1600,
light + dark (`artifacts/ui-verification/expenses-declutter/`): collapsed rows
calm, expand reveals the actions + txns, no old long labels remain, zero console
errors, parse + 26 runners green.

## Verification table

| Screen | Mobile (390) | Desktop (1600) | Stitch reference | Status | Remaining differences |
| --- | --- | --- | --- | --- | --- |
| Home | ✓ | ✓ | Dashboard (A) | **Pass** | Card titles + net-worth/spending figures are mono; scope switch mono; sidebar mono 400/500. Verdict lines stay Inter (deliberate emphasis). No desktop side-ledger deviation — the dashboard grid is metric modules, matching Stitch. |
| Budget | ✓ | ✓ | Budget (A) | **Pass** (recomposed 2026-08-26) | Rebuilt to the Stitch composition: desktop **8/4 split** (envelope ledger LEFT · ALLOCATION SUMMARY rail RIGHT, one vertical rule); flat "Budget overview" header + period control; responsive **3-column metric strip** (income · allocated · remaining) with vertical hairlines + utilization ruler; **open-ledger groups** (mono uppercase group labels, hairline rows, per-row relative-size ruler); mono amounts throughout. See "Budget — recomposition" below. |
| Expenses | ✓ | ✓ | Expenses (A) | **Pass** (recomposed 2026-08-26) | Rebuilt to the Stitch composition: desktop **8/4 split** (overview + envelope utilization LEFT · "Recent activity" transaction ledger RIGHT, one vertical rule — the previously-missing split now built); flat "Technical overview" header + period control; **burn \| daily-avg metric strip** with vertical rule; **open-ledger envelope rows** (`.env-item`, flat `ProgressMeter` ruler + even-pace tick, mono spent/left, flat tags); untracked transfers + transaction log flattened. See "Expenses — recomposition" below. |
| Add/Edit Transaction | ✓ | ✓ | Transaction (A) | **Pass** | Full-screen TaskSurface reflowed to **connected left-label field rows** (`.tx-field`, mono label left / borderless value right / hairline-divided) in Stitch order AMOUNT · TITLE · CATEGORY · DATE · NOTE; mono header (Close / ADD TRANSACTION / Clear), REMAINING-BUDGET context row, TRACKED/UNTRACKED/GOALS segmented, prominent mono amount, pinned green RECORD. Required-empty validation = red field label + dimmed RECORD. Desktop = bounded centered canvas (≤600px), not Stitch's full-bleed console. All flows preserved. See "Add/Edit Transaction — recomposition" above. |
| Banks | ✓ (390 · 320 · 430) | ✓ | Derived (B) | **Pass** (recomposed 2026-08-27, Rounds 1–3) | Open-ledger: owner-grouped **hairline account rows** (no boxes), identity line "Name · BANK", normalized 10px/mono metadata with coloured status squares, 16px balances, "+ Add account" rows, inline row-expand for edit/interest/delete. Toggle **above** the flat MetricStrip summary (Total + USD/PHP + owner split). Desktop **8/4 split** with a read-only **Cash availability + Account checkup + Currency exposure** rail (reuses `bankValuation`/`bankTierRate`; %s total 100). `UpdateBalanceSheet` → `sheet-task` (full-screen mobile / bounded desktop). See "Banks — recomposition" above. |
| Net Worth | ✓ (390 · 320 · 430) | ✓ | Derived (B) | **Pass** (recomposed 2026-08-27) | Open-ledger: **one** bordered card (the summary MetricStrip — Total in the display currency + secondary conversions + Combined delta as `Status`); Composition / trend / driving are **open sections**. Scope toggle **above**; flat composition bar + legend (%s total 100, liabilities signed coral); two existing range charts reused unchanged; `AssetRow` → **row-expand** hairline rows (name · owner + signed value → tap reveals edit fields, item keeps its own currency); "+ Add asset/liability" rows. **Display currency follows Home** (`homeDisplay.netWorth`, PHP in sample) for all derived totals; snapshot log stays SAR. Desktop **8/4 split** with a read-only rail: **Growth** · **Next milestone** (display-currency) · assets/liabilities ledger · monthly snapshot log. Growth/trend/composition-investments show empty/`0` offline (data-limited). See "Net Worth — recomposition" above. |
| Goals | ✓ (390 · 320 · 430) | ✓ | Derived (C) | **Pass** (recomposed 2026-08-27) | Open-ledger: **one** bordered card (hero — funded-% `Verdict` + `MetricBlock hero` Total saved w/ remaining sub + 2-up Active/Completed strip). `GoalSquare` tiles/SVG rings → flat **two-line `GoalRow`s** (icon + name + saved/target; meter + type/deadline verdict + Add/Details), owner-grouped under Household via `.ledger-group`, flat under a single owner; collapsed **Completed** group. Scope toggle **above** (shared synced `profile`; Household = me∪wife union, adds write to a real person). Desktop **8/4 split** with a read-only rail: **Portfolio progress** · **Monthly commitment** · **On-track vs at-risk** (all reuse `goalSavedTotal`/`goalDeadlineStatus`; undated goals excluded from the two deadline modules + footnoted). Add-money + Details → `.sheet-task`; standalone type picker folded into Details (3 modals → 2). See "Goals — recomposition" above. |
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

## Category B / C (remaining)

**Banks and Net Worth are now recomposed** (2026-08-27, see above). Still not
individually recomposed: Forecast (hidden), Goals, Installments, Purchase
Advisor, Bills, Household, Currency, More, Settings, and system overlays. They
inherit the flat token + mono type system through the shared classes/primitives,
but their broadly-shared Inter-600 card-title / `h3` patterns were intentionally
left untouched so half-finished screens don't get a partial mono conversion
mid-pass. **Goals is next** (shares the `ProgressMeter` + rail patterns).

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
