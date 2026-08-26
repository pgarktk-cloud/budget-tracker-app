# UI audit and Stitch implementation handoff

## Scope and baseline

Audit date: 2026-08-26. No application UI was changed.

- Latest committed/live baseline: v1.51.0, build `2026.08.14.0010`, commit
  `cc9b2d3` documenting deployed app commit `b8eb079`.
- Frontend: one React 18/Babel/Recharts document, `index.html`; no build step,
  URL router, or component files. `App()` switches internal tab state.
- Persistence: one migrated document in localStorage with optional Cloudflare
  Durable Object sync; `sw.js` caches the PWA shell. A redesign must not change
  financial semantics, stored shapes, sync behavior, or sheet safety patterns.
- Current styling: CSS plus extensive inline styles, semantic palette object
  `P`, shared `neu*`/glass helpers, max-width 920px app column, six-cell fixed
  bottom bar, top-aligned portalled sheets, and light/dark themes.
- Verification: all 25 committed pure/source runners pass. Parse-check was not
  rerun because its non-vendored Babel dependency is absent; no executable code
  changed.

Evidence inspected: `CLAUDE.md`, `docs/current-status.md`, the five redesign
briefs under `docs/stitch-redesign/`, all `index.html` views/shared components,
and every file under `stitch-reference/`. The older
`docs/stitch-redesign/screenshots/` images document the pre-redesign UI; they
are not approved visual references.

## Stitch inventory and interpretation

Approved references are paired mobile/desktop screenshots for Dashboard,
Budget, Expenses, Investments, and Add Transaction (10 screenshots). Each has a
supporting static `code.html`. `technical_ledger/DESIGN.md` is the Stitch project
brief/token ledger. There are no exported local components or asset files;
exports reference remote fonts, Material Symbols, and placeholder portrait URLs.

The screenshots are authoritative. Generated code is useful for approximate
dimensions and tokens only: it contains inconsistent sample branding
(`WHERE'DITGO`, `FIN_CONSOLE`, `FINANCE_CONSOLE`), currencies, active navigation,
and desktop/mobile type choices. Preserve product content and normalize those
variations through `docs/design-system.md`.

## Screen inventory and coverage

Coverage: **A** = direct approved screen; **B** = a substantial part is shown in
another approved screen; **C** = no approved screen for the workflow.

| App state / component | Access | Coverage | Closest approved reference |
| --- | --- | --- | --- |
| Home / `HomeView` | default tab | A | Dashboard mobile + desktop |
| Budget / `BudgetView` | default/custom tab | A | Budget mobile + desktop |
| Expenses / `ExpenseTrackerView` | default/custom tab | A | Expenses mobile + desktop |
| Add/Edit transaction | Expenses/FAB sheet | A | Transaction mobile + desktop |
| Investments / `InvestmentsView` | default/custom tab | A | Investments mobile + desktop |
| Banks / `BanksView` | default/custom tab | B | Dashboard investments, transaction source account, investment ledger |
| Net Worth / `NetWorthView` | More/custom tab | B | Dashboard net-worth hero/trend; investment allocation |
| Forecast / `TargetsView` | hidden, code-only | B | Investments desktop projection model |
| Goals / `GoalsView` | More/custom tab | C | Budget utilization rows + investment ledger |
| Installments / `InstallmentsView` | More/custom tab | C | Investment ledger + transaction task form |
| Purchase Advisor / `PurchaseAdvisorView` | More/custom tab | C | Transaction task form + budget metric/progress modules |
| Bills / `BillsView` | More/custom tab | C | Expenses activity/envelopes + budget metric strip |
| Household / `HouseholdView` | More/custom tab | C | Dashboard metric modules + budget allocation rows |
| Currency / `CurrencyView` | More/custom tab | C | Transaction form grid + metric blocks |
| More / `MoreSheet` | bottom navigation | C | Mobile bottom nav and desktop sidebar |
| Settings / `SettingsModal` | global header | C | Transaction task surface/form grid |
| Sync, connect/conflict, pending/deleted, import, profile dialogs | global overlays | C | Transaction task surface + shared status language |

There are no URL routes. `PRIMARY_TABS`, `MORE_TABS`, `HIDDEN_TABS`, `TAB_META`,
`navTabsFor`, and `moreTabsFor` are the route/navigation contract. Do not make
hidden Forecast visible or reduce the customizable bar without a product change.

### Existing component families to retain behind new primitives

- Shell: `App`, `BottomNav`, `MoreSheet`, `TabPane`, `Portal`.
- Shared behavior: `NumField`, `IconButton`, `ConfirmDialog`, scroll-lock and
  dialog-a11y hooks.
- Visualization: `Verdict`, `ProgressRing`, `Sparkline`, `HistoryRangeChart`,
  `CompositionRangeChart`.
- Home: `HeroCard`, `PortfolioCard`, `SavingsInvestingCard`,
  `TrackedSpendingCard`, trend cards, `GoalsSummaryCard`, quick-action sheets.
- Domain rows/forms: owner toggles, bank/account cards, investment account
  variants, goal/installment cards, purchase comparison/trim sheets.
- System overlays: Settings, Sync, connect/conflict, pending changes, recently
  deleted, import preview, profile picker, and undo toast.

## Global fixes first

| Area | Current inconsistency | Global correction |
| --- | --- | --- |
| Fonts | System sans + Iowan/Georgia; tabular variant without a true mono family | Load Inter, Source Serif 4, JetBrains Mono and expose only the roles in the design system |
| Palette | Blue-gray canvas/navy heroes and many legacy accents | Adopt cream/white/ink plus semantic jade/coral/blue; keep semantic dark tokens separate |
| Surfaces | `neu`, `neuInset`, glass panels, 14-24px radii, nested shadows | Replace presentation with `GridSection`, hairlines, 0-4px radii, no content shadow |
| Layout | Entire app capped at 920px; desktop is an enlarged mobile page | Add responsive `AppShell`: 256px desktop sidebar, 64px top bar, 12-column main grid |
| Header | Wordmark, sync, Settings, owner line, editable-context income, then a second page title | One page-aware header; move income/context into page metrics; retain one sync entry and Settings |
| Navigation | Full-width glass bottom bar on all widths; six tiny labeled cells | Stitch-style bordered mobile bar; desktop sidebar; preserve five customizable tabs + More |
| Profile/owner controls | Rounded sliding pill controls vary by view | One rectangular `ScopeSwitch`; keep household unavailable where the domain is owner-only |
| Metrics | Ad hoc hero/card typography and multiple competing focal points | Reuse `MetricBlock/Strip`; one Source Serif hero, mono supporting numbers |
| Lists | Most records are independent raised cards with custom internal layouts | Reuse continuous `LedgerTable/Row` with aligned columns and mobile row reduction |
| Progress | Rings, liquid gradients, inset tracks, segmented bars all compete | One 4-8px technical meter with marker, number, and textual state |
| Controls | Pills and one-off buttons/radii/colors; many inline field layouts | Shared primary/secondary/destructive buttons and hairline `FieldRow`; preserve `NumField` behavior |
| Icons | Custom icons vary in size/stroke; Stitch exports rely on remote symbols | Keep local SVGs but normalize size/stroke/touch target; never depend on remote placeholder assets |
| Overlays | Glass top sheets for nearly every task | Shared `TaskSurface/Overlay`: full-screen mobile for multi-field tasks, bounded desktop canvas/dialog |
| States | Offline/stale/error/empty messages use unrelated card/pill treatments | Shared inline `Status` and state panel with icon + explicit text; retain all existing state logic |
| Responsive behavior | Mostly auto-fit cards inside the same centered column | Define mobile stacking and desktop grid spans per primitive, not per screen |
| Motion | Page and list entry animations are pervasive | Keep short state/navigation transitions only; honor reduced motion |

Most drift originates in `P`, global CSS, `neu*`/`glassPanel`, the App header,
and repeated inline card/row styles. Fixing those through shared primitives will
remove more inconsistency than rewriting view markup independently.

## A/B screen findings

### Home — A

- Current Home is a stack/grid of rounded cards; Stitch is a connected desktop
  instrument grid and full-width mobile sections. The dominant net-worth trend
  should own the first visual zone rather than compete with every summary.
- Move profile scope into the hero/PageBar pattern. Remove header income from
  the shell and keep it as a linked budget metric where relevant.
- Recompose existing net worth, spending, portfolio, savings, goals, and trend
  data into metric modules; keep `Verdict` meaning but restyle it as technical
  status, not a filled pill/card.
- Desktop needs meaningful horizontal allocation; current 920px composition
  leaves Stitch's side-by-side budget and investment summaries unavailable.

### Budget — A

- Replace raised income/allocation/group cards with one metric strip and a
  continuous envelope ledger. Current curved group cards, inset fields, liquid
  allocation bar, and floating controls conflict with every Stitch surface rule.
- Desktop should use an 8/4 content/summary split; mobile should stack income,
  allocated/target, owner switch, then grouped envelope rows.
- Preserve copy-on-write month plans, inline editing, group/category operations,
  installment-derived rows, and sticky group context. Put uncommon edit/move/
  delete actions behind row disclosure instead of crowding the scan path.
- Normalize date picker, owner switch, status, percentages, and progress through
  shared controls. Do not copy Stitch's sample envelope taxonomy.

### Expenses — A

- Current navy hero and raised envelope cards should become the approved burn/
  daily-average metric grid plus flat utilization rows.
- On desktop, place recent activity/transaction history in the right ledger
  column. On mobile, keep it below utilization with the same row primitive.
- Preserve pay-period navigation, planned-vs-actual reconciliation, untracked
  transfers, extra funds, filters, reordering, and expandable history; expose
  secondary controls via the PageBar/row disclosure.
- Use one progress/status treatment. Current card-specific left boxes, pills,
  and dark hero introduce a second visual system.

### Add/Edit transaction — A

- The approved mobile flow is full-screen with a 64px header, connected field
  rows, amount-first hierarchy, and bottom commit action; current UI is a small
  translucent sheet with rounded fields and muted disabled buttons.
- Desktop should use the task canvas: summary metrics, prominent amount,
  classification, form fields, recent items, and commit region. Do not add a
  source-account relationship unless the product/data model supports it.
- Keep Tracked/Untracked/Goals, repeat/shortcut chips, quick transfer, extra
  funds, rapid entry, and edit behavior; map them to type/classification and
  progressive sections rather than deleting them to match static sample copy.

### Investments — A

- Current type sections are raised account cards; Stitch uses a portfolio metric,
  allocation meters, a holdings ledger, and a desktop 6/6 analysis split.
- Use actual Stocks/ETF, MP2, Time Deposit, and Gold types rather than Stitch's
  crypto/cash placeholders. Make account type and freshness explicit ledger
  metadata; use aligned values/units/returns.
- Keep trade history, live-price status, MP2 rates/contributions/payouts, time-
  deposit maturity/transfer, Gold valuation, and projection. Render their forms
  with `TaskSurface` rather than one-off glass sheets.
- Consolidate duplicate trend/composition presentation into the shared chart and
  meter language; remove raised filter/settings pills.

### Banks — B

- The current wallet-pass metaphor, colored ownership strips, pills, and
  expandable inset settings do not match Stitch's flat account/holding rows.
- Lead with a liquid-assets metric strip, then an owner-grouped account ledger.
  Use the transaction task pattern for Update Balance and progressive row detail
  for bank, currency, ownership, purpose/accessibility, and interest settings.

### Net Worth — B

- Current hero, composition, trends, asset cards, and snapshot log all use
  separate raised surfaces. Reuse Dashboard's net-worth hero/trend and
  Investments' allocation + ledger structure.
- Desktop: history/composition in the main grid, assets/liabilities and snapshot
  actions in the side ledger. Mobile: summary, composition, trend, then rows.

### Forecast (hidden) — B

- Current target tiles and edit sheets conflict with the flat investment
  projection module. Reuse its chart, confidence/assumption metadata, metric
  rows, and TaskSurface fields.
- Keep it hidden and preserve stored target data; redesigning it is lower
  priority than reachable screens.

## Category C extrapolation

These screens must be compositions of approved primitives, not new visual
concepts.

| Screen | Use these approved patterns | Screen-specific guidance |
| --- | --- | --- |
| Goals | Budget grouped utilization + Investments ledger | One goal summary/pace metric, then owner-grouped progress rows; completed goals remain a collapsed ledger section; contribution/detail use TaskSurface |
| Installments | Investments holdings ledger + Transaction form | Summary strip for due/remaining/overdue; sections become ledger groups; schedule/payment/payoff/edit use one task-form family |
| Purchase Advisor | Transaction task flow + Budget metrics/rows | Lead with purchase inputs, then available-cash metric and one recommended verdict; cash/finance/save alternatives become aligned scenario sections and comparison ledger; keep preview/apply/undo and progressive disclosure |
| Bills | Expenses burn/activity + Budget metric strip | Reserve and month totals form the metric strip; bills are status rows with allocated/paid/remaining columns; adjustment/history are task/detail regions |
| Household | Dashboard metrics + Budget allocation | Show total and two partner shares as a metric/allocation module; recurring expenses are editable ledger rows; keep Bills tracking state explicit |
| Currency | Transaction form + instrument metrics | From/amount/to form grid followed by one conversion hero; rates/freshness become small technical rows; refresh is a PageBar action |
| More | Mobile nav + desktop sidebar | Mobile uses flat bordered destination rows; desktop routes already live in the sidebar, so avoid a second floating card menu |
| Settings | Transaction task surface/form grid | Full-screen mobile and bounded desktop settings surface; retain closed-by-default sections, sticky heading, nested-dialog safety, sync diagnostics, backups, navigation editor, and appearance/pay-period controls |
| System overlays | Transaction task surface + semantic Status | Use one dialog frame and state vocabulary for sync, offline, conflict, pending changes, deleted items, import, profile choice, confirmation, and undo; destructive choices remain explicit |

## Recommended implementation order

1. Add semantic color/type/spacing/layout tokens and real fonts; keep data and
   feature code untouched.
2. Build the shared primitives in `docs/design-system.md`, including state and
   responsive variants. Retain `NumField`, portals, scroll lock, focus, and
   dialog accessibility behavior.
3. Replace the global shell: desktop sidebar/top bar, mobile header/nav/FAB,
   profile switch, and page/date bars. Preserve `TAB_META` and customized nav.
4. Convert Home, Budget, Expenses, Add Transaction, and Investments against
   their direct mobile and desktop screenshots.
5. Convert Banks, Net Worth, and hidden Forecast using their partial references.
6. Compose the Category C screens from the now-proven primitives, starting with
   frequent/financially important flows: Purchase Advisor, Goals, Installments,
   Bills, Household, Currency, then Settings/system overlays and More.
7. Validate at 320/390/768/1024/1600px, light/dark, reduced motion, safe areas,
   empty/partial/sample data, offline/sync/stale/error states, keyboard/focus,
   long labels, large/negative values, and all 25 runners plus browser checks.

## Claude handoff

Start with tokens and shell, not a page rewrite. Introduce presentational
primitives around existing calculations/mutators, then migrate one direct-
reference screen at a time. Compare at the exact approved screenshot widths,
but keep real content and responsive behavior. Do not paste Stitch HTML, import
its remote avatar URLs, replace React architecture, expose Forecast, or alter
stored/sync behavior as part of the visual work.
